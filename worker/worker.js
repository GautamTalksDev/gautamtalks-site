/**
 * GAUTAM TALKS · signup worker
 * Cloudflare Worker + D1. Stores emails privately in YOUR database.
 * Deploy: see worker/README.md
 *
 * Security posture:
 *  - strict CORS allowlist (only your domains may call it)
 *  - Turnstile captcha verification (bot wall, privacy-friendly)
 *  - honeypot + submit-timing check (kills naive spam bots)
 *  - per-IP rate limiting via KV (IPv6 limited per /64), plus a per-inbox mail cap
 *  - email validated; mail goes to the address as typed, and an alias-folded form
 *    is used only for the SHA-256 de-duplication hash
 *  - same response, same timing and same quota use for new, pending, confirmed
 *    and capped addresses: the address-dependent work runs after the answer
 *    (ctx.waitUntil), so the form cannot be used to test who is on the list
 *  - Turnstile fails closed, must be solved on gautamtalks.com, by the signup
 *    widget (action "subscribe")
 *  - double opt-in token (CASL/GDPR: express consent required in Canada)
 *  - no PII written to logs, ever
 */

const ALLOWED_ORIGINS = new Set([
  "https://gautamtalks.com",
  "https://www.gautamtalks.com",
]);
// Turnstile reports where the challenge was solved. A token solved on any other
// site (a farm, a clone of the page) is rejected.
const ALLOWED_HOSTNAMES = new Set(["gautamtalks.com", "www.gautamtalks.com"]);
// The signup widget is rendered with this action (data-action on #turnstileBox in
// hub/index.html, passed by hub/hub.js), and siteverify reports it back. A token
// minted by any other widget or action under the same site key is rejected.
const TURNSTILE_ACTION = "subscribe";

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "vary": "Origin",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "permissions-policy": "geolocation=(), microphone=(), camera=()",
    },
  });

const sha256 = async (s) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

// RFC-pragmatic validation. Length caps prevent abuse.
const validEmail = (e) =>
  typeof e === "string" &&
  e.length <= 254 &&
  /^[^\s@,;:<>"'()\[\]\\]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e);

// Alias-proof normalization. Prevents one person taking many "different" slots
// with plus-tags (you+1@), dots (y.o.u@gmail), or provider-equivalent domains.
const GMAILISH = new Set(["gmail.com", "googlemail.com"]);
const DOT_INSENSITIVE = new Set(["gmail.com", "googlemail.com"]);
// The address exactly as typed, with only the domain lowercased. Mail goes HERE.
// normalize() below is only an identity for de-duplication: stripping a plus-tag
// is not safe for delivery, because on many servers "a+b@" and "a@" are different people.
const typedAddress = (raw) => {
  const e = String(raw || "").trim();
  const at = e.lastIndexOf("@");
  return at < 1 ? e : e.slice(0, at) + "@" + e.slice(at + 1).toLowerCase();
};

const normalize = (raw) => {
  let e = String(raw).trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (GMAILISH.has(domain)) domain = "gmail.com";
  local = local.split("+")[0];                 // strip plus-tag on every provider
  if (DOT_INSENSITIVE.has(domain)) local = local.replace(/\./g, "");
  return `${local}@${domain}`;
};

// Throwaway-inbox domains: a newsletter list full of these is worthless.
const DISPOSABLE = new Set([
  "mailinator.com","guerrillamail.com","10minutemail.com","tempmail.com",
  "throwawaymail.com","yopmail.com","trashmail.com","sharklasers.com",
  "getnada.com","temp-mail.org","fakeinbox.com","maildrop.cc","dispostable.com"
]);

async function verifyTurnstile(token, ip, secret) {
  // Fail closed. A missing secret used to switch the bot wall off silently.
  if (!secret) {
    console.log(JSON.stringify({ task: "subscribe", error: "turnstile_secret_missing" }));
    return false;
  }
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    if (!r.ok) return false;
    const out = await r.json();
    return out !== null && typeof out === "object" &&
      out.success === true &&
      ALLOWED_HOSTNAMES.has(out.hostname) &&
      out.action === TURNSTILE_ACTION;
  } catch {
    return false;
  }
}

// Two-tier limiter.
//  - burst:  6 requests / 5 min   (stops rapid hammering)
//  - signup: 8 accepted signup requests / 6 h per network (stops list stuffing)
// Failed validation does NOT consume signup quota, so honest people retrying a
// typo are never punished. Every request that passes validation and Turnstile
// DOES, whatever state its address is in: if only real sends counted, "use 7,
// submit a target, submit one more" would reveal whether the target is on the list.
const RL = {
  burst:  { max: 6, ttl: 300,   prefix: "b:" },
  signup: { max: 8, ttl: 21600, prefix: "s:" },
};

// Per-address cap: no inbox receives more than 3 confirmation emails per 6 hours,
// however many networks the requests come from (stops using the form to mail-bomb
// someone, which would also burn the sending domain's reputation).
const MAIL_CAP = { max: 3, ttl: 21600, prefix: "m:" };

// Pause between sending the /subscribe answer and starting the address-dependent
// work (see processSignup). The confirmation email leaves this much later.
const ANSWER_FIRST_MS = 100;

// Retention for unconfirmed signups. The privacy page promises "never kept longer
// than 30 days"; 29 days plus the hourly cron leaves a margin of almost a day.
const UNCONFIRMED_PURGE_MS = 29 * 24 * 3600 * 1000;

// One IPv6 client usually controls a whole /64, so IPv6 is limited per /64.
function ipBucket(ip) {
  if (!ip.includes(":")) return ip;
  const v4 = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/); // IPv4-mapped, e.g. ::ffff:192.0.2.1
  if (v4) return v4[1];
  const [head, tail] = ip.toLowerCase().split("%")[0].split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined
    ? h
    : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":") + "::/64";
}

async function ipKey(env, ip, prefix) {
  return prefix + (await sha256(ipBucket(ip) + (env.IP_SALT || "")));
}

async function checkMailCap(env, emailHash) {
  if (!env.RATE) return { ok: true };
  const key = MAIL_CAP.prefix + emailHash;
  const hits = parseInt((await env.RATE.get(key)) || "0", 10);
  return hits >= MAIL_CAP.max ? { ok: false } : { ok: true, key, hits };
}

async function consumeMailCap(env, cap) {
  if (!env.RATE || !cap || !cap.key) return;
  await env.RATE.put(cap.key, String(cap.hits + 1), { expirationTtl: MAIL_CAP.ttl });
}

async function checkBurst(env, ip) {
  if (!env.RATE) return { ok: true };
  const key = await ipKey(env, ip, RL.burst.prefix);
  const hits = parseInt((await env.RATE.get(key)) || "0", 10);
  if (hits >= RL.burst.max) return { ok: false, retryAfter: RL.burst.ttl };
  await env.RATE.put(key, String(hits + 1), { expirationTtl: RL.burst.ttl });
  return { ok: true };
}

async function checkSignupQuota(env, ip) {
  if (!env.RATE) return { ok: true };
  const key = await ipKey(env, ip, RL.signup.prefix);
  const hits = parseInt((await env.RATE.get(key)) || "0", 10);
  if (hits >= RL.signup.max) return { ok: false, retryAfter: RL.signup.ttl };
  return { ok: true, key, hits };
}

async function consumeSignupQuota(env, quota) {
  if (!env.RATE || !quota || !quota.key) return;
  await env.RATE.put(quota.key, String(quota.hits + 1), { expirationTtl: RL.signup.ttl });
}

// Everything that depends on WHICH address was submitted: the row write, the inbox
// cap and the confirmation email. fetch() runs this only after the answer has been
// sent (ctx.waitUntil), so the answer is the same work, the same bytes and the same
// time for a new, pending, confirmed or capped address, and cannot reveal which.
async function processSignup(env, typed, emailHash, profile) {
  // Inbox cap first: once it is reached nothing is written, so the link in the
  // newest email that did go out keeps working.
  const mailCap = await checkMailCap(env, emailHash);
  if (!mailCap.ok) return;

  const token = crypto.randomUUID().replace(/-/g, "");
  const unsub = crypto.randomUUID().replace(/-/g, "");
  const now = new Date().toISOString();

  // The 10-minute resend window is enforced INSIDE the write, so it is atomic:
  // D1 serialises writes, so when many requests for one address arrive at once
  // (from many networks), exactly one wins the row per window and only the winner
  // sends mail and counts against the inbox cap.
  const resendCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let stored;
  try {
    // New address: insert. Pending address: store the NEW token and restart its
    // clock, so the link in the newest email is the one that works.
    // A confirmed row is never touched (the WHERE on the upsert).
    stored = await env.DB.prepare(
      `INSERT INTO subscribers (email, email_hash, profile, consent_at, token, unsub_token, confirmed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(email_hash) DO UPDATE SET
         email = excluded.email, profile = excluded.profile, consent_at = excluded.consent_at,
         token = excluded.token, created_at = excluded.created_at
       WHERE subscribers.confirmed = 0 AND subscribers.created_at <= ?`
    ).bind(typed, emailHash, JSON.stringify(profile), now, token, unsub, now, resendCutoff).run();
  } catch {
    console.log(JSON.stringify({ task: "subscribe", error: "storage_failed" }));
    return;
  }
  // Nothing written: already confirmed, or this window's email already went out
  // (maybe from a concurrent request). No mail, no inbox cap used.
  if (!stored.meta || !(stored.meta.changes > 0)) return;
  await consumeMailCap(env, mailCap);
  if (!env.RESEND_KEY) return;

  // the confirmation email (double opt-in) via Resend
  const link = `${env.WORKER_URL}/confirm?t=${token}`;
  const html = confirmEmailHTML(link);
  const text =
    "ASCEND HIGHER\n\n" +
    "You're one click from the Climb Log.\n\n" +
    "Confirm here: " + link + "\n\n" +
    "What lands in your inbox: what I built and what broke, the links worth keeping, " +
    "and first word when the Basecamp opens. Occasional. Never spam.\n\n" +
    "If you didn't request this, ignore this email and nothing happens.\n\n" +
    "Gautam Talks\ngautamtalks.com";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.FROM_ADDRESS || "Gautam Talks <hello@gautamtalks.com>",
        to: [typed],
        subject: "One click and you're on the Climb Log \u26A1",
        html,
        text
      }),
    });
    // status code only, never the address
    if (!r.ok) console.log(JSON.stringify({ task: "subscribe", error: "mail_failed", status: r.status }));
  } catch {
    console.log(JSON.stringify({ task: "subscribe", error: "mail_failed" }));
  }
}


/* ── Branded confirmation email ──────────────────────────────────────────
   Table-based layout with inline styles: the only thing that renders
   reliably across Gmail, Outlook, and Apple Mail. Dark card, sun-yellow
   button, same voice as the site. */
function confirmEmailHTML(link) {
  const INK = "#16151c", PAPER = "#f7f4ec", SUN = "#ffd23f", COBALT = "#2e3df0", MUTE = "#6b6a72";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Confirm your spot</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">One click and the Climb Log is yours.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

    <tr><td style="padding-bottom:18px;font:700 15px/1 Arial,Helvetica,sans-serif;color:${INK};letter-spacing:.5px;">
      GAUTAM <span style="color:${COBALT};">&#9889;</span> TALKS
    </td></tr>

    <tr><td style="background:${INK};border-radius:20px;padding:38px 34px;">
      <p style="margin:0 0 10px;font:600 11px/1 Arial,Helvetica,sans-serif;color:${SUN};letter-spacing:2.5px;">
        ONE STEP LEFT
      </p>
      <h1 style="margin:0 0 16px;font:800 30px/1.15 Arial,Helvetica,sans-serif;color:${PAPER};letter-spacing:-.5px;">
        You're almost on<br>the Climb Log.
      </h1>
      <p style="margin:0 0 28px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#a9adbb;">
        One click confirms it's really you. That's all. No password, no account, nothing to remember.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:${SUN};border-radius:999px;">
          <a href="${link}" style="display:inline-block;padding:16px 34px;font:700 15px/1 Arial,Helvetica,sans-serif;color:${INK};text-decoration:none;letter-spacing:.3px;">
            CONFIRM MY SPOT &#9889;
          </a>
        </td>
      </tr></table>

      <p style="margin:26px 0 0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#7c8194;">
        Button not working? Paste this into your browser:<br>
        <a href="${link}" style="color:${SUN};word-break:break-all;">${link}</a>
      </p>
    </td></tr>

    <tr><td style="padding:26px 4px 0;">
      <p style="margin:0 0 12px;font:700 11px/1 Arial,Helvetica,sans-serif;color:${MUTE};letter-spacing:2px;">
        WHAT LANDS IN YOUR INBOX
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${INK};">
        <tr><td style="padding:7px 0;">&#9889;&nbsp; What I built, and what broke</td></tr>
        <tr><td style="padding:7px 0;">&#128196;&nbsp; The links actually worth keeping</td></tr>
        <tr><td style="padding:7px 0;">&#127957;&nbsp; First word when the Basecamp opens</td></tr>
      </table>
      <p style="margin:14px 0 0;font:400 11px/1.6 Arial,Helvetica,sans-serif;color:${MUTE};letter-spacing:1px;">
        OCCASIONAL &middot; NEVER SPAM &middot; ONE-CLICK OUT
      </p>
    </td></tr>

    <tr><td style="padding:26px 4px 0;border-top:1px solid #e0dcd2;margin-top:20px;">
      <p style="margin:18px 0 6px;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${MUTE};">
        Didn't sign up? Ignore this email and nothing happens. You won't hear from me again.
      </p>
      <p style="margin:0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${MUTE};">
        Gautam Talks &middot; <a href="https://gautamtalks.com" style="color:${COBALT};text-decoration:none;">gautamtalks.com</a>
      </p>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}

export default {
  /* Scheduled cleanup. Runs every hour via the cron trigger in wrangler.toml.
     Enforces what the privacy policy promises ("never kept longer than 30 days"):
       - an unconfirmed signup is deleted once it is 29 days old (created_at is the
         time of the latest signup that triggered a confirmation email). With an
         hourly run the worst case is 29 days + 1 hour, so the promise still holds
         even if many runs in a row fail. (A daily run with a 30-day threshold kept
         rows for up to 31 days.)
       - confirmation tokens older than 7 days are cleared (the link already stops
         working at 7 days, because /confirm checks created_at itself)
     No endpoint, no auth surface: Cloudflare invokes this internally. */
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const iso = (ms) => new Date(now - ms).toISOString();
    try {
      const purged = await env.DB.prepare(
        "DELETE FROM subscribers WHERE confirmed = 0 AND created_at <= ?"
      ).bind(iso(UNCONFIRMED_PURGE_MS)).run();

      const expired = await env.DB.prepare(
        "UPDATE subscribers SET token = NULL WHERE confirmed = 0 AND token IS NOT NULL AND created_at < ?"
      ).bind(iso(7 * 24 * 3600 * 1000)).run();

      // counts only, never addresses
      console.log(JSON.stringify({
        task: "cleanup",
        unconfirmed_deleted: purged.meta?.changes ?? 0,
        tokens_expired: expired.meta?.changes ?? 0
      }));
    } catch (e) {
      console.log(JSON.stringify({ task: "cleanup", error: "failed" }));
    }
  },

  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": allowed,
          "access-control-allow-methods": "POST, GET, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }

    // ---- double opt-in confirmation (link in the email) ----
    // GET only shows a button; the POST that button sends is what confirms.
    // Mail security scanners open every link in an email with GET, so a GET that
    // confirmed would let a scanner "consent" for the recipient and void the
    // proof of consent that double opt-in exists to create.
    if (url.pathname === "/confirm" && (request.method === "GET" || request.method === "POST")) {
      const token = url.searchParams.get("t") || "";
      if (!/^[a-f0-9]{32,64}$/.test(token)) return new Response("Invalid link", { status: 400 });
      // token must exist, be unconfirmed, and be younger than 7 days
      const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      let state;
      if (request.method === "GET") {
        const live = await env.DB.prepare(
          "SELECT 1 AS live FROM subscribers WHERE token = ? AND confirmed = 0 AND created_at >= ?"
        ).bind(token, cutoff).first();
        state = live ? "ask" : "bad";
      } else {
        const res = await env.DB.prepare(
          "UPDATE subscribers SET confirmed = 1, confirmed_at = ?, token = NULL " +
          "WHERE token = ? AND confirmed = 0 AND created_at >= ?"
        ).bind(new Date().toISOString(), token, cutoff).run();
        state = res.meta && res.meta.changes > 0 ? "ok" : "bad";
      }
      const page = {
        ask: { title: "Confirm your spot", h1: "One last click \u26A1", p: "Press the button and the Climb Log is yours.",
               extra: `<form method="POST" action="/confirm?t=${token}"><button type="submit">CONFIRM MY SPOT \u26A1</button></form>` },
        ok:  { title: "You're in", h1: "You're on the list \u26A1", p: "Field notes from the climb are on the way.", extra: "" },
        bad: { title: "Link expired", h1: "That link is no longer valid", p: "Try signing up again.", extra: "" },
      }[state];
      return new Response(
        `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
         <title>${page.title}</title>
         <style>body{background:#f7f4ec;color:#16151c;font-family:system-ui,sans-serif;display:grid;
         place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}
         a{color:#2e3df0}h1{font-size:2rem;margin:0 0 12px}
         button{background:#ffd23f;color:#16151c;border:0;border-radius:999px;padding:16px 34px;
         font:700 15px system-ui,sans-serif;letter-spacing:.3px;cursor:pointer;margin:8px 0 4px}</style>
         <div><h1>${page.h1}</h1>
         <p>${page.p}</p>${page.extra}
         <p><a href="https://gautamtalks.com/">Back to gautamtalks.com</a></p></div>`,
        { status: state === "bad" ? 410 : 200, headers: {
           "content-type": "text/html; charset=utf-8",
           "cache-control": "no-store",
           "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
           "x-content-type-options": "nosniff",
           "referrer-policy": "no-referrer",
           "strict-transport-security": "max-age=31536000; includeSubDomains",
           "permissions-policy": "geolocation=(), microphone=(), camera=(), interest-cohort=()"
         } }
      );
    }

    // ---- unsubscribe (legally required, one click) ----
    // GET is the link in every email. POST is RFC 8058 one-click: Gmail and Yahoo
    // POST here when the List-Unsubscribe-Post header is present, which send.mjs
    // sets on every issue. Before this, that POST hit the 404 below and the
    // person stayed subscribed.
    if (url.pathname === "/unsubscribe" && (request.method === "GET" || request.method === "POST")) {
      const token = url.searchParams.get("t") || "";
      if (!/^[a-f0-9]{32,64}$/.test(token)) return new Response("Invalid link", { status: 400 });
      await env.DB.prepare("DELETE FROM subscribers WHERE unsub_token = ?").bind(token).run();
      if (request.method === "POST") {
        return new Response("Unsubscribed", { status: 200, headers: {
          "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      }
      return new Response(
        `<!doctype html><meta charset=utf-8><title>Unsubscribed</title>
         <p style="font-family:system-ui">You're unsubscribed. No hard feelings. The videos are always free.</p>`,
        { status: 200, headers: {
           "content-type": "text/html; charset=utf-8",
           "cache-control": "no-store",
           "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
           "x-content-type-options": "nosniff",
           "referrer-policy": "no-referrer",
           "strict-transport-security": "max-age=31536000; includeSubDomains"
         } }
      );
    }

    if (request.method !== "POST" || url.pathname !== "/subscribe") {
      return json({ error: "not_found" }, 404, allowed);
    }
    if (!allowed) return json({ error: "forbidden" }, 403, "");

    // reject anything that isn't a small JSON body
    const ctype = request.headers.get("content-type") || "";
    if (!ctype.includes("application/json")) return json({ error: "bad_content_type" }, 415, allowed);
    const len = parseInt(request.headers.get("content-length") || "0", 10);
    if (len > 4096) return json({ error: "payload_too_large" }, 413, allowed);

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return json({ error: "payload_too_large" }, 413, allowed);
      body = JSON.parse(raw);
      if (typeof body !== "object" || body === null || Array.isArray(body)) throw 0;
    } catch {
      return json({ error: "bad_json" }, 400, allowed);
    }

    // One answer for new, pending, already-confirmed and silently dropped requests,
    // so this endpoint cannot be used to test whether an address is on the list.
    const accepted = () => json({ ok: true, pending: true }, 200, allowed);

    // honeypot: real humans never fill a hidden field
    if (body.website) return accepted(); // silent success for bots
    // timing: a genuine human takes more than 2 seconds
    if (typeof body.elapsed === "number" && body.elapsed < 2000) return accepted();

    const typed = typedAddress(body.email);   // where mail is sent
    const email = normalize(typed);           // de-duplication identity only
    if (!validEmail(typed) || !validEmail(email)) return json({ error: "invalid_email" }, 400, allowed);
    if (body.consent !== true) return json({ error: "consent_required" }, 400, allowed);

    const ip = request.headers.get("CF-Connecting-IP") || "";

    // burst guard first: cheapest check, stops hammering
    const burst = await checkBurst(env, ip);
    if (!burst.ok) {
      return json({ error: "rate_limited", retryAfter: burst.retryAfter,
                    message: "Too many attempts in a short time." }, 429, allowed);
    }

    if (!(await verifyTurnstile(body.turnstile, ip, env.TURNSTILE_SECRET))) {
      return json({ error: "captcha_failed" }, 403, allowed);
    }

    // profile answers: strict allowlist, never free text
    const PROFILE = {
      track: ["builder", "creator", "student", "curious"],
      goal: ["start", "consistency", "skills", "community"],
      depth: ["quick", "deep"],
    };
    const profile = {};
    for (const [k, options] of Object.entries(PROFILE)) {
      const v = String((body.profile || {})[k] || "");
      profile[k] = options.includes(v) ? v : options[0];
    }

    const domain = email.slice(email.lastIndexOf("@") + 1);
    if (DISPOSABLE.has(domain)) return json({ error: "disposable_email" }, 400, allowed);

    const emailHash = await sha256(email + (env.EMAIL_SALT || ""));

    // Network quota: decided before anything about the address is looked at, so a
    // 429 reveals nothing, and consumed by EVERY request that gets this far, so the
    // next request's answer reveals nothing either (see RL above).
    const quota = await checkSignupQuota(env, ip);
    if (!quota.ok) {
      return json({ error: "rate_limited", retryAfter: quota.retryAfter,
                    message: "Signup limit reached for this network." }, 429, allowed);
    }
    await consumeSignupQuota(env, quota);

    // From here the answer is fixed and identical for every address. The work that
    // depends on the address runs after it is sent, so neither the answer, nor its
    // timing, nor the quota it used can tell new, pending, confirmed or capped apart.
    // It starts only after a short pause, so that even a busy runtime has delivered
    // the answer before any of it runs (measured in workerd: without the pause, the
    // background work of the mail-sending states slowed delivery by about 15 ms).
    // (No storage error reaches the visitor any more: it is logged, without PII.)
    const work = new Promise((r) => setTimeout(r, ANSWER_FIRST_MS))
      .then(() => processSignup(env, typed, emailHash, profile))
      .catch(() => {
        console.log(JSON.stringify({ task: "subscribe", error: "background_failed" }));
      });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work);
    else await work; // Cloudflare always passes ctx; only bare test harnesses do not
    return accepted();
  },
};
