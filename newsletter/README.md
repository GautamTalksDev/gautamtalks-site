# The Climb Log

Your newsletter. Your list. No service, no monthly fee, no vendor holding your subscribers.

## Writing an issue

Copy the last issue in `issues/` to a new dated file, e.g. `issues/2026-08-17.md`.
The block at the top is the front matter and every field matters:

```
---
subject: The line people see in their inbox
preview: The grey text after the subject. Make it earn the open.
title: The big headline inside the dark card
kicker: FIELD NOTES FROM THE CLIMB
number: 2
---
```

Then write. The formatting you can use:

| You write | You get |
|---|---|
| `## Heading` | A section heading |
| plain paragraph | A paragraph |
| `- item` | A bullet with a lightning bolt |
| `> line` | A yellow callout box |
| `**bold**` and `*italic*` | Bold and italic |
| `[text](url)` | A blue link |
| `[[Button label]](url)` | A black pill button |
| `![alt](image-url)` | An image, full width |
| `***` | A divider line |

Keep it to one screen or two. People read on phones.

## Sending

```powershell
cd C:\GT_Develops\projects\gautamtalks-site

# 1. see it first
node newsletter/send.mjs --dry
#    opens nothing, writes newsletter/preview.html, open that in a browser

# 2. set your key for this terminal session only
$env:RESEND_KEY="paste-the-key-at-this-prompt"

# 3. send to yourself
node newsletter/send.mjs --test

# 4. send to everyone
node newsletter/send.mjs
#    asks you to type SEND before anything goes out
```

## Rules that keep you legal

- Only confirmed subscribers are ever emailed. The query filters on `confirmed = 1`.
- Every email carries that person's own unsubscribe link, plus the
  `List-Unsubscribe` header so Gmail shows its own unsubscribe button.
- Unsubscribing deletes the record. It does not just flag it.

## Writing that people actually read

- Lead with what happened, not with hello.
- One idea per issue. The thing you learned is worth more than the list of what you did.
- Include what broke. It is the part nobody else publishes and the part people trust.
- Cut every sentence that could be deleted without losing meaning.
- Read it out loud before sending. If you stumble, rewrite that line.
