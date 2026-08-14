# gautamtalks.com

**Start before you feel ready.**

The creator site for [Gautam Talks](https://gautamtalks.com). Hand written, zero
frameworks, no build step. Static pages on GitHub Pages with a Cloudflare Worker
behind the one thing that needs a server.

Live at **[gautamtalks.com](https://gautamtalks.com)**

> Engineering portfolio lives separately at
> **[gautamkhosla.com](https://gautamkhosla.com)** · same operator, different
> frequency.

---

## What is in here

| | |
|---|---|
| **A hidden 3D short** | Click the photo on the homepage. A low-poly bedroom scene built entirely in code with three.js, no model files and no textures, that plays a 45 second animated story and ends on the site's thesis. |
| **A Hub that tunes itself** | Three questions, four modes, and the page reorders itself around your answers. It remembers you without a login and without an account. |
| **A newsletter I own end to end** | The Climb Log. Double opt-in, alias-proof deduplication, one-click unsubscribe that actually deletes, and automatic data retention. No mailing-list vendor sits between me and the list. |
| **A site that changes daily** | The palette shifts by weekday, the motto rotates through the year, and the video feed rewrites itself from YouTube every morning. Nobody touches it. |

---

## Stack

Deliberately small. Every dependency is a thing that can break at 2 a.m.

**Frontend** · HTML, CSS, and vanilla JavaScript. No React, no bundler, no
package step. `three.js` r128 is self-hosted rather than pulled from a CDN, so
no third party can change what visitors see.

**Backend** · One Cloudflare Worker handling signup, confirmation, and
unsubscribe, with D1 for storage, KV for rate limiting, and Turnstile for
captcha. Email goes out through Resend.

**Automation** · A GitHub Action rewrites the video feed daily from the YouTube
RSS endpoint. A Worker cron prunes unconfirmed rows and expires stale tokens.

**Hosting** · GitHub Pages, Cloudflare DNS, HTTPS enforced, DNSSEC on.

---

## Layout

```
index.html          Homepage
styles.css          All site styles
app.js              Homepage logic
room.js             The 3D scene and its story beats
three.min.js        three.js r128, self-hosted
hub/                The personalised Hub: quiz, templates, persistence
newsletter/         The Climb Log: sender, templates, and how to write an issue
worker/             Cloudflare Worker, schema, and the local admin tool
contact/  privacy/  Contact page and the full privacy policy
data/feed.json      Generated daily by the feed workflow
```

---

## Security

The Content Security Policy runs without `unsafe-inline` on scripts, which is
only possible because **there are zero inline event handlers in the codebase**.
No `onclick`, no `onerror`, anywhere. An inline `onerror` on a video thumbnail
was found and removed for exactly this reason.

The signup endpoint layers a honeypot field, a submission timing check, per-IP
burst limits, Turnstile verification, and a separate quota on new subscriptions.
Failed attempts do not consume quota, because the first version of that logic
locked me out of my own site during testing.

**There is deliberately no admin endpoint.** An admin route is a permanently
exposed door. Administration happens locally through Wrangler, behind 2FA, with
zero attack surface.

Every database query uses bound parameters. No string concatenation reaches SQL.

Known gap, documented rather than hidden: `frame-ancestors` and HSTS cannot be
set from a meta tag, and GitHub Pages cannot send HTTP headers. Full detail and
the fix are in [`SECURITY.md`](SECURITY.md).

Found something? [`SECURITY.md`](SECURITY.md) has the disclosure process. Please
report it rather than posting it.

---

## Privacy

Canadian, so CASL applies: express consent, with proof. That is why double
opt-in exists and why consent and confirmation timestamps are stored.

Only confirmed addresses are ever emailed. Unsubscribing **deletes** the record
rather than flagging it. The full plain-language policy is at
[gautamtalks.com/privacy](https://gautamtalks.com/privacy/).

---

## Licence

**Proprietary. All rights reserved.** This repository is public so the work can
be read, verified, and learned from. It is not a template and it is not open
source.

You may read the source and learn from it. You may not deploy it, redistribute
it, or use it as a starting point for your own site. See [`LICENSE`](LICENSE)
for the specifics, including what *is* permitted.

Third-party material redistributed here under its own licence, notably three.js
under MIT, is listed in [`THIRD-PARTY.md`](THIRD-PARTY.md).

Want to use something? Ask. Permission is often granted.

---

## Elsewhere

[YouTube](https://www.youtube.com/@GautamKhoslaOfficial) ·
[Instagram](https://www.instagram.com/gautamk.talks/) ·
[X](https://x.com/HeyGautamTalks) ·
[LinkedIn](https://www.linkedin.com/in/gautam-khosla/) ·
[Engineering work](https://gautamkhosla.com)

Collaborations: `collabwith.gt@gmail.com`

---

*Built at altitude.* ⚡
