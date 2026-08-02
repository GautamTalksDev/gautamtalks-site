// Builds data/feed.json from the channel's public RSS. No dependencies.
import { writeFileSync, mkdirSync } from "node:fs";

const CHANNEL = "UCpyDH6OnqrndhkyYXAdyS3A";
const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`;

const xml = await (await fetch(url)).text();
const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);

const pick = (s, re) => (s.match(re) || [,""])[1].trim();
const videos = entries.slice(0, 6).map(e => {
  const id = pick(e, /<yt:videoId>(.*?)<\/yt:videoId>/);
  return {
    id,
    title: pick(e, /<title>([\s\S]*?)<\/title>/),
    url: `https://www.youtube.com/watch?v=${id}`,
    thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    date: pick(e, /<published>(.*?)<\/published>/)
  };
});

mkdirSync("data", { recursive: true });
writeFileSync("data/feed.json", JSON.stringify({ updated: new Date().toISOString(), videos }, null, 2));
console.log(`Wrote ${videos.length} videos.`);
