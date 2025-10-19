import { google } from "googleapis";

const SERVICE_EMAIL  = process.env.GOOGLE_SERVICE_EMAIL;
const PRIVATE_KEY_RAW= process.env.GOOGLE_PRIVATE_KEY || "";
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;

function getAuth() {
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
  const yyyy = obj.year;
  const mm   = obj.month;
  const dd   = obj.day;
  const HH   = obj.hour;
  const MM   = obj.minute;
  const SS   = obj.second;

  // Offset lekérése rövid offset formával (pl. GMT+2 → +02:00)
  const tzName = new Intl.DateTimeFormat("en", {
    timeZone: tz,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value || "GMT+0";

  const m = tzName.match(/GMT([+\-]\d{1,2})(?::?(\d{2}))?/i);
  let off = "+00:00";
  if (m) {
    const h = String(m[1]).padStart(3, "0");         // +2 → +02
    const min = m[2] ? m[2] : "00";
    off = `${h.startsWith("+")||h.startsWith("-") ? h : (h.startsWith("−")?("-"+h.slice(1)) : h)}:${min}`;
    if (/^\+\d$|^-\d$/.test(off.slice(0,2))) off = off.replace(/^([+-])(\d)(?=:)/, (_,$1,$2)=>$1+"0"+$2);
  }

  const ymd = `${yyyy}-${mm}-${dd}`;
  const isoLocal = `${ymd}T${HH}:${MM}:${SS}${off}`;
  return { ymd, isoLocal };
}

/** Ellenőrzi/létrehozza a napi (YYYY-MM-DD) munkalapot és hozzáadja a sárga CF szabályt mp4/wav-ra. */
async function ensureDailySheet(title) {
  const gs = sheets();

  // Megnézzük, létezik-e a lap
  const meta = await gs.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = meta.data.sheets?.find(s => s.properties?.title === title);
  if (existing) {
    return existing.properties.sheetId;
  }

  // 1) Új lap létrehozása
  const addRes = await gs.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 0 },
            },
          },
        },
      ],
    },
  });
  const sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;

  // 2) Feltételes formázás hozzáadása: J oszlop "mp4" vagy "wav" → sárga háttér
  // Használunk CUSTOM_FORMULA-t az egész tartományra (A:J)
  await gs.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [
                { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 10 } // A:J
              ],
              booleanRule: {
                condition: {
                  type: "CUSTOM_FORMULA",
                  values: [{ userEnteredValue: '=OR($J:$J="mp4",$J:$J="wav")' }]
                },
                format: {
                  backgroundColor: { red: 1.0, green: 1.0, blue: 0.6 } // halvány sárga
                }
              }
            },
            index: 0
          }
        }
      ]
    }
  });

  return sheetId;
}

/** Központi logoló – mostantól napi fülre ír, magyar idő szerint. */
export async function safeAppendOrderRow(order = {}) {
  try {
    const gs = sheets();
    const { ymd, isoLocal } = getBudapestNow();
    const sheetTitle = ymd; // pl. "2025-10-19"

    // Napi lap biztosítása + CF szabály
    await ensureDailySheet(sheetTitle);

    // Oszlopok: A:Időpont B:E-mail C:Stílus(ok) D:Ének E:Nyelv F:Brief G:Dalszöveg H:Link#1 I:Link#2 J:Formátum
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
      isoLocal,  // magyar idő szerint időbélyeg
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
// a fájl VÉGÉRE tedd (vagy a safeAppendOrderRow alá):

export async function appendOrderRow(order = {}) {
  // kompatibilitás a régi importtal
  return safeAppendOrderRow(order);
}
