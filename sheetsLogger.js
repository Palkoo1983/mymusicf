// sheetsLogger.js
import { google } from 'googleapis';

const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_EMAIL;
const PRIVATE_KEY_RAW = process.env.GOOGLE_PRIVATE_KEY || '';
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  if (!SERVICE_EMAIL || !PRIVATE_KEY_RAW || !SHEET_ID) {
    throw new Error('Google Sheets env hiányzik (GOOGLE_SERVICE_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID).');
  }
  const privateKey = PRIVATE_KEY_RAW.replace(/\\n/g, '\n'); // Render kompatibilis
  return new google.auth.JWT(
    SERVICE_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

/** Egy rendelés feljegyzése 1 sorba (B..J oszlopok). */
export async function appendOrderRow({ email='', styles='', vocal='', language='', brief='', lyrics='', link1='', link2='' }) {
  const when = new Date().toISOString();
  const sheets = getSheets();
  const range = 'Munkalap1!A:I'; // A: sorszám képlettel, ezért B-től írunk
  const values = [[ when, email, styles, vocal, language, brief, lyrics, link1, link2 ]];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
}
