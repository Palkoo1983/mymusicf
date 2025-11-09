import { google } from "googleapis";

const SERVICE_EMAIL   = process.env.GOOGLE_SERVICE_EMAIL;
const PRIVATE_KEY_RAW = process.env.GOOGLE_PRIVATE_KEY || "";
const SHEET_ID        = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  const key = PRIVATE_KEY_RAW.replace(/\\n/g, "\n");
  return new google.auth.JWT(
    SERVICE_EMAIL,
    null,
    key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}
function sheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

/** Magyar idő (Europe/Budapest) → YYYY-MM-DD és ISO időbélyeg */
function getBudapestNow() {
  const tz = "Europe/Budapest";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const p = Object.fromEntries(fmt.map(x => [x.type, x.value]));
  const ymd = `${p.year}-${p.month}-${p.day}`;
  // offset kozmetika (Sheetsnek mindegy)
  const offPart = new Intl.DateTimeFormat("en", {
    timeZone: tz, timeZoneName: "shortOffset", hour: "2-digit"
  }).formatToParts(new Date()).find(x => x.type === "timeZoneName")?.value || "GMT+0";
  const m = offPart.match(/GMT([+\-]\d{1,2})(?::?(\d{2}))?/i);
  let off = "+00:00";
  if (m) {
    const hh = String(m[1]).replace("−", "-");
    const h2 = (/^[+\-]\d$/.test(hh)) ? hh[0] + "0" + hh[1] : hh;
    off = `${h2}:${m[2] || "00"}`;
  }
  return { ymd, iso: `${ymd}T${p.hour}:${p.minute}:${p.second}${off}` };
}

const HEADER = [
  "Időpont","E-mail","Stílus(ok)","Ének","Nyelv",
  "Brief","Dalszöveg","Link #1","Link #2","Formátum","Kézbesítés"
];

/** Lap meta + sheetId lekérés title alapján */
async function getSheetIdByTitle(title) {
  const gs = sheets();
  const meta = await gs.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sh = meta.data.sheets?.find(s => s.properties?.title === title);
  return sh ? sh.properties.sheetId : null;
}

/** Új napi lap létrehozása + fejléc + fagyasztás + CF */
async function createDailySheetFully(title) {
  const gs = sheets();
  const add = await gs.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] }
  });
  const sheetId = add.data.replies?.[0]?.addSheet?.properties?.sheetId;

  // Fejléc
  try {
    await gs.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${title}!A1:K1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] }
    });
  } catch (e) { console.warn("[HEADER write warn]", e?.message || e); }

  // Első sor fagyasztása
  try {
    await gs.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount"
          }
        }]
      }
    });
  } catch (e) { console.warn("[FREEZE warn]", e?.message || e); }

  // CF szabály (kétféle képlettel próbálkozunk – vessző és pontosvessző)
  const cfRanges = [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 }]; // A2:J
  const cfRequests = (formula) => [{
    addConditionalFormatRule: {
      rule: {
        ranges: cfRanges,
        booleanRule: {
          condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] },
          format: { backgroundColor: { red: 1, green: 1, blue: 0.6 } }
        }
      },
      index: 0
    }
  }];

  try {
    await gs.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: cfRequests('=OR($J2="mp4",$J2="wav")') } // EN
    });
  } catch (e1) {
    try {
      await gs.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: cfRequests('=OR($J2="mp4";$J2="wav")') } // HU ; elválasztó
      });
    } catch (e2) {
      console.warn("[CF add warn]", e1?.message || e1, "| fallback:", e2?.message || e2);
    }
  }

  return sheetId;
}

async function ensureHeaderFreezeCF(title) {
  const gs = sheets();
  const sheetId = await getSheetIdByTitle(title);
  if (!sheetId) return;

  // 1) Olvassuk az A1:K1-et
  let row = [];
  try {
    const r = await gs.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${title}!A1:K1`
    });
    row = r.data.values?.[0] || [];
  } catch (_) { row = []; }

  // Segédfüggvény: a jelenlegi sor tényleg a várt fejléc-e?
  const isHeaderMatch = (arr) => {
    if (!arr || arr.length === 0) return false;
    const norm = (x="") => x.toString().trim().toLowerCase();
    const a = arr.map(norm);
    const b = [
      "időpont","e-mail","stílus(ok)","ének","nyelv",
      "brief","dalszöveg","link #1","link #2","formátum","kézbesítés"
    ];
    // pontos egyezés kell az első 10 cellára
    for (let i=0;i<b.length;i++){
      if ((a[i]||"") !== b[i]) return false;
    }
    return true;
  };

  const needInsertHeaderRow = !isHeaderMatch(row);

  if (needInsertHeaderRow) {
    // 2) Beszúrunk egy új sort a tetejére (index 0), hogy ne írjunk felül semmit
    try {
      await gs.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{
            insertDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
              inheritFromBefore: false
            }
          }]
        }
      });
    } catch (e) {
      console.warn("[INSERT top row warn]", e?.message || e);
    }

    // 3) Fejléc kiírása A1:K1-be
    try {
      await gs.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${title}!A1:K1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADER] }
      });
    } catch (e) {
      console.warn("[HEADER write warn]", e?.message || e);
    }
  }

  // 4) Első sor fagyasztása (idempotens)
  try {
    await gs.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount"
          }
        }]
      }
    });
  } catch (e) {
    console.warn("[FREEZE ensure warn]", e?.message || e);
  }

  // 5) CF szabály: próbálkozunk vesszővel és pontosvesszővel is (lokálfüggetlen)
  const cfRanges = [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 }]; // A2:J
  const cfReq = (formula) => [{
    addConditionalFormatRule: {
      rule: {
        ranges: cfRanges,
        booleanRule: {
          condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] },
          format: { backgroundColor: { red: 1, green: 1, blue: 0.6 } }
        }
      },
      index: 0
    }
  }];

  try {
    await gs.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: cfReq('=OR($J2="mp4",$J2="wav")') } // EN, ,
    });
  } catch (e1) {
    try {
      await gs.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: cfReq('=OR($J2="mp4";$J2="wav")') } // HU, ;
      });
    } catch (e2) {
      console.warn("[CF ensure warn]", e1?.message || e1, "| fallback:", e2?.message || e2);
    }
  }
}

/** Fő: napi fül biztosítása + fejléc + freeze + CF + APPEND A2-től (A–K) */
export async function safeAppendOrderRow(order = {}) {
  try {
    const gs = sheets();
    const { ymd, iso } = getBudapestNow();
    const title = ymd;

    let sheetId = await getSheetIdByTitle(title);
    if (!sheetId) {
      sheetId = await createDailySheetFully(title);
    } else {
      await ensureHeaderFreezeCF(title);
    }

    const {
      email = "", styles = "", vocal = "", language = "hu",
      brief = "", lyrics = "", link1 = "", link2 = "", format = "",
      delivery = ""
    } = order;

    const values = [[
      iso, email, styles, vocal, language, brief, lyrics, link1, link2,
      (format || "").toLowerCase(),
      delivery
    ]];

    // ⬇️ új sor felvitele a napi lapra
    const appendRes = await gs.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${title}!A2`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values, majorDimension: "ROWS" }
    });

    // 📍 új sor indexének meghatározása
    const updates = appendRes.data.updates;
    let newRowIndex = 1; // alap: második sor (index 1)
    if (updates && updates.updatedRange) {
      const m = updates.updatedRange.match(/![A-Z]+(\d+)/);
      if (m) newRowIndex = parseInt(m[1], 10) - 1; // Sheets API 0-indexelt
    }

    // 🎨 Háttérszín a K (Kézbesítés) cellában CSAK a friss sorra
    try {
      const colorReqs = [];
      const dl = (delivery || "").toLowerCase();

      if (dl.includes("6 óra")) {
        // 🔴 piros (6 óra)
        colorReqs.push({
          repeatCell: {
            range: { sheetId, startRowIndex: newRowIndex, endRowIndex: newRowIndex + 1, startColumnIndex: 10, endColumnIndex: 11 },
            cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.4, blue: 0.4 } } },
            fields: "userEnteredFormat.backgroundColor"
          }
        });
      } else if (dl.includes("24 óra")) {
        // 🟠 narancs (24 óra)
        colorReqs.push({
          repeatCell: {
            range: { sheetId, startRowIndex: newRowIndex, endRowIndex: newRowIndex + 1, startColumnIndex: 10, endColumnIndex: 11 },
            cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.65, blue: 0 } } },
            fields: "userEnteredFormat.backgroundColor"
          }
        });
      }

      if (colorReqs.length > 0) {
        await gs.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { requests: colorReqs }
        });
      }
    } catch (e) {
      console.warn("[COLOR warn]", e?.message || e);
    }

    console.log("[SHEET OK]", title, email);
  } catch (e) {
    console.error("[SHEET ERR]", e?.message || e);
  }
}

// kompatibilitás
export async function appendOrderRow(o = {}) {
  return safeAppendOrderRow(o);
}
