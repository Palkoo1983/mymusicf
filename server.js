/* src/server.js – EnZenem Render‑Proof v4.1 (Sheets‑first, Suno‑safe)
   Minden backend fájl a /src alatt van. Start: node src/server.js
*/
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { generateLyrics } from "./generate-adapter.js";
import { sendAdminNotice } from "./notifier.js";
import { createRow, updateRowByKey } from "./sheetsLogger.js";
import { generateTwoTracks } from "./suno.js";
import { normalizeOrder, pickVocalMode, detectSpecialModes } from "./utils.js";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

app.get("/api/healthz", (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.post("/api/order", async (req, res) => {
  try {
    const orderIn = normalizeOrder(req.body);
    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random()*9999)}`;
    const { isChildSong, isRobot, isDuet } = detectSpecialModes(orderIn);
    const needsSuno = String(orderIn.format || "mp3").toLowerCase() === "mp3";

    const sheetRef = await createRow({
      orderId,
      startedAt: new Date().toISOString(),
      email: orderIn.email,
      style: orderIn.style,
      vocalist: orderIn.vocalist,
      language: orderIn.language,
      brief: orderIn.brief,
      lyrics: "",
      link1: "",
      link2: "",
      status: "RECEIVED",
      error_message: ""
    });

    let lyricsText = "";
    try {
      lyricsText = await generateLyrics({
        brief: orderIn.brief,
        language: orderIn.language,
        isChildSong,
        mustDuet: isDuet
      });
      await updateRowByKey(sheetRef, { lyrics: lyricsText, status: "LYRICS_OK" });
    } catch (err) {
      lyricsText = `Ideiglenes dalszöveg (fallback) – kérjük manuális ellenőrzést:\n\n${orderIn.brief}`;
      await updateRowByKey(sheetRef, {
        lyrics: lyricsText,
        status: "LYRICS_OK",
        error_message: `LYRICS_WARN: ${String(err?.message || err).slice(0,180)}`
      });
      await sendAdminNotice(`[WARN] Lyrics fallback ${orderId}`, `OpenAI hiba/késés. Kérés: ${JSON.stringify(orderIn)}`);
    }

    if (needsSuno) {
      const vocalMode = pickVocalMode(orderIn.vocalist, { isRobot, isDuet });
      try {
        const { link1, link2 } = await generateTwoTracks({
          title: `Pali & Dóri – Szívünk egy dallam`,
          lyrics: lyricsText,
          styles: orderIn.style,
          language: orderIn.language,
          vocalMode,
          flags: { isChildSong, isRobot, isDuet }
        });
        await updateRowByKey(sheetRef, { link1, link2, status: "DONE", error_message: "" });
      } catch (err) {
        await updateRowByKey(sheetRef, {
          status: "PENDING_SUNO",
          error_message: `SUNO_TIMEOUT_OR_FAIL: ${String(err?.message || err).slice(0,180)}`
        });
        await sendAdminNotice(`[PENDING] Suno késés/hiba ${orderId}`, `Sheets ok, manuális utánkövetés kell.\nHiba: ${String(err?.message || err)}`);
      }
    } else {
      await updateRowByKey(sheetRef, { status: "DONE_NON_MP3" });
    }

    return res.json({
      ok: true,
      orderId,
      status: "RECORDED",
      message: needsSuno
        ? "Rögzítve. A zene generálása folyamatban / Sheets-ben követhető."
        : "Rögzítve. (Nem MP3 formátum – Suno nem futott.)"
    });
  } catch (e) {
    await sendAdminNotice(`[ERROR] /api/order totálhiba`, String(e?.stack || e));
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EnZenem backend up on :${PORT}`));
