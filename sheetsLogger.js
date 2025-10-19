// sheetsLogger.js
import { google } from 'googleapis';

const SERVICE_EMAIL  = process.env.GOOGLE_SERVICE_EMAIL;
const PRIVATE_KEY_RAW= process.env.GOOGLE_PRIVATE_KEY || '';
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  if (!SERVICE_EMAIL || !PRIVATE_KEY_RAW || !SHEET_ID) {
    throw new Error('Google Sheets env hiányzik (GOOGLE_SERVICE_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID).');
  }
  const privateKey = PRIVATE_KEY_RAW.replace(/\\n/g, '\n');
  return new google.auth.JWT(SERVICE_EMAIL, null, privateKey, ['https://www.googleapis.com/auth/spreadsheets']);
}

function sheets() { return google.sheets({ version: 'v4', auth: getAuth() }); }

export async function appendOrderRow(order = {}) {
  const { email='', styles='', vocal='', language='hu', brief='', lyrics='', link1='', link2='', format='' } = order;
  const values = [[
    new Date().toISOString(), // A: Időpont
    email,                    // B: E-mail
    styles,                   // C: Stílus(ok)
    vocal,                    // D: Ének
    language,                 // E: Nyelv
    brief,                    // F: Brief
    lyrics,                   // G: Dalszöveg
    link1,                    // H: Link #1
    link2,                    // I: Link #2
    format                    // J: Formátum
  ]];
  await sheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'A:J',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
}

export async function safeAppendOrderRow(order) {
  try {
    await appendOrderRow(order);
    console.log('[SHEETS] OK:', order?.email || 'n/a');
  } catch (e) {
    console.error('[SHEETS-FAIL]', (e && e.message) || String(e));
  }
}
