/* sheetsLogger.js – Sheets Golden Stable + status/err */
import { google } from "googleapis";
import { utcToZonedTime, format } from "date-fns-tz";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const SHEET_ID = process.env.SHEETS_ID || "1hafCZIh4u-20UMWh7799z9rHWOOrqCFjBbcTSoDPSPU";
const TIMEZONE = "Europe/Budapest";

const auth = new google.auth.GoogleAuth({ scopes: SCOPES });
const sheets = google.sheets({ version: "v4", auth });

function todaySheetName() {
  const now = new Date();
  const buda = utcToZonedTime(now, TIMEZONE);
  return format(buda, "yyyy-MM-dd");
}

async function ensureHeader(sheetName) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
  }).catch(() => {});

  const header = [["orderId","timestamp","email","style","vocalist","language","brief","lyrics","link1","link2","status","error_message"]];
  const rng = `${sheetName}!A1:L1`;
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: rng }).catch(() => null);
  const has = existing && existing.data && Array.isArray(existing.data.values) && existing.data.values.length;
  if (!has) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: rng,
      valueInputOption: "RAW",
      requestBody: { values: header }
    });
  }
}

export async function createRow(entry) {
  const sheetName = todaySheetName();
  await ensureHeader(sheetName);

  const row = [
    entry.orderId,
    new Date().toISOString(),
    entry.email || "",
    entry.style || "",
    entry.vocalist || "",
    entry.language || "",
    entry.brief || "",
    entry.lyrics || "",
    entry.link1 || "",
    entry.link2 || "",
    entry.status || "RECEIVED",
    entry.error_message || ""
  ];

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] }
  });

  const updates = appendRes.data.updates || {};
  const updatedRange = updates.updatedRange || "";
  const rowIndex = Number((updatedRange.split("!")[1] || "").split(":")[0].match(/\d+$/)?.[0] || 2);
  const a1Key = `${sheetName}!A${rowIndex}:L${rowIndex}`;
  return { sheetName, rowIndex, a1Key };
}

export async function updateRowByKey(ref, fields) {
  const headers = ["orderId","timestamp","email","style","vocalist","language","brief","lyrics","link1","link2","status","error_message"];

  const getRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: ref.a1Key
  });
  const row = (getRes.data.values && getRes.data.values[0]) || new Array(headers.length).fill("");

  const idx = (name) => headers.indexOf(name);
  Object.entries(fields).forEach(([k,v]) => {
    const i = idx(k);
    if (i >= 0) row[i] = v == null ? "" : String(v);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: ref.a1Key,
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  });
}
