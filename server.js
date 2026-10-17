import { registerNovaChat } from './novaChat.js';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { safeAppendOrderRow, getAndIncrementInvoiceSeq } from './sheetsLogger.js';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import {
  computeOrderTotal,
  normalizeOrderForPayment,
  responseJsonPreservingOrderCode,
  validateVivaTransaction
} from './paymentSecurity.js';


// === DUPLA RENDELÉSFELDOLGOZÁS / DUPLA FIZETÉS ELLENI VÉDELEM ===
// (Nem globál bool: orderCode/transactionId alapján deduplikálunk rövid TTL-lel.)
const processedPayments = new Map(); // key -> ts
const PAYMENT_TTL_MS = 6 * 60 * 60 * 1000; // 6 óra

// === RENDELÉS ADATOK BIZTONSÁGOS TÁROLÁSA (global.lastOrderData kiváltása) ===
// Viva orderCode alapján tároljuk a rendelés payloadot rövid TTL-lel,
// hogy párhuzamos fizetéseknél se csússzanak össze az adatok.
const pendingOrders = new Map(); // orderCode -> { ts, order }
const ORDER_TTL_MS = 6 * 60 * 60 * 1000; // 6 óra
const PENDING_ORDERS_FILE = './data/pending-orders.json';

function ensureDataDir() {
  const dir = './data';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function persistPendingOrders() {
  try {
    ensureDataDir();
    // csak a szükséges minimális adatot mentjük
    const out = {};
    for (const [oc, rec] of pendingOrders) {
      if (oc && rec && rec.ts && rec.order) out[oc] = rec;
    }
    fs.writeFileSync(PENDING_ORDERS_FILE, JSON.stringify(out, null, 2), 'utf8');
  } catch (e) {
    console.warn('[PENDING_ORDERS] persist failed:', e?.message || e);
  }
}

function restorePendingOrders() {
  try {
    ensureDataDir();
    if (!fs.existsSync(PENDING_ORDERS_FILE)) return;
    const raw = fs.readFileSync(PENDING_ORDERS_FILE, 'utf8');
    const json = JSON.parse(raw || '{}');
    if (!json || typeof json !== 'object') return;
    const now = Date.now();
    for (const [oc, rec] of Object.entries(json)) {
      if (!oc || !rec || !rec.ts || !rec.order) continue;
      if ((now - rec.ts) > ORDER_TTL_MS) continue;
      pendingOrders.set(String(oc), rec);
    }
  } catch (e) {
    console.warn('[PENDING_ORDERS] restore failed:', e?.message || e);
  }
}

// Induláskor visszatöltjük a még élő (TTL-en belüli) pending order rekordokat.
restorePendingOrders();

function cleanupPendingOrders(now) {
  for (const [oc, rec] of pendingOrders) {
    if (!rec || !rec.ts || (now - rec.ts) > ORDER_TTL_MS) pendingOrders.delete(oc);
  }
}

function storePendingOrder(orderCode, order) {
  const oc = (orderCode || '').toString().trim();
  if (!oc) return;
  cleanupPendingOrders(Date.now());
  pendingOrders.set(oc, { ts: Date.now(), order: order || {} });
  persistPendingOrders();
}

function loadPendingOrder(orderCode) {
  const oc = (orderCode || '').toString().trim();
  if (!oc) return null;
  cleanupPendingOrders(Date.now());
  const rec = pendingOrders.get(oc);
  return rec && rec.order ? rec.order : null;
}

function deletePendingOrder(orderCode) {
  const oc = (orderCode || '').toString().trim();
  if (!oc) return;
  pendingOrders.delete(oc);
  persistPendingOrders();
}

// === INTERNAL CLIENT REF (enz_ref) ===
// We add our own reference to success/fail URLs so the redirect ALWAYS contains a key,
// even if Viva does not append orderCode/transactionId.
function makeEnzRef() {
  return 'enz_' + Date.now().toString(36) + '_' + crypto.randomBytes(16).toString('hex');
}

function extractEnzRef(req) {
  const q = (req && req.query) ? req.query : {};
  const v = q.enz_ref || q.enzRef || q.enzref || q.enzenem_ref || q.enzenemRef || q.ref || q.reference;
  return (v !== undefined && v !== null) ? String(v).trim() : '';
}

function paymentKey(orderCode, transactionId) {
  const oc = (orderCode || '').toString().trim();
  const tx = (transactionId || '').toString().trim();
  if (oc && tx) return `oc:${oc}|tx:${tx}`;
  if (tx) return `tx:${tx}`;
  if (oc) return `oc:${oc}`;
  return '';
}


// --- Extract Viva redirect params robustly ---
// Viva Smart Checkout redirect may not use 'orderCode'/'transactionId' keys consistently.
// We try common keys + any 16-digit token in query values / URL.
function extractOrderCode(req) {
  const q = (req && req.query) ? req.query : {};
  const candidates = [
    q.orderCode, q.ordercode, q.OrderCode, q.order_code,
    q.ref, q.reference, q.s, q.oc, q.order
  ].filter(v => v !== undefined && v !== null && String(v).trim() !== '');
  if (candidates.length) return String(candidates[0]).trim();

  // Any 16-digit value in query?
  for (const v of Object.values(q)) {
    const sv = (v !== undefined && v !== null) ? String(v).trim() : '';
    if (/^\d{16}$/.test(sv)) return sv;
  }

  // Fallback: search 16-digit token in URL
  const url = (req && (req.originalUrl || req.url)) ? String(req.originalUrl || req.url) : '';
  const m = url.match(/\b\d{16}\b/);
  return m ? m[0] : '';
}

function extractTransactionId(req) {
  const q = (req && req.query) ? req.query : {};
  const candidates = [
    q.transactionId, q.transactionid, q.transaction_id,
    q.t, q.tx, q.trx, q.trxId, q.transaction
  ].filter(v => v !== undefined && v !== null && String(v).trim() !== '');
  if (candidates.length) return String(candidates[0]).trim();

  // If any value looks like a UUID, take it
  for (const v of Object.values(q)) {
    const sv = (v !== undefined && v !== null) ? String(v).trim() : '';
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(sv)) return sv;
  }
  return '';
}

function cleanupProcessedPayments(now) {
  // ritka, olcsó takarítás
  for (const [k, ts] of processedPayments) {
    if (now - ts > PAYMENT_TTL_MS) processedPayments.delete(k);
  }
}

function isPaymentProcessed(key) {
  if (!key) return false;
  const now = Date.now();
  cleanupProcessedPayments(now);
  const ts = processedPayments.get(key);
  return !!ts && (now - ts) <= PAYMENT_TTL_MS;
}

function markPaymentProcessed(key) {
  if (!key) return;
  processedPayments.set(key, Date.now());
}

function getCounterFile(isTest) {
  const dir = './data';

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return isTest
    ? `${dir}/invoice-counter-test.json`
    : `${dir}/invoice-counter-live.json`;
}


function readCounter(isTest) {
  const file = getCounterFile(isTest);
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[INVOICE COUNTER READ ERROR]', e.message);
  }
  return { year: new Date().getFullYear(), seq: 0 };
}

function writeCounter(isTest, data) {
  const file = getCounterFile(isTest);
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[INVOICE COUNTER WRITE ERROR]', e.message);
  }
}

async function getNextInvoiceNumber(isTest) {
  const prefix = isTest ? 'TESZT-ENZ' : 'ENZ';

  try {
    // Elsődleges: Google Sheets-alapú perzisztens számlaszámláló
    const { year, seq } = await getAndIncrementInvoiceSeq(isTest);
    const seqStr = String(seq).padStart(6, '0');
    return `${prefix}-${year}-${seqStr}`;
  } catch (e) {
    console.warn('[INVOICE COUNTER SHEETS ERROR]', e?.message || e);

    // Fallback: régi JSON-alapú logika, hogy a számlázás ne álljon le
    const now = new Date();
    const year = now.getFullYear();

    let counter = readCounter(isTest);

    if (counter.year !== year) {
      counter = { year, seq: 0 };
    }

    counter.seq += 1;
    writeCounter(isTest, counter);

    const seqStr = String(counter.seq).padStart(6, '0');
    return `${prefix}-${year}-${seqStr}`;
  }
}


dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
/* ================== ENV / Mail settings =================== */
const ENV = {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  MAIL_FROM: process.env.MAIL_FROM || process.env.SMTP_FROM,
  TO_EMAIL:  process.env.TO_EMAIL  || process.env.NOTIFY_TO,
  SMTP_SECURE: (process.env.SMTP_SECURE || '').toString().toLowerCase() === 'true',
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_ONLY: (process.env.RESEND_ONLY || '').toString().toLowerCase() === 'true'
};
const INVOICE_MODE = (process.env.INVOICE_MODE || 'test').toString().toLowerCase(); 
// 'off' | 'test' | 'live'


const INVOICE_SEED = {
  sellerName: 'Gombkötő Pál egyéni vállalkozó',
  regNumber: '61398205',
  taxNumber: '91555179-1-43',
  statNumber: '91555179-9013-231-01',
  address: '1097 Budapest, Aszódi utca 8. 123. ajtó',
  currency: 'HUF'
};

/**
 * Számla PDF generálása
 * mode: 'test' | 'live'
 * total: bruttó összeg (Ft)
 * order: a rendelés payload (megrendelési adatok)
 */
async function generateInvoicePDF({ mode, total, order }) {
  const isTest = mode === 'test';
  const invoiceNo = await getNextInvoiceNumber(isTest);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // 🔥 UTF-8 kompatibilis betűtípus betöltése
  try {
    doc.registerFont('dejavu', 'public/fonts/DejaVuSans.ttf');
    doc.font('dejavu');
  } catch (e) {
    console.warn('[INVOICE FONT ERROR] Nem található a DejaVuSans.ttf:', e.message);
  }

  const chunks = [];
  doc.on('data', c => chunks.push(c));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), invoiceNo }));
    doc.on('error', err => reject(err));

    const today = new Date();
    const dateStr = today.toLocaleDateString('hu-HU');

    const o = order || {};
    const isCompany =
      !!(o.invoice_company && o.invoice_company !== 'false' && o.invoice_company !== '0');

    const buyerName = isCompany
      ? (o.invoice_company_name || 'Céges vevő')
      : (o.email ? `Magánszemély (${o.email})` : 'Magánszemély');

    const buyerVat = isCompany ? (o.invoice_vat_number || '') : '';
    const buyerAddress = isCompany
      ? (o.invoice_address || '')
      : (o.email ? `E-mail: ${o.email}` : '');

    const pkg = (o.package || o.format || 'basic').toString().toLowerCase();
    let itemName = '2 dalváltozat + PDF - MP3';
    if (pkg === 'video') itemName = '2 dalváltozat + PDF - MP4';
    else if (pkg === 'premium') itemName = '2 dalváltozat + PDF - WAV';

    const qty = 1;
    const gross = total || 0;
    const grossText = `${gross.toLocaleString('hu-HU')} Ft`;

    // ========= PDF TARTALOM =========

    doc.fontSize(16).text(
      isTest ? 'TESZT SZÁMLA – NEM ADÓÜGYI BIZONYLAT' : 'SZÁMLA',
      { align: 'right' }
    );

    doc.moveDown(0.5);
    doc.fontSize(10)
      .text(`Számlaszám: ${invoiceNo}`, { align: 'right' })
      .text(`Kelt: ${dateStr}`, { align: 'right' })
      .text(`Teljesítés dátuma: ${dateStr}`, { align: 'right' })
      .text(`Fizetési határidő: ${dateStr}`, { align: 'right' })
      .text('Fizetés módja: Bankkártya (online)', { align: 'right' });

    doc.moveDown(1.2);

    // --- Eladó ---
    doc.fontSize(12).text('Számlakibocsátó:', { underline: true });
    doc.fontSize(10)
      .text(INVOICE_SEED.sellerName)
      .text(`Nyilvántartási szám: ${INVOICE_SEED.regNumber}`)
      .text(`Adószám: ${INVOICE_SEED.taxNumber}`)
      .text(`Statisztikai számjel: ${INVOICE_SEED.statNumber}`)
      .text(`Székhely: ${INVOICE_SEED.address}`)
      .text('Adózás: Alanyi adómentes (AAM – ÁFA tartalma 0%)');

    doc.moveDown(1);

    // --- Vevő ---
    doc.fontSize(12).text('Vevő:', { underline: true });
    doc.fontSize(10).text(buyerName);
    if (buyerVat) doc.text(`Adószám: ${buyerVat}`);
    if (buyerAddress) doc.text(buyerAddress);

    doc.moveDown(1);

    // --- Tételek táblázat ---
    doc.fontSize(12).text('Tételek:');
    doc.moveDown(0.5);

    doc.fontSize(10);
    doc.text('Megnevezés', 50, doc.y, { continued: true });
    doc.text('Menny.', 280, doc.y, { continued: true });
    doc.text('Egységár (bruttó)', 330, doc.y, { continued: true });
    doc.text('Összeg (bruttó)', 450);
    doc.moveDown(0.3);

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    doc.text(itemName, 50, doc.y, { width: 220, continued: true });
    doc.text(`${qty} db`, 280, doc.y, { continued: true });
    doc.text(`${gross.toLocaleString('hu-HU')} Ft`, 330, doc.y, { continued: true });
    doc.text(grossText, 450);

    doc.moveDown(0.5);
    doc.moveTo(350, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    doc.text('Végösszeg (AAM):', 350, doc.y, { continued: true });
    doc.text(grossText, 450);

    doc.moveDown(1);

    doc.fontSize(8).fillColor('gray')
      .text('Megjegyzés: a számla alanyi adómentes, ÁFA tartalma 0%.', 50, doc.y, { width: 500 });

    if (isTest) {
      doc.moveDown(0.5);
      doc.text('TESZT ÜZEMMÓD – kizárólag belső ellenőrzésre.', 50, doc.y, { width: 500 });
    }

    doc.end();
  });
}

/* ================== Middleware / static ================= */
const allowedOrigins = new Set([
  'https://enzenem.hu',
  'https://www.enzenem.hu'
]);
try {
  if (process.env.PUBLIC_URL) allowedOrigins.add(new URL(process.env.PUBLIC_URL).origin);
} catch (_e) {
  console.warn('[CORS] A PUBLIC_URL nem érvényes URL, csak az enzenem.hu domainek engedélyezettek.');
}

app.use(cors({
  origin(origin, callback) {
    // A böngészőn kívüli szerverhívásoknak nincs Origin fejléce.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  }
}));
app.use(express.json({ limit: '64kb' }));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));
registerNovaChat(app);

/* ----------------- Simple rate-limit -------------------- */
const hitMap = new Map();
function rateLimit(key, windowMs=10000, max=5){
  const now = Date.now();
  const rec = hitMap.get(key) || [];
  const recent = rec.filter(ts => now - ts < windowMs);
  if(recent.length >= max) return false;
  recent.push(now);
  hitMap.set(key, recent);
  return true;
}

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || req.socket?.remoteAddress || 'ip';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =================== Healthcheck ========================== */
app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/healthz', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* =================== Mail helpers ========================= */
function buildTransport() {
  if (ENV.RESEND_ONLY) return null;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = ENV;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: ENV.SMTP_SECURE || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 5000,
    tls: { ciphers: 'TLSv1.2', rejectUnauthorized: true }
  });
}

async function sendViaSMTP({ to, subject, html, replyTo, attachments }) {
  const transport = buildTransport();
  if (!transport) return { skipped: true, reason: 'SMTP not configured/disabled' };
  const from = ENV.MAIL_FROM || ENV.SMTP_USER;
  const info = await transport.sendMail({
    from,
    to,
    subject,
    html,
    replyTo,
    attachments: attachments && attachments.length ? attachments : undefined
  });
  console.log('[MAIL:SENT:SMTP]', { to, subject, id: info.messageId });
  return { messageId: info.messageId };
}

async function sendViaResend({ to, subject, html, replyTo, attachments }) {
  if (!ENV.RESEND_API_KEY) return { skipped: true, reason: 'RESEND_API_KEY not set' };

  const from = ENV.MAIL_FROM || 'onboarding@resend.dev';

  const payload = {
    from,
    to,
    subject,
    html,
    reply_to: replyTo || undefined
  };

  // 🔥 Mellékletek támogatása (PDF számla!)
  if (attachments && attachments.length) {
    payload.attachments = attachments.map(a => ({
      filename: a.filename,
      // Resend base64-ben várja a PDF tartalmat
      content: a.content instanceof Buffer
        ? a.content.toString('base64')
        : a.content
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ENV.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Resend error: ' + res.status + ' ' + text);
  }

  const json = await res.json();
  console.log('[MAIL:SENT:RESEND]', { to, subject, id: json.id });
  return { id: json.id };
}

// First try Resend, then SMTP; finally simulated
async function sendMailFast(args) {
  try {
    const r = await sendViaResend(args);
    if (!r.skipped) return r;
  } catch (e) {
    console.warn('[MAIL:RESEND_FAIL]', e?.message || e);
  }
  try {
    const s = await sendViaSMTP(args);
    if (!s.skipped) return s;
  } catch (e) {
    console.warn('[MAIL:SMTP_FAIL]', e?.message || e);
  }
  console.log('[MAIL:SIMULATED]', { to: args.to, subject: args.subject });
  return { simulated: true };
}

function queueEmails(tasks) {
  setImmediate(async () => {
    await Promise.allSettled(tasks.map(t => sendMailFast(t)));
  });
}

/* =================== Order / Contact ====================== */
// === /api/order – csak mentünk, NEM küldünk e-mailt többé ===
app.post('/api/order', (req, res) => {
  const o = req.body || {};

  // ❗ NINCS több admin email itt!
  // Megrendeléskor NINCS e-mail küldve.

  res.json({
    ok: true,
    message: 'A fizetés ellenőrzése után személyesen dolgozzuk fel a rendelésedet.'
  });
});

app.post('/api/contact', (req, res) => {
  const c = req.body || {};
  const owner = ENV.TO_EMAIL || ENV.SMTP_USER;

  if (!rateLimit('contact:' + requestIp(req), 10 * 60 * 1000, 5)) {
    return res.status(429).json({ ok: false, message: 'Túl sok üzenet. Kérjük, próbáld meg később.' });
  }

  // Rejtett mező: a robotok jellemzően kitöltik, valódi látogató nem látja.
  if (String(c._hp || '').trim()) {
    return res.json({ ok: true, message: 'Üzeneted elküldve. Köszönjük a megkeresést!' });
  }

  const name = String(c.name || '').trim();
  const email = String(c.email || '').trim();
  const message = String(c.message || '').trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || name.length > 120 || !emailOk || email.length > 254 || !message || message.length > 5000) {
    return res.status(400).json({ ok: false, message: 'Kérjük, ellenőrizd a megadott adatokat.' });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');

  // Email, amit TE kapsz (belső)
  const html = `
    <h2>Új üzenet érkezett az EnZenem.hu oldalról</h2>
    <ul>
      <li><b>Név:</b> ${safeName}</li>
      <li><b>E-mail:</b> ${safeEmail}</li>
    </ul>
    <p>${safeMessage}</p>

    <hr style="margin-top:32px;">
    <p style="font-size:12px; color:#777;">
      Ez az üzenet automatikusan generált értesítés az EnZenem.hu rendszeréből.
    </p>
  `;

  // Email, amit az ÜGYFÉL kap (külső)
  const customerHtml = `
    <p>Kedves ${safeName || 'Érdeklődő'}!</p>

    <p>Köszönjük, hogy üzenetet küldtél az EnZenem.hu oldalán keresztül.  
    A megkeresésed beérkezett hozzánk, és 24 órán belül válaszolunk rá.</p>

    <p><b>Az üzenet tartalma:</b></p>
    <p>${safeMessage}</p>

    <p>Üdvözlettel,<br>
    <b>EnZenem.hu ügyfélszolgálat</b></p>

    <hr style="margin-top:32px;">
    <p style="font-size:12px; color:#777;">
      Ez egy automatikusan generált e-mail. Kérjük, erre az üzenetre ne válaszolj!<br>
      Ha szeretnél kapcsolatba lépni velünk, írj az <b>info@enzenem.hu</b> címre.
      <br><br>
      <b>Környezetvédelmi figyelmeztetés:</b> kérjük, csak akkor nyomtasd ki ezt az e-mailt, ha feltétlenül szükséges.
    </p>
  `;

  const jobs = [
    { to: owner, subject: 'EnZenem – Új üzenet érkezett', html, replyTo: email }
  ];

  if (email) {
    jobs.push({
      to: email,
      subject: 'EnZenem – Üzenetedet fogadtuk',
      html: customerHtml
    });
  }

  queueEmails(jobs);
  res.json({ ok: true, message: 'Üzeneted elküldve. Köszönjük a megkeresést!' });
});


/* ========== VIVA WALLET AUTH TOKEN ========== */
async function vivaGetToken() {
  const id = process.env.VIVA_CLIENT_ID;
  const secret = process.env.VIVA_CLIENT_SECRET;

  const res = await fetch(process.env.VIVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });

  if (!res.ok) throw new Error("Viva token hiba");
  return res.json();
}

async function retrieveVivaTransaction(transactionId) {
  const tokenData = await vivaGetToken();
  const accessToken = tokenData.access_token;
  const response = await fetch(
    process.env.VIVA_API_URL + '/checkout/v2/transactions/' + encodeURIComponent(transactionId),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const transaction = await responseJsonPreservingOrderCode(response);
  if (!response.ok) {
    throw new Error(`Viva tranzakció-lekérdezési hiba (${response.status}).`);
  }
  return transaction;
}

async function verifyVivaPayment({ transactionId, orderCode, expectedAmount }) {
  const tx = await retrieveVivaTransaction(transactionId);
  return validateVivaTransaction(tx, { transactionId, orderCode, expectedAmount });
}

/* ==========================================================
   VIVA SMART CHECKOUT – FIZETÉS INDÍTÁSA (CREATE)
========================================================== */
app.post("/api/payment/create", async (req, res) => {
  try {
    if (!rateLimit('payment-create:' + requestIp(req), 10 * 60 * 1000, 10)) {
      return res.status(429).json({ ok: false, message: 'Túl sok fizetési próbálkozás. Kérjük, próbáld meg később.' });
    }

    let data;
    try {
      data = normalizeOrderForPayment(req.body || {});
    } catch (validationError) {
      return res.status(400).json({ ok: false, message: validationError.message || 'Érvénytelen rendelési adatok.' });
    }

    const enzRef = makeEnzRef();

    // ------ Ár kiszámítása (a saját szabályod szerint) ------
    const total = computeOrderTotal(data);

    console.log(
      `[VIVA CREATE] Fizetés indítva: ${total} Ft | Csomag: ${data.package}`
    );
    // ------ 1) Viva access token ------
    const tokenData = await vivaGetToken();
    const accessToken = tokenData.access_token;

    // ------ 2) Fizetési order létrehozása ------
    const orderRes = await fetch(
      process.env.VIVA_API_URL + "/checkout/v2/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: total * 100, // fillérben
          customerTrns: "EnZenem.hu rendelés",
          customer: { email: data.email },
          sourceCode: process.env.VIVA_SOURCE_CODE,
          tags: ["enzenem"],
          // A redirect URL-eket a payment source-ban is beállítottad,
          // itt opcionálisak – de ugyanazokra mutatnak:
          successUrl:
            (process.env.PUBLIC_URL || "https://www.enzenem.hu") +
            `/api/payment/success?enz_ref=${encodeURIComponent(enzRef)}`,
          failureUrl:
            (process.env.PUBLIC_URL || "https://www.enzenem.hu") +
            `/api/payment/fail?enz_ref=${encodeURIComponent(enzRef)}`,
        }),
      }
    );

    const orderJson = await responseJsonPreservingOrderCode(orderRes);
    console.log("[VIVA ORDER RESPONSE]", orderJson);

    const orderCode = String(orderJson?.orderCode || '').trim();
    if (!orderRes.ok || !/^\d{16}$/.test(orderCode)) {
      console.error("VIVA ORDER ERROR:", orderJson);
      return res.status(502).json({
        ok: false,
        message: "Nem jött létre a Viva rendelés.",
      });
    }

    const securedOrder = {
      ...data,
      __payment_order_code: orderCode,
      __payment_amount: total
    };

    // Rendelés adat elmentése (enz_ref + orderCode)
    storePendingOrder(enzRef, securedOrder);
    storePendingOrder(orderCode, securedOrder);

    const payUrl = `https://www.vivapayments.com/web/checkout?ref=${orderCode}`;

    console.log("[VIVA PAY URL]", payUrl);

    res.json({
      ok: true,
      payUrl,
      total,
    });
  } catch (err) {
    console.error("[VIVA CREATE ERROR]", err);
    res
      .status(500)
      .json({ ok: false, message: "Nem sikerült a fizetés indítása." });
  }
});

/* ==========================================================
   SIKERES FIZETÉS – REDIRECT HANDLER (NEM WEBHOOK!)
========================================================== */
app.get("/api/payment/success", async (req, res) => {
  const orderCode = extractOrderCode(req);
  const transactionId = extractTransactionId(req);
  const enzRef = extractEnzRef(req);

  console.log("[VIVA SUCCESS REDIRECT]", { orderCode, transactionId, enzRef, queryKeys: Object.keys(req.query || {}) });

  // A redirect önmagában nem fizetési bizonyíték: kötelező az orderCode és a transactionId.
  if (!/^\d{16}$/.test(orderCode) ||
      !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(transactionId)) {
    console.warn('[PAYMENT VERIFY] Hiányzó vagy érvénytelen Viva-azonosító.');
    return res.status(400).send(`
      <html><body style="background:#0d1b2a;color:white;text-align:center;padding:50px">
        <h2>⚠️ A fizetés nem ellenőrizhető</h2>
        <p>A rendelést nem továbbítottuk. Kérjük, írj az <b>info@enzenem.hu</b> címre.</p>
        <a href="/" style="color:#21a353;text-decoration:none">Vissza a főoldalra</a>
      </body></html>
    `);
  }

  // === DUPLA FUTÁS ELLENI VÉDELEM (orderCode/transactionId alapján) ===
  const pkey = paymentKey(orderCode || enzRef, transactionId);
  if (pkey && isPaymentProcessed(pkey)) {
    console.log('[SUCCESS] Már feldolgozott fizetés (dedupe) → főoldal', pkey);
    return res.redirect('/?paid=success');
  }

  // Rendelés payload betöltése orderCode alapján (biztonságos párhuzamos fizetésekhez)
  let o = (enzRef ? loadPendingOrder(enzRef) : null) || (orderCode ? loadPendingOrder(orderCode) : null) || {};

  // Rendelési adat nélkül nem állítható össze és nem igazolható az elvárt összeg.
  if (!o || !Object.keys(o).length) {
    console.warn('[SUCCESS] Missing order payload (no pending order found) → skipping fulfillment/invoice/email.');
    return res.status(409).send(`
      <html><body style="background:#0d1b2a;color:white;text-align:center;padding:50px">
        <h2>⚠️ A rendelés ellenőrzése szükséges</h2>
        <p>A rendelés adatai nem találhatók a szerveren, ezért sem feldolgozást, sem számlázást nem indítottunk.</p>
        <p>Kérjük, írj az <b>info@enzenem.hu</b> címre a tranzakció adataival, és azonnal intézzük.</p>
        <a href="/" style="color:#21a353;text-decoration:none">Vissza a főoldalra</a>
      </body></html>
    `);
  }

  let expectedAmount;
  try {
    expectedAmount = computeOrderTotal(o);
  } catch (error) {
    console.warn('[PAYMENT VERIFY] Érvénytelen tárolt árparaméter:', error?.message || error);
    return res.status(400).send('A rendelés áradatai nem ellenőrizhetők. A rendelést nem továbbítottuk.');
  }

  if (String(o.__payment_order_code || '') !== orderCode || Number(o.__payment_amount) !== expectedAmount) {
    console.warn('[PAYMENT VERIFY] A tárolt rendelés és a redirect azonosító/összeg nem egyezik.');
    return res.status(400).send('A fizetési adatok nem egyeznek. A rendelést nem továbbítottuk.');
  }

  let verification;
  try {
    verification = await verifyVivaPayment({ transactionId, orderCode, expectedAmount });
  } catch (error) {
    console.error('[PAYMENT VERIFY ERROR]', error?.message || error);
    return res.status(503).send(`
      <html><body style="background:#0d1b2a;color:white;text-align:center;padding:50px">
        <h2>⏳ A fizetés ellenőrzése folyamatban</h2>
        <p>A rendelést még nem továbbítottuk. Kérjük, frissítsd az oldalt néhány perc múlva, vagy írj az <b>info@enzenem.hu</b> címre.</p>
        <a href="/" style="color:#21a353;text-decoration:none">Vissza a főoldalra</a>
      </body></html>
    `);
  }

  if (!verification.ok) {
    console.warn('[PAYMENT VERIFY REJECTED]', {
      orderCode,
      transactionId,
      reason: verification.reason
    });
    return res.status(400).send(`
      <html><body style="background:#0d1b2a;color:white;text-align:center;padding:50px">
        <h2>❌ A fizetés nem igazolható</h2>
        <p>A rendelést nem továbbítottuk, számlát és visszaigazolást nem készítettünk.</p>
        <a href="/" style="color:#b33;text-decoration:none">Vissza a főoldalra</a>
      </body></html>
    `);
  }

  // A Viva-lekérdezés alatt érkező párhuzamos callback ellen újra ellenőrzünk.
  if (isPaymentProcessed(pkey)) return res.redirect('/?paid=success');
  markPaymentProcessed(pkey);
  console.log('[PAYMENT VERIFIED]', { orderCode, transactionId, amount: expectedAmount, currency: 'HUF' });

  // A belső ellenőrzési metaadatok nem kerülnek át a feldolgozásba és az e-mailekbe.
  o = { ...o };
  delete o.__payment_order_code;
  delete o.__payment_amount;

  // Human-led fulfillment: log the paid brief without any AI request.
  // Sheet logging remains independent from confirmation and invoice emails.
  setImmediate(() => safeAppendOrderRow({
    email: o.email || '', styles: o.styles || '', vocal: o.vocal || '',
    language: o.language || '', brief: o.brief || '', lyrics: '',
    link1: '', link2: '',
    format: o.package === 'video' ? 'mp4' : o.package === 'premium' ? 'wav' : 'mp3',
    delivery: o.delivery_label || ''
  }).catch(error => console.warn('[MANUAL ORDER LOG]', error?.message || error)));

  // Sikeres flow után töröljük a pending order-t (a dedupe már védi az ismétlődést)
  if (enzRef) deletePendingOrder(enzRef);
  if (orderCode) deletePendingOrder(orderCode);

  // ====== EMAIL + SZÁMLA (AZ EREDETI LOGIKÁDDAL) ======
  try {
    const customer = o.email || "";
    const english = o.ui_language === "en";
    const adminEmail = ENV.TO_EMAIL || ENV.SMTP_USER;
    const deliveryLabel = o.delivery_label || o.delivery || "48 óra";
    const pkg = (o.package || o.format || "basic").toString().toLowerCase();
    const format =
      pkg === "video" ? "MP4" : pkg === "premium" ? "WAV" : "MP3";

    const amount = computeOrderTotal(o); // Ft-ban, ezt adjuk a számlához
    const safeDeliveryLabel = escapeHtml(english
      ? (o.delivery_extra === '6500' ? '6 hours' : o.delivery_extra === '3000' ? '24 hours' : '48 hours')
      : deliveryLabel);
    const safeEmail = escapeHtml(o.email || '');
    const safePackage = escapeHtml(o.package || o.format || '');
    const safeStyles = escapeHtml(o.styles || o.style || '');
    const safeVocal = escapeHtml(o.vocal || '');
    const safeLanguage = escapeHtml(o.language || '');
    const safeBrief = escapeHtml(o.brief || '').replace(/\n/g, '<br/>');

    // --- Ügyfél HTML (változatlan szöveg) ---
    const customerHtml = english ? `
      <h2>Thank you for your order!</h2>
      <p>Your payment has been verified. We will personally review your brief and create your package with AI assistance and human creative direction.</p>
      <ul><li><b>Your package:</b> 2 complete song versions in ${format} + PDF lyrics</li>
      <li><b>Delivery:</b> ${safeDeliveryLabel}</li></ul>
      <p>Both versions and the PDF will arrive by email as attachments or download links within the selected deadline. Choose your favourite or use both under our Terms. For instrumental orders, the PDF contains the title and a personal message.</p>
      <p>This is your order confirmation; the finished songs and PDF will follow after we create them.</p>
      <p>Questions? Contact info@enzenem.hu.<br>EnZenem.hu</p>
    ` : `
      <h2>Köszönjük a rendelésedet!</h2>
      <p>A fizetésedet ellenőriztük. A leírásodat személyesen átnézzük, és AI segítségével, emberi alkotói munkával készítjük el a csomagodat.</p>
      <ul><li><b>A csomagod:</b> 2 teljes dalváltozat ${format} formátumban + PDF-dalszöveg</li>
      <li><b>Kézbesítés:</b> ${safeDeliveryLabel}</li></ul>
      <p>Mindkét változatot és a PDF-et e-mailben, mellékletként vagy letöltési linken kapod meg a választott határidőn belül. Válaszd a kedvencedet, vagy használd mindkettőt az ÁSZF szerint. Instrumentális rendelésnél a PDF a címet és a személyes üzenetet tartalmazza.</p>
      <p>Ez a rendelés visszaigazolása; a kész dalokat és a PDF-et az elkészítés után küldjük.</p>
      <p>Kérdésed van? Írj az info@enzenem.hu címre.<br>EnZenem.hu</p>
    `;

    // --- Admin HTML (változatlan szöveg + most már jó összeg) ---
    const adminHtml = `
    <h2>Új SIKERES fizetés – kézi feldolgozás</h2>
    <p><b>Elkészítendő: 2 dalváltozat a választott formátumban + végleges dalszöveg PDF-ben. Instrumentális kérésnél cím és személyes üzenet PDF-ben.</b></p>
    <ul>
      <li><b>E-mail:</b> ${safeEmail}</li>
      <li><b>Csomag:</b> ${safePackage} (${format})</li>
      <li><b>Kért cím:</b> ${escapeHtml(o.title || "")}</li>
      <li><b>Felület nyelve:</b> ${english ? "English" : "magyar"}</li>
      <li><b>Rendelésazonosító:</b> ${escapeHtml(orderCode)}</li>
      <li><b>Stílus:</b> ${safeStyles}</li>
      <li><b>Ének:</b> ${safeVocal}</li>
      <li><b>Nyelv:</b> ${safeLanguage}</li>
      <li><b>Kézbesítési idő:</b> ${safeDeliveryLabel}</li>
      <li><b>Összeg:</b> ${amount} Ft</li>
    </ul>
    <p><b>Brief:</b><br/>${safeBrief}</p>
  `;

    const jobs = [];
    let attachments = [];

    // --- Számla generálás (változatlan logikával) ---
    if (INVOICE_MODE === "test" || INVOICE_MODE === "live") {
      try {
        const totalInt = parseInt(amount, 10) || 0;
        const { buffer, invoiceNo } = await generateInvoicePDF({
          mode: INVOICE_MODE,
          total: totalInt,
          order: o,
        });

        if (buffer && buffer.length) {
          attachments.push({
            filename: `${invoiceNo}.pdf`,
            content: buffer,
          });
          console.log("[INVOICE] Generated invoice", {
            invoiceNo,
            totalInt,
            mode: INVOICE_MODE,
          });
        }
      } catch (err) {
        console.warn("[INVOICE] Generation failed:", err?.message || err);
      }
    }

    // --- Ügyfél email ---
    if (customer) {
      jobs.push({
        to: customer,
        subject: english ? "EnZenem – Order confirmation (payment successful)" : "EnZenem – Megrendelés visszaigazolás (sikeres fizetés)",
        html: customerHtml,
        attachments: attachments.length ? attachments : undefined,
      });
    }

    // --- Admin email ---
    jobs.push({
      to: adminEmail,
      subject: "EnZenem – Fizetett rendelés: 2 dal + PDF – kézi elkészítés",
      replyTo: customer,
      html: adminHtml,
      attachments: attachments.length ? attachments : undefined,
    });

    queueEmails(jobs);
    console.log("[MAIL:QUEUED] Customer + Admin email sent after success");
  } catch (e) {
    console.warn(
      "[SUCCESS EMAIL] Email sending error after success:",
      e?.message || e
    );
  }

  // ====== HTML VISSZAJELZÉS ======
res.send(`
  <html lang="${o.ui_language === 'en' ? 'en' : 'hu'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#0d1b2a;color:white;text-align:center;padding:50px">
    <h2>${o.ui_language === 'en' ? '✅ Payment successful!' : '✅ Fizetés sikeres!'}</h2>
    <p>${o.ui_language === 'en'
      ? 'We will personally review your order. You will receive two song versions and PDF lyrics by email within your selected delivery time.'
      : 'A rendelésedet személyesen dolgozzuk fel. Két dalváltozatot és PDF-dalszöveget kapsz e-mailben, a választott kézbesítési időn belül.'}</p>
    <a href="/" style="color:#21a353;text-decoration:none">
      ${o.ui_language === 'en' ? 'Back to home' : 'Vissza a főoldalra'}
    </a>
  </body></html>
`);
});

/* ==========================================================
   SIKERTELEN FIZETÉS – REDIRECT HANDLER
========================================================== */
app.get("/api/payment/fail", (req, res) => {
  console.log("[VIVA FAIL REDIRECT]", req.query);

res.send(`
  <html><body style="background:#0d1b2a;color:white;text-align:center;padding:50px">
    <h2>❌ A fizetés sikertelen!</h2>
    <p>Kérjük, próbáld meg újra.</p>
    <a href="/" style="color:#b33;text-decoration:none">
      Vissza a főoldalra
    </a>
  </body></html>
`);
});

/* ================== Start server ========================== */
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
