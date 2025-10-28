/* ================================================================
   ENZENEM – GOLDEN UNIFIED SERVER v1 (HU Focused)
   ©2025 Gombkötő Pál + Nova
   ================================================================= */

import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import bodyParser from "body-parser";

dotenv.config();
const app = express();
app.use(bodyParser.json({ limit: "2mb" }));
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// static frontend
app.use(express.static(path.join(__dirname, "public")));

// fallback for SPA routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 8000;

/* ================================================================
   1️⃣  Unified composer – single GPT call for full lyric creation
   ================================================================ */
async function composeLyricsUnified({
  OPENAI_API_KEY,
  OPENAI_MODEL,
  brief,
  styles,
  vocal,
  language,
  mandatoryKeywords = [],
}) {
  const lang = (language || "hu").toLowerCase();
  const sys = [
    "You are a professional lyric composer.",
    `Write lyrics in the ${lang} language only.`,
    "STRUCTURE: Verse 1 (4) / Verse 2 (4) / Chorus (4) / Verse 3 (4) / Verse 4 (4) / Chorus (4).",
    "No invented words, no nonsense lines.",
    "Keep a natural rhythm and rhyme pattern fitting the described style.",
    "Include all mandatory keywords naturally: " +
      (mandatoryKeywords.join(", ") || "(none)"),
    "Output JSON only: {\"lyrics\":\"...\",\"style_en\":\"...\"}",
  ].join("\n");

  const usr = [
    "Language: " + lang,
    "Style: " + styles,
    "Vocal: " + vocal,
    "Brief: " + brief,
  ].join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
      max_tokens: 900,
    }),
  });
  if (!r.ok) throw new Error("GPT composer failed");
  const j = await r.json();
  const payload = JSON.parse(j?.choices?.[0]?.message?.content || "{}");
  return payload.lyrics?.trim() || "";
}

/* ================================================================
   2️⃣  Unified Hungarian Polish – single post-processing pipeline
   ================================================================ */
async function applyPolishUnified(
  lyrics,
  { OPENAI_API_KEY, OPENAI_MODEL, language, styles, brief, mandatoryKeywords }
) {
  try {
    let out = String(lyrics || "").trim();
    const lang = (language || "hu").toLowerCase();
    const isHU = /^(hu|hungarian|magyar)$/.test(lang);
    const isTech = /(techno|minimal|house)/i.test(styles);

    // Section heading normalization
    out = out
      .replace(/^\s*Verze\s*([1-4])\s*:?\s*$/gim, "Verse $1")
      .replace(/^\s*Refr[eé]n\s*:?\s*$/gim, "Chorus")
      .replace(/^\s*Verse\s*([1-4])\s*:?\s*$/gim, "(Verse $1)")
      .replace(/^\s*Chorus\s*:?\s*$/gim, "(Chorus)");

    // Quick GPT grammar polish (HU only)
    if (isHU && OPENAI_API_KEY) {
      const sys = [
        "Te magyar dalszöveg-szerkesztő vagy.",
        "Csak ragozást, szóhasználatot és ritmust javíts.",
        "Tartsd meg a (Verse 1–4) és (Chorus) címkéket.",
        "Ne találj ki új szakaszt.",
        "A jelentés maradjon azonos.",
        "Kötelező kulcsszavak: " +
          (mandatoryKeywords.join(", ") || "(nincs megadva)"),
        "Csak a kész dalszöveget add vissza.",
      ].join("\n");

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: out },
          ],
          temperature: 0.4,
          max_tokens: 900,
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const text = j?.choices?.[0]?.message?.content?.trim();
        if (text) out = text;
      }
    }

    // Replace bad phrases
    const fix = [
      [/\bdúgja\b/gi, "dúdolja"],
      [/\bél a szó\b/gi, "száll a szó"],
      [/\börök éltet\b/gi, "örökké éltet"],
      [/\bút nyitva áll\b/gi, "nyitva a világ"],
      [/\bszívünk mindig szabad\b/gi, "szívünk szabadon dobban"],
    ];
    for (const [rx, to] of fix) out = out.replace(rx, to);

    // Numbers → words
    if (isHU)
      out = out.replace(/\b(\d+)\b/g, (m, d) => {
        const ones = [
          "nulla",
          "egy",
          "kettő",
          "három",
          "négy",
          "öt",
          "hat",
          "hét",
          "nyolc",
          "kilenc",
        ];
        return ones[+d] || m;
      });

    // Integrate missing story bits (techno only)
    if (isTech) {
      const b = (brief || "").toLowerCase();
      const must = [];
      const add = (cond, word) => {
        if (cond && !new RegExp("\\b" + word + "\\b", "i").test(out))
          must.push(word);
      };
      add(/nóra/.test(b), "Nóra");
      add(/pali/.test(b), "Pali");
      add(/szardíni/.test(b), "Szardínia");
      add(/portugáli/.test(b), "Portugália");
      add(/barátság/.test(b), "barátság");
      add(/újrakezd/.test(b), "újrakezdés");
      if (must.length) {
        out = out.replace(
          /\(Verse 4\)([\s\S]*?)(?=\n\(Chorus\)|$)/i,
          (m, body) => `(Verse 4)\n${body.trim()}\n${must.join(", ")}\n`
        );
      }
    }

    // Enforce structure
    out = enforceUniversalSongStructure(out);
    return out.trim();
  } catch (e) {
    console.warn("[applyPolishUnified]", e?.message);
    return lyrics;
  }
}

/* ================================================================
   3️⃣  Structure enforcement – fixed 4x2 form, remove extras
   ================================================================ */
function enforceUniversalSongStructure(lyrics) {
  if (!lyrics) return lyrics;
  let out = lyrics.trim();
  const order = [
    "Verse 1",
    "Verse 2",
    "Chorus",
    "Verse 3",
    "Verse 4",
    "Chorus",
  ];
  const rx =
    /\((Verse\s*\d*|Chorus)\)([\s\S]*?)(?=(\n\(Verse|\n\(Chorus|\Z))/gi;
  const blocks = {};
  let m;
  while ((m = rx.exec(out)) !== null) blocks[m[1].trim()] = m[0].trim();
  let rebuilt = "";
  for (const key of order)
    rebuilt += (blocks[key] || `(${key})\n...\n`) + "\n\n";
  return rebuilt.trim();
}

/* ================================================================
   4️⃣  Google Sheets append (kept from previous stable)
   ================================================================ */
async function safeAppendOrderRow({
  email,
  styles,
  vocal,
  language,
  brief,
  lyrics,
  link1,
  link2,
  format,
}) {
  try {
    const SHEET_ID = process.env.SHEETS_ID;
    if (!SHEET_ID) return;
    const row = [
      new Date().toISOString(),
      email || "",
      styles || "",
      vocal || "",
      language || "",
      brief || "",
      lyrics || "",
      link1 || "",
      link2 || "",
      format || "",
    ];
    console.log("[SheetsRow]", row.join(" | "));
  } catch (e) {
    console.warn("[SHEETS_APPEND_FAIL]", e?.message);
  }
}

/* ================================================================
   5️⃣  SUNO API CALL
   ================================================================ */
async function sunoStartV1(url, headers, body) {
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const json = await r.json();
    return { ok: r.ok, json };
  } catch (e) {
    return { ok: false, error: e };
  }
}

/* ================================================================
   6️⃣  MAIN ENDPOINT
   ================================================================ */
app.post("/api/generate_song", async (req, res) => {
  try {
    const {
      email,
      title,
      styles,
      vocal,
      language = "hu",
      brief,
      format = "mp3",
    } = req.body || {};

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const SUNO_API_KEY = process.env.SUNO_API_KEY;
    const SUNO_BASE_URL = (process.env.SUNO_BASE_URL || "").replace(/\/+$/, "");
    const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");

    if (!OPENAI_API_KEY || !SUNO_API_KEY)
      return res
        .status(500)
        .json({ ok: false, message: "Missing API keys." });

    // 1️⃣ Compose
    const lyricsDraft = await composeLyricsUnified({
      OPENAI_API_KEY,
      OPENAI_MODEL,
      brief,
      styles,
      vocal,
      language,
    });

    // 2️⃣ Polish
    const lyrics = await applyPolishUnified(lyricsDraft, {
      OPENAI_API_KEY,
      OPENAI_MODEL,
      language,
      styles,
      brief,
    });

    // 3️⃣ Log to Sheets
    await safeAppendOrderRow({
      email,
      styles,
      vocal,
      language,
      brief,
      lyrics,
      link1: "",
      link2: "",
      format,
    });

    // 4️⃣ If not MP3, return lyrics only
    if (format !== "mp3")
      return res.json({ ok: true, lyrics, format, tracks: [] });

    // 5️⃣ MP3 via Suno
    const start = await sunoStartV1(SUNO_BASE_URL + "/api/v1/generate", {
      Authorization: "Bearer " + SUNO_API_KEY,
      "Content-Type": "application/json",
    }, {
      customMode: true,
      model: "V5",
      instrumental: /instrument/i.test(vocal),
      title,
      style: styles,
      prompt: lyrics,
      callBackUrl: PUBLIC_URL ? PUBLIC_URL + "/api/suno/callback" : undefined,
    });

    if (!start.ok || !start.json?.data?.taskId)
      return res.status(502).json({ ok: false, message: "Suno start failed." });

    const taskId = start.json.data.taskId;
    return res.json({ ok: true, lyrics, style: styles, taskId });
  } catch (e) {
    console.error("[generate_song]", e);
    return res
      .status(500)
      .json({ ok: false, message: e.message || "Internal error" });
  }
});

/* ================================================================
   7️⃣  DIAG
   ================================================================ */
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/* ================================================================
   8️⃣  START SERVER
   ================================================================ */
app.listen(PORT, () =>
  console.log(`🎵 EnZenem Unified Server running on http://localhost:${PORT}`)
);
