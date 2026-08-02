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

const normalize = (e) => e.trim().toLowerCase();

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

async function rateLimit(env, ip) {
  if (!env.RATE) return true;
  const key = `rl:${await sha256(ip + (env.IP_SALT || ""))}`;
  const hits = parseInt((await env.RATE.get(key)) || "0", 10);
  if (hits >= 5) return false; // 5 submissions / hour / IP
  await env.RATE.put(key, String(hits + 1), { expirationTtl: 3600 });
  return true;
}

export default {
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
      const res = await env.DB.prepare(
        "UPDATE subscribers SET confirmed = 1, confirmed_at = ?, token = NULL WHERE token = ? AND confirmed = 0"
      ).bind(new Date().toISOString(), token).run();
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
    if (!(await rateLimit(env, ip))) return json({ error: "rate_limited" }, 429, allowed);
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

    const emailHash = await sha256(email + (env.EMAIL_SALT || ""));
    const token = crypto.randomUUID().replace(/-/g, "");
    const unsub = crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();

    try {
      await env.DB.prepare(
        `INSERT INTO subscribers (email, email_hash, profile, consent_at, token, unsub_token, confirmed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(email_hash) DO UPDATE SET profile = excluded.profile`
      ).bind(email, emailHash, JSON.stringify(profile), now, token, unsub, now).run();
    } catch (e) {
      return json({ error: "storage_failed" }, 500, allowed);
    }

    // send the confirmation email (double opt-in) via Resend
    if (env.RESEND_KEY) {
      const link = `${env.WORKER_URL}/confirm?t=${token}`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.FROM_ADDRESS || "Gautam Talks <hello@gautamtalks.com>",
          to: [email],
          subject: "Confirm your spot on the Climb Log",
          text: `One click and you're in: ${link}\n\nIf you didn't request this, ignore this email and nothing happens.\n\nGautam Talks\ngautamtalks.com`,
        }),
      }).catch(() => {});
    }

    return json({ ok: true, pending: true }, 200, allowed);
  },
};
