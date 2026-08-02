# Signup worker — deploy in ~15 minutes

Your emails land in **your own Cloudflare D1 database**. Nobody else holds them.

## 1. Install and log in

```bash
npm install -g wrangler
wrangler login
```

## 2. Create the database

```bash
cd worker
wrangler d1 create gautamtalks-subs
```

Copy the `database_id` it prints into `wrangler.toml`.

## 3. Create the table

```bash
wrangler d1 execute gautamtalks-subs --remote --file=schema.sql
```

## 4. Create the rate-limit store

```bash
wrangler kv namespace create RATE
```

Copy the `id` into `wrangler.toml`.

## 5. Add your secrets (never in code, never in the repo)

```bash
wrangler secret put EMAIL_SALT      # any long random string, e.g. openssl rand -hex 32
wrangler secret put IP_SALT         # another random string
wrangler secret put RESEND_KEY      # from resend.com, for confirmation emails
wrangler secret put TURNSTILE_SECRET # from Cloudflare Turnstile (optional but recommended)
```

## 6. Deploy

```bash
wrangler deploy
```

It prints a URL like `https://gautamtalks-signup.<you>.workers.dev`.
Put that URL into `hub/hub.js` → `SIGNUP_ENDPOINT`, and into `wrangler.toml` → `WORKER_URL`.

## 7. Read your list any time

```bash
wrangler d1 execute gautamtalks-subs --remote \
  --command="SELECT email, profile, created_at FROM subscribers WHERE confirmed = 1"
```

Export to CSV for any newsletter tool:

```bash
wrangler d1 execute gautamtalks-subs --remote --json \
  --command="SELECT email FROM subscribers WHERE confirmed = 1" > subscribers.json
```

## Legal note (you're in Canada — CASL applies)

- Only email people who **confirmed** (`confirmed = 1`). That's what double opt-in is for.
- Every newsletter must include your name and a working unsubscribe link:
  `https://<your-worker>/unsubscribe?t=<unsub_token>`
- Keep the consent timestamp (`consent_at`). It's your proof if anyone ever complains.
