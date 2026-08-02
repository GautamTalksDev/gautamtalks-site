// Builds data/feed.json from the channel's public RSS. No dependencies, no API key.
// Long-form only: youtube.com/shorts/<id> returns 200 for a Short and redirects for a
// regular video, so a HEAD request tells us which is which.
import { writeFileSync, mkdirSync } from "node:fs";

const CHANNEL = "UCpyDH6OnqrndhkyYXAdyS3A";
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`;
const WANT = 3;
const SCAN_LIMIT = 20;

// ── EXCLUDE LIST ────────────────────────────────────────────────
// The public RSS feed carries no duration, so short-length uploads that
// YouTube does not file as "Shorts" cannot be detected automatically.
// Paste any video ID here and it will never appear on the site.
// The ID is the part after watch?v=  e.g. https://youtube.com/watch?v=-p6_WSY45nA
const EXCLUDE = new Set([
  "-p6_WSY45nA",   // When the squad locks in... (0:17)
]);
// ────────────────────────────────────────────────────────────────

const res = await fetch(FEED, { headers: { "user-agent": "gautamtalks-feed/1.0" } });
if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
const xml = await res.text();

const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
console.log(`RSS entries found: ${entries.length}`);

const pick = (s, re) => { const m = s.match(re); return m ? m[1].trim() : ""; };
const unesc = s => s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'");

async function isShort(id) {
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, {
      method: "HEAD", redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; gautamtalks-feed/1.0)" }
    });
    return r.status === 200;
  } catch { return false; }
}

const all = entries.slice(0, SCAN_LIMIT).map(e => {
  const id = pick(e, /<yt:videoId>(.*?)<\/yt:videoId>/);
  return {
    id,
    title: unesc(pick(e, /<title>([\s\S]*?)<\/title>/)),
    url: `https://www.youtube.com/watch?v=${id}`,
    thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    thumbHi: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    date: pick(e, /<published>(.*?)<\/published>/)
  };
}).filter(v => v.id);

const videos = [];
for (const v of all) {
  if (videos.length >= WANT) break;
  if (EXCLUDE.has(v.id)) { console.log(`skip (excluded): ${v.title}`); continue; }
  if (/#shorts?\b/i.test(v.title)) { console.log(`skip (title): ${v.title}`); continue; }
  if (await isShort(v.id)) { console.log(`skip (short): ${v.title}`); continue; }
  console.log(`keep: ${v.title}`);
  videos.push(v);
}

mkdirSync("data", { recursive: true });
writeFileSync("data/feed.json", JSON.stringify({ updated: new Date().toISOString(), videos }, null, 2));
console.log(`Wrote ${videos.length} long-form videos.`);
if (!videos.length) console.log("WARNING: no long-form videos found.");
