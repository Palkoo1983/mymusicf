/* src/suno.js – Suno v5 wrapper */
import fetch from "node-fetch";

const SUNO_BASE = process.env.SUNO_BASE_URL;
const SUNO_KEY  = process.env.SUNO_API_KEY;
const TIMEOUT_MS = 45000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("SUNO_TIMEOUT")), ms);
    promise.then(v => { clearTimeout(t); resolve(v); })
           .catch(e => { clearTimeout(t); reject(e); });
  });
}

function buildTags(styles, flags) {
  const tags = [];
  if (styles) styles.split(",").map(s => s.trim()).filter(Boolean).forEach(t => tags.push(t));
  tags.push("folk-pop", "piano", "violin", "electronic");
  if (flags?.isChildSong) tags.push("kids song", "simple lyrics");
  if (flags?.isRobot)     tags.push("robot voice");
  if (flags?.isDuet)      tags.push("duet");
  return [...new Set(tags)];
}

export async function generateTwoTracks({ title, lyrics, styles, language, vocalMode, flags }) {
  const payload = {
    model: "custmod-v5",
    title: title?.slice(0, 80) || "Custom Song",
    lyrics,
    language: language || "magyar",
    tags: buildTags(styles, flags),
    vocals: vocalMode || "female",
    count: 2
  };

  const resp = await withTimeout(fetch(`${SUNO_BASE}/v1/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUNO_KEY}` },
    body: JSON.stringify(payload)
  }));

  if (!resp.ok) throw new Error(`SUNO_HTTP_${resp.status}`);
  const data = await resp.json();
  const link1 = data?.tracks?.[0]?.download_url || "";
  const link2 = data?.tracks?.[1]?.download_url || "";
  if (!link1 && !link2) throw new Error("SUNO_NO_LINKS");
  return { link1, link2 };
}
