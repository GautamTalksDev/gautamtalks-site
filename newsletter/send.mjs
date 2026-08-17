/**
 * THE CLIMB LOG · sender
 * ======================
 * Reads a markdown issue, renders it into the Gautam Talks house style,
 * pulls confirmed subscribers from your D1 database, and sends via Resend.
 * Every email carries that subscriber's own one click unsubscribe link.
 *
 *   node newsletter/send.mjs --test          send only to yourself
 *   node newsletter/send.mjs --dry           write a preview.html, send nothing
 *   node newsletter/send.mjs                 send to everyone confirmed
 *
 * Requires: RESEND_KEY in the environment, wrangler logged in.
 * No dependencies. No newsletter service. Your list stays yours.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB = "gautamtalks-subs";
const FROM = "Gautam Talks <hello@gautamtalks.com>";
const WORKER = "https://gautamtalks-signup.developwith-gt.workers.dev";
const SITE = "https://gautamtalks.com";
const TEST_TO = "developwith.gt@gmail.com";
const ASSETS = `${SITE}/newsletter/assets`;

/* social icons live in newsletter/assets/ and must be pushed to Pages
   BEFORE a send, or these render as empty gaps in every inbox. */
const SOCIALS = [
  ["youtube",   "YouTube",   "https://www.youtube.com/@GautamKhoslaOfficial"],
  ["instagram", "Instagram", "https://www.instagram.com/gautamk.talks/"],
  ["linkedin",  "LinkedIn",  "https://www.linkedin.com/in/gautam-khosla"],
  ["x",         "X",         "https://x.com/HeyGautamTalks"],
  ["github",    "GitHub",    "https://github.com/GautamTalksDev"],
];

const args = process.argv.slice(2);
const isTest = args.includes("--test");
const isDry = args.includes("--dry");

/* ---------- pick the issue ---------- */
const issueArg = args.find(a => a.endsWith(".md"));
const issuesDir = join(HERE, "issues");
const issueFile = issueArg
  ? issueArg
  : join(issuesDir, readdirSync(issuesDir).filter(f => f.endsWith(".md")).sort().pop());

const raw = readFileSync(issueFile, "utf8");
console.log(`\nIssue: ${issueFile}`);

/* ---------- front matter ---------- */
const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
if (!fmMatch) { console.error("Missing front matter block at the top of the issue."); process.exit(1); }
const meta = {};
for (const line of fmMatch[1].split(/\r?\n/)) {
  const i = line.indexOf(":");
  if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const body = raw.slice(fmMatch[0].length).trim();
if (!meta.subject) { console.error("Front matter needs a subject."); process.exit(1); }

/* reading time, derived from the issue so it can never go stale */
const READ = Math.max(1, Math.round(body.split(/\s+/).length / 220));

/* ---------- tiny markdown renderer, house style ---------- */
const INK = "#16151c", PAPER = "#f7f4ec", SUN = "#ffd23f", COBALT = "#2e3df0", MUTE = "#6b6a72";
const TXT = "#33323b", RULE = "#e2ded1";
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(t) {
  return esc(t)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      `<a href="$2" style="color:${COBALT};font-weight:600;text-decoration:underline;">$1</a>`)
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${INK};">$1</strong>`)
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g,
      `<code style="background:#eae6da;padding:2px 6px;border-radius:5px;font-family:monospace;font-size:13px;">$1</code>`);
}

function render(md) {
  const out = [];
  const blocks = md.split(/\r?\n\r?\n/);
  let sectionNo = 0;

  for (let b of blocks) {
    b = b.trim();
    if (!b) continue;

    // callout box:  > text   (dark card, yellow label)
    if (b.startsWith(">")) {
      const t = b.split(/\r?\n/).map(l => l.replace(/^>\s?/, "")).join(" ");
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr><td style="background:${INK};border-radius:18px;padding:24px 26px;">
        <div style="font:700 11px/1 Arial,Helvetica,sans-serif;color:${SUN};letter-spacing:1.8px;padding-bottom:11px;">&#9889; THE POINT</div>
        <div style="font:700 18px/1.5 Arial,Helvetica,sans-serif;color:#ffffff;">${inline(t)}</div>
        </td></tr></table>`);
      continue;
    }
    // image:  ![alt](url)
    const img = b.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (img) {
      out.push(`<img src="${img[2]}" alt="${esc(img[1])}" width="100%"
        style="width:100%;max-width:520px;height:auto;border-radius:14px;display:block;margin:26px 0;">`);
      continue;
    }
    // sub heading:  ### text   (yellow left bar)
    // NOTE: this must be tested BEFORE "## ", or "### x" never matches.
    if (b.startsWith("### ")) {
      out.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 12px;"><tr>
        <td width="5" style="background:${SUN};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:12px;font:800 17px/1.3 Arial,Helvetica,sans-serif;color:${INK};">${inline(b.slice(4))}</td>
        </tr></table>`);
      continue;
    }
    // section heading:  ## text   (numbered, with a rule)
    if (b.startsWith("## ")) {
      sectionNo++;
      const n = String(sectionNo).padStart(2, "0");
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:38px 0 0;"><tr>
        <td width="34" valign="middle" style="font:800 12px/1 Arial,Helvetica,sans-serif;color:${SUN};letter-spacing:1px;">${n}</td>
        <td valign="middle" style="height:2px;background:${RULE};font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
        <h2 style="margin:12px 0 14px;font:800 25px/1.2 Arial,Helvetica,sans-serif;color:${INK};letter-spacing:-.3px;">${inline(b.slice(3))}</h2>`);
      continue;
    }
    if (b.startsWith("# ")) {
      out.push(`<h2 style="margin:34px 0 12px;font:800 25px/1.2 Arial,Helvetica,sans-serif;color:${INK};">${inline(b.slice(2))}</h2>`);
      continue;
    }
    // divider
    if (/^(\*\*\*|___|- - -)$/.test(b)) {
      out.push(`<div style="height:1px;background:${RULE};margin:32px 0;"></div>`);
      continue;
    }
    // button:  [[Label]](url)
    const btn = b.match(/^\[\[([^\]]+)\]\]\(([^)\s]+)\)$/);
    if (btn) {
      out.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr>
        <td style="background:${INK};border-radius:999px;">
        <a href="${btn[2]}" style="display:inline-block;padding:15px 30px;
        font:700 14px/1 Arial,Helvetica,sans-serif;color:${PAPER};text-decoration:none;">${esc(btn[1])}</a>
        </td></tr></table>`);
      continue;
    }
    // list
    if (/^[-*] /m.test(b) && b.split(/\r?\n/).every(l => /^[-*] /.test(l.trim()))) {
      const items = b.split(/\r?\n/).map(l =>
        `<tr><td valign="top" style="padding:6px 12px 6px 0;font-size:16px;color:${SUN};">&#9889;</td>
         <td style="padding:6px 0;font:400 17px/1.65 Arial,Helvetica,sans-serif;color:${TXT};">${inline(l.trim().slice(2))}</td></tr>`
      ).join("");
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">${items}</table>`);
      continue;
    }
    // paragraph
    out.push(`<p style="margin:0 0 18px;font:400 17px/1.75 Arial,Helvetica,sans-serif;color:${TXT};">${inline(b.replace(/\r?\n/g, " "))}</p>`);
  }
  return out.join("\n");
}

/* ---------- full email shell ---------- */
function shell(contentHTML, unsubUrl, issueNo) {
  const icons = SOCIALS.map(([k, n, u]) =>
    `<td style="padding:0 9px;"><a href="${u}"><img src="${ASSETS}/${k}.png" width="20" height="20" alt="${n}"
      style="display:block;border:0;width:20px;height:20px;"></a></td>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(meta.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(meta.preview || meta.subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:30px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <tr><td style="padding-bottom:22px;">
    <table role="presentation" width="100%"><tr>
      <td style="font:700 15px/1 Arial,Helvetica,sans-serif;color:${INK};letter-spacing:.5px;">
        GAUTAM <span style="color:${SUN};">&#9889;</span> TALKS</td>
      <td align="right" style="font:700 11px/1 Arial,Helvetica,sans-serif;color:#8b8a92;letter-spacing:1.2px;">
        THE CLIMB LOG${issueNo ? " &middot; NO." + issueNo : ""} &middot; ${READ} MIN READ</td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background:${INK};border-radius:22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="height:6px;background:${SUN};border-radius:22px 22px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:26px 28px 30px;">
            <p style="margin:0 0 14px;font:700 10px/1 Arial,Helvetica,sans-serif;color:${SUN};letter-spacing:2.2px;">
              ${esc((meta.kicker || "FIELD NOTES FROM THE CLIMB").toUpperCase())}</p>
            <h1 style="margin:0;font:800 31px/1.18 Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:-.5px;">
              ${esc(meta.title || meta.subject)}</h1>
            ${meta.preview ? `<p style="margin:16px 0 0;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#9d9ca6;">${esc(meta.preview)}</p>` : ""}
          </td></tr>
        </table>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:26px 4px 0;">
    ${contentHTML}
  </td></tr>

  <tr><td style="padding:36px 4px 0;">
    <div style="height:3px;background:${SUN};font-size:0;line-height:0;">&nbsp;</div>
    <p style="margin:24px 0 22px;font:400 16px/1.7 Arial,Helvetica,sans-serif;color:${TXT};">
      That's the week. If any of it helped, the best thing you can do is start the thing you've been putting off.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>${icons}</tr></table>
    </td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:18px 0 36px;">
      <div style="font:700 14px/1 Arial,Helvetica,sans-serif;color:${INK};letter-spacing:.4px;">
        GAUTAM <span style="color:${SUN};">&#9889;</span> TALKS</div>
      <div style="padding-top:8px;font:600 11px/1 Arial,Helvetica,sans-serif;color:#8b8a92;letter-spacing:1.6px;">ASCEND HIGHER</div>
      <div style="padding-top:14px;font:400 13px/1 Arial,Helvetica,sans-serif;">
        <a href="${SITE}" style="color:${COBALT};text-decoration:none;">gautamtalks.com</a></div>
      <div style="padding-top:16px;font:400 11px/1.7 Arial,Helvetica,sans-serif;color:#a3a2a9;">
        You're getting this because you confirmed your spot on the Climb Log.
        <a href="${unsubUrl}" style="color:#a3a2a9;text-decoration:underline;">Unsubscribe in one click</a>
        and your record is deleted, not just flagged.</div>
    </td></tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function plainText(md, unsubUrl) {
  return md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[\[([^\]]+)\]\]\(([^)\s]+)\)/g, "$1: $2")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/^>\s?/gm, "")
    .replace(/\*\*|\*|`/g, "")
    .replace(/^#{1,3}\s/gm, "")
    + `\n\n---\nGautam Talks · ${SITE}\nUnsubscribe: ${unsubUrl}\n`;
}

/* ---------- subscribers ---------- */
function getSubscribers() {
  const sql = "SELECT email, unsub_token, profile FROM subscribers WHERE confirmed = 1";
  const out = execSync(
    `wrangler d1 execute ${DB} --remote --json --command="${sql}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], cwd: join(HERE, "..", "worker") }
  );
  return JSON.parse(out)[0].results || [];
}

/* ---------- send ---------- */
const contentHTML = render(body);
const issueNo = meta.number || "";

if (isDry) {
  const preview = join(HERE, "preview.html");
  writeFileSync(preview, shell(contentHTML, `${WORKER}/unsubscribe?t=EXAMPLE`, issueNo));
  console.log(`\nDry run. Preview written to:\n  ${preview}`);
  console.log(`Header will read: THE CLIMB LOG · NO.${issueNo} · ${READ} MIN READ`);
  console.log(`Social icons load from ${ASSETS}/ · these must be live on the site before you send.`);
  console.log(`Open the preview in a browser. Nothing was sent.\n`);
  process.exit(0);
}

const KEY = process.env.RESEND_KEY;
if (!KEY) {
  console.error("\nRESEND_KEY is not set. In PowerShell:\n  $env:RESEND_KEY=\"paste-key\"\nThen run again. Never paste it as a command argument.\n");
  process.exit(1);
}

let recipients;
if (isTest) {
  recipients = [{ email: TEST_TO, unsub_token: "TESTTOKEN", profile: "{}" }];
  console.log(`TEST MODE. Sending only to ${TEST_TO}`);
} else {
  recipients = getSubscribers();
  console.log(`\nConfirmed subscribers: ${recipients.length}`);
  console.log(`Subject: ${meta.subject}`);
  console.log(`Issue:   NO.${issueNo}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`\nSend to all ${recipients.length}? Type SEND to confirm: `);
  rl.close();
  if (ans.trim() !== "SEND") { console.log("Cancelled. Nothing sent."); process.exit(0); }
}

let sent = 0, failed = 0;
for (const r of recipients) {
  const unsubUrl = `${WORKER}/unsubscribe?t=${r.unsub_token}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [r.email],
      subject: meta.subject,
      html: shell(contentHTML, unsubUrl, issueNo),
      text: plainText(body, unsubUrl),
      headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    })
  });
  if (res.ok) { sent++; process.stdout.write("."); }
  else { failed++; process.stdout.write("x"); }
  await new Promise(r => setTimeout(r, 600));   // stay under Resend's rate limit
}

console.log(`\n\nSent: ${sent}   Failed: ${failed}\n`);