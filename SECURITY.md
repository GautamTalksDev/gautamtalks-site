# Security

What's already in the code, what needs ten minutes of clicking, and how to prove it.

---

## Already implemented (nothing to do)

**Content Security Policy** on every page, placed as the first element after `<meta charset>`.
The W3C spec is explicit that a meta policy does not apply to content that precedes it, so
position matters as much as content.

```
default-src 'none'; script-src 'self' https://challenges.cloudflare.com;
style-src 'self' https://fonts.googleapis.com 'unsafe-inline';
font-src https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com;
connect-src 'self' https://*.workers.dev https://challenges.cloudflare.com;
frame-src https://challenges.cloudflare.com; form-action 'none';
base-uri 'none'; object-src 'none'; manifest-src 'self'; worker-src 'none';
upgrade-insecure-requests
```

Why this is strong: `default-src 'none'` denies everything and then permits only what's
proven necessary. `script-src 'self'` means an injected `<script>` from anywhere else
simply will not execute, and there are **zero inline event handlers** anywhere in the
codebase, so no `'unsafe-inline'` escape hatch exists for scripts. `base-uri 'none'`
blocks base-tag hijacking. `object-src 'none'` kills legacy plugin vectors.
`form-action 'none'` means even a successfully injected form cannot post anywhere.

`'unsafe-inline'` remains only in `style-src`, because inline `style=""` attributes
require it. Styles cannot execute code, so this is a cosmetic risk, not an XSS one.

**Other protections in the code**
- Every external link carries `rel="noopener noreferrer"` (blocks tab-nabbing and referrer leakage).
- `referrer-policy: strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff` meta tags.
- All dynamic HTML is escaped through a single `esc()` function before insertion.
- Quiz answers are validated against a server-side allowlist; free text never reaches the database.
- `three.js` is self-hosted, not pulled from a CDN, so there is no third-party script supply chain.
- No analytics, no trackers, no third-party JavaScript of any kind.

---

## Requires Cloudflare (free, ~10 minutes)

Three protections **cannot** be delivered from a static host like GitHub Pages, because
they only work as real HTTP response headers, and GitHub Pages does not let you set headers.
The `frame-ancestors`, `report-uri`, and `sandbox` directives are ignored inside a meta tag,
and `Strict-Transport-Security` has no meta equivalent at all.

That means **clickjacking protection is missing until you do this.** Someone could iframe
gautamtalks.com inside their own page. Low severity for a content site, but it is the one
real gap, and it is free to close.

### Steps

1. Create a free Cloudflare account, add `gautamtalks.com`, and move your nameservers to Cloudflare.
2. Recreate the GitHub Pages DNS records in Cloudflare (four A records for `@`, CNAME for `www`),
   and set them to **Proxied (orange cloud)**. Headers only apply when proxied.
3. SSL/TLS → Edge Certificates → **Always Use HTTPS: on**, and enable **HSTS** there
   (max-age 12 months, include subdomains). Use this panel, not a rule, to avoid duplicate headers.
4. Rules → Create Rule → **Response Header Transform Rule** → apply to all incoming requests →
   **Set static** for each:

| Header | Value |
|---|---|
| `Content-Security-Policy` | *(same policy as above, plus)* `frame-ancestors 'none'` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |

Use **Set static** (not add) so exactly one authoritative copy of each header reaches the browser;
duplicated CSP headers are enforced as an unpredictable intersection.

5. Once the headers are live, delete the CSP meta tags from the three HTML files if you like —
   or leave them as defence in depth. Leaving them is fine and costs nothing.

---

## The signup worker

- **CORS allowlist**: only `gautamtalks.com` and `www.gautamtalks.com` may call it.
- **Turnstile captcha** verification (set `TURNSTILE_SECRET` to enable).
- **Rate limiting**: 5 submissions per IP per hour, via KV, with the IP salted and hashed.
- **Honeypot field + submit-timing check** catches naive bots without bothering humans.
- **Body limits**: rejects non-JSON content types and anything over 4 KB.
- **Input validation**: email length-capped and pattern-checked; profile answers allowlisted.
- **Secrets** live in Wrangler's encrypted store, never in the repository.
- **Double opt-in** with random 128-bit tokens; unconfirmed records are never emailed.
- **One-click unsubscribe** that hard-deletes the record.
- **No PII in logs**, ever.
- Full security headers including `frame-ancestors 'none'` on every worker response.

---

## Verify it yourself after deploying

```bash
# headers
curl -sI https://gautamtalks.com | grep -iE 'content-security|strict-transport|x-content-type|referrer|permissions'

# the worker must reject a foreign origin
curl -si -X POST https://<your-worker>/subscribe \
  -H 'origin: https://evil.example' -H 'content-type: application/json' \
  -d '{"email":"a@b.com","consent":true}' | head -1     # expect 403
```

Then run the site through **securityheaders.com** and **Mozilla Observatory**.
Before Cloudflare expect a mid grade (headers missing at the origin); after, expect an A.

## Reporting

Found something? Contact details are on gautamkhosla.com. No bug bounty, but genuine
reports get a fast reply and public credit if you want it.
