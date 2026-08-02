/**
 * GAUTAM TALKS · signup worker
 * Cloudflare Worker + D1. Stores emails privately in YOUR database.
 * Deploy: see worker/README.md
 *
 * Security posture:
 *  - strict CORS allowlist (only your domains may call it)
 *  - Turnstile captcha verification (bot wall, privacy-friendly)
 *  - honeypot + submit-timing check (kills naive spam bots)
 *  - per-IP rate limiting via KV
 *  - email normalized + validated; stored with SHA-256 lookup hash
 *  - double opt-in token (CASL/GDPR: express consent required in Canada)
 *  - no PII written to logs, ever
 */

const ALLOWED_ORIGINS = new Set([
  "https://gautamtalks.com",
  "https://www.gautamtalks.com",
]);

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
  if (!secret) return true; // captcha optional until you add the key
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const out = await r.json();
  return out.success === true;
}

// Two-tier limiter.
//  - burst:  6 requests / 5 min   (stops rapid hammering)
//  - signup: 8 NEW subscriptions / 6 h (stops list stuffing)
// Failed validation, duplicates and already-subscribed do NOT consume signup
// quota, so honest people retrying a typo are never punished.
const RL = {
  burst:  { max: 6, ttl: 300,   prefix: "b:" },
  signup: { max: 8, ttl: 21600, prefix: "s:" },
};

async function ipKey(env, ip, prefix) {
  return prefix + (await sha256(ip + (env.IP_SALT || "")));
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
        One click confirms it's really you. That's all &mdash; no password, no account, nothing to remember.
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
  /* Scheduled cleanup. Runs daily via the cron trigger in wrangler.toml.
     Enforces exactly what the privacy policy promises:
       - unconfirmed signups deleted after 30 days
       - confirmation tokens expire after 7 days (link stops working)
     No endpoint, no auth surface: Cloudflare invokes this internally. */
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const iso = (ms) => new Date(now - ms).toISOString();
    try {
      const purged = await env.DB.prepare(
        "DELETE FROM subscribers WHERE confirmed = 0 AND created_at < ?"
      ).bind(iso(30 * 24 * 3600 * 1000)).run();

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

  async fetch(request, env) {
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

    // ---- double opt-in confirmation link (clicked from the email) ----
    if (request.method === "GET" && url.pathname === "/confirm") {
      const token = url.searchParams.get("t") || "";
      if (!/^[a-f0-9]{32,64}$/.test(token)) return new Response("Invalid link", { status: 400 });
      // token must exist, be unconfirmed, and be younger than 7 days
      const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const res = await env.DB.prepare(
        "UPDATE subscribers SET confirmed = 1, confirmed_at = ?, token = NULL " +
        "WHERE token = ? AND confirmed = 0 AND created_at >= ?"
      ).bind(new Date().toISOString(), token, cutoff).run();
      const ok = res.meta && res.meta.changes > 0;
      return new Response(
        `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
         <title>${ok ? "You're in" : "Link expired"}</title>
         <style>body{background:#f7f4ec;color:#16151c;font-family:system-ui,sans-serif;display:grid;
         place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}
         a{color:#2e3df0}h1{font-size:2rem;margin:0 0 12px}</style>
         <div><h1>${ok ? "You're on the list \u26A1" : "That link is no longer valid"}</h1>
         <p>${ok ? "Field notes from the climb are on the way." : "Try signing up again."}</p>
         <p><a href="https://gautamtalks.com/">Back to gautamtalks.com</a></p></div>`,
        { status: ok ? 200 : 410, headers: {
           "content-type": "text/html; charset=utf-8",
           "cache-control": "no-store",
           "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
           "x-content-type-options": "nosniff",
           "referrer-policy": "no-referrer",
           "strict-transport-security": "max-age=31536000; includeSubDomains",
           "permissions-policy": "geolocation=(), microphone=(), camera=(), interest-cohort=()"
         } }
      );
    }

    // ---- unsubscribe (legally required, one click) ----
    if (request.method === "GET" && url.pathname === "/unsubscribe") {
      const token = url.searchParams.get("t") || "";
      if (!/^[a-f0-9]{32,64}$/.test(token)) return new Response("Invalid link", { status: 400 });
      await env.DB.prepare("DELETE FROM subscribers WHERE unsub_token = ?").bind(token).run();
      return new Response(
        `<!doctype html><meta charset=utf-8><title>Unsubscribed</title>
         <p style="font-family:system-ui">You're unsubscribed. No hard feelings \u2014 the videos are always free.</p>`,
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

    // honeypot: real humans never fill a hidden field
    if (body.website) return json({ ok: true }, 200, allowed); // silent success for bots
    // timing: a genuine human takes more than 2 seconds
    if (typeof body.elapsed === "number" && body.elapsed < 2000) {
      return json({ ok: true }, 200, allowed);
    }

    const email = normalize(String(body.email || ""));
    if (!validEmail(email)) return json({ error: "invalid_email" }, 400, allowed);
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

    // Already on the list? Say so instead of silently re-sending.
    const existing = await env.DB.prepare(
      "SELECT confirmed, created_at FROM subscribers WHERE email_hash = ?"
    ).bind(emailHash).first();

    if (existing) {
      if (existing.confirmed === 1) {
        return json({ ok: true, already: true }, 200, allowed);
      }
      // Unconfirmed: allow a resend, but not more than once every 10 minutes.
      const age = Date.now() - new Date(existing.created_at).getTime();
      if (age < 10 * 60 * 1000) {
        return json({ ok: true, pending: true, throttled: true }, 200, allowed);
      }
    }
    const token = crypto.randomUUID().replace(/-/g, "");
    const unsub = crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();

    // only a genuinely NEW subscription consumes the signup quota
    const quota = await checkSignupQuota(env, ip);
    if (!quota.ok) {
      return json({ error: "rate_limited", retryAfter: quota.retryAfter,
                    message: "Signup limit reached for this network." }, 429, allowed);
    }

    try {
      await env.DB.prepare(
        `INSERT INTO subscribers (email, email_hash, profile, consent_at, token, unsub_token, confirmed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(email_hash) DO UPDATE SET profile = excluded.profile`
      ).bind(email, emailHash, JSON.stringify(profile), now, token, unsub, now).run();
    } catch (e) {
      return json({ error: "storage_failed" }, 500, allowed);
    }
    await consumeSignupQuota(env, quota);

    // send the confirmation email (double opt-in) via Resend
    if (env.RESEND_KEY) {
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
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.FROM_ADDRESS || "Gautam Talks <hello@gautamtalks.com>",
          to: [email],
          subject: "One click and you're on the Climb Log \u26A1",
          html,
          text
        }),
      }).catch(() => {});
    }

    return json({ ok: true, pending: true }, 200, allowed);
  },
};