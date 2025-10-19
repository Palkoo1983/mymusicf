import { google } from "googleapis";

const SERVICE_EMAIL  = process.env.GOOGLE_SERVICE_EMAIL;
const PRIVATE_KEY_RAW= process.env.GOOGLE_PRIVATE_KEY || "";
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  if (!SERVICE_EMAIL || !PRIVATE_KEY_RAW || !SHEET_ID) {
    throw new Error("Google Sheets env hiányzik (GOOGLE_SERVICE_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID).");
  }
  const privateKey = PRIVATE_KEY_RAW.replace(/\\n/g, "\n");
  return new google.auth.JWT(
    SERVICE_EMAIL,
    null,
    privateKey,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}
function sheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

/** Magyar idő (Europe/Budapest) – YYYY-MM-DD és ISO-szerű időbélyeg + offset */
function getBudapestNow() {
  const tz = "Europe/Budapest";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const ymd = `${obj.year}-${obj.month}-${obj.day}`;
  // rövid offset (pl. GMT+2 → +02:00)
  const offPart = new Intl.DateTimeFormat("en", {
    timeZone: tz, timeZoneName: "shortOffset", hour: "2-digit"
  }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value || "GMT+0";
  const m = offPart.match(/GMT([+\-]\d{1,2})(?::?(\d{2}))?/i);
  let off = "+00:00";
  if (m) {
    const hh = String(m[1]).replace("−","-");
    const h2 = (/^[+\-]\d$/.test(hh)) ? hh[0] + "0" + hh[1] : hh;
    off = `${h2}:${m[2] || "00"}`;
  }
  const isoLocal = `${ymd}T${obj.hour}:${obj.minute}:${obj.second}${off}`;
  return { ymd, isoLocal };
}

/** Létrehoz napi (YYYY-MM-DD) munkalapot; CF szabályt csak megpróbál hozzáadni. */
async function ensureDailySheet(title) {
  const gs = sheets();
  const meta = await gs.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = meta.data.sheets?.find(s => s.properties?.title === title);
  if (existing) return existing.properties.sheetId;

  // 1) Új lap
  const addRes = await gs.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] }
  });
  const sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;

  // 2) Feltételes formázás – HA nem sikerül, nem baj
  try {
    await gs.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 10 }], // A:J
              booleanRule: {
                // fontos: soralapú képlet, nem $J:$J !
                condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=OR($J1="mp4",$J1="wav")' }] },
                format: { backgroundColor: { red: 1.0, green: 1.0, blue: 0.6 } }
              }
            },
            index: 0
          }
        }]
      }
    });
  } catch (e) {
    console.warn("[SHEETS CF WARN]", e?.message || e);
  }

  return sheetId;
}

/** Append sor a napi fülre, magyar idő szerint. */
export async function safeAppendOrderRow(order = {}) {
  try {
    const gs = sheets();
    const { ymd, isoLocal } = getBudapestNow();
    const sheetTitle = ymd; // pl. 2025-10-19
    await ensureDailySheet(sheetTitle);

    const {
      email = "",
      styles = "",
      vocal = "",
      language = "hu",
      brief = "",
      lyrics = "",
      link1 = "",
      link2 = "",
      format = "",
    } = order;

    const values = [[
      isoLocal,
      email,
      styles,
      vocal,
      language,
      brief,
      lyrics,
      link1,
      link2,
      (format || "").toLowerCase()
    ]];

    await gs.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${sheetTitle}!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values }
    });

    console.log("[SHEETS] OK:", email, "→", sheetTitle);
  } catch (e) {
    console.error("[SHEETS ERROR]", e?.message || e);
  }
}

/** Visszafelé kompatibilitás (ha valahol még ezt importálja a szerver) */
export async function appendOrderRow(order = {}) {
  return safeAppendOrderRow(order);
}
