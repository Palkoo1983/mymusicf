// ESM server.js – FINAL (stable, prompt-based polish active)
// - Kód szintű polish függvények eltávolítva
// - Prompt-szintű polish (sys2, sys3) aktív maradt

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { appendOrderRow, safeAppendOrderRow, getAndIncrementInvoiceSeq } from './sheetsLogger.js';
import fs from 'fs';
import PDFDocument from 'pdfkit';


// === DUPLA DALGENERÁLÁS ELLENI VÉDELEM ===
global.paymentAlreadyProcessed = false;

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

/* ----------------- Duplicate guard (idempotency) ----------------- */
const activeStarts = new Map(); // key -> timestamp
function makeKey(o){
  const src = JSON.stringify({
    title:o.title||'', styles:o.styles||'', vocal:o.vocal||'',
    language:o.language||'', brief:o.brief||''
  });
  let h = 2166136261 >>> 0;
  for (let i=0; i<src.length; i++){
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'req_' + (h >>> 0).toString(16);
}

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

const INVOICE_COUNTER_FILE = './invoice-counter.json';

const INVOICE_SEED = {
  sellerName: 'Gombkötő Pál egyéni vállalkozó',
  regNumber: '61398205',
  taxNumber: '91555179-1-43',
  statNumber: '91555179-9013-231-01',
  address: '1097 Budapest, Aszódi utca 8. 123. ajtó',
  currency: 'HUF'
};

function loadInvoiceCounter() {
  try {
    if (!fs.existsSync(INVOICE_COUNTER_FILE)) return null;
    const raw = fs.readFileSync(INVOICE_COUNTER_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[INVOICE] Nem sikerült beolvasni az invoice-counter fájlt:', e?.message || e);
    return null;
  }
}

function saveInvoiceCounter(data) {
  try {
    fs.writeFileSync(INVOICE_COUNTER_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[INVOICE] Nem sikerült menteni az invoice-counter fájlt:', e?.message || e);
  }
}


/**
 * Számla PDF generálása
 * mode: 'test' | 'live'
 * total: bruttó összeg (Ft)
 * order: a global.lastOrderData (megrendelési adatok)
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
    let itemName = 'Egyedi zeneszám - MP3 csomag ';
    if (pkg === 'video') itemName = 'Egyedi zeneszám - Videó csomag';
    else if (pkg === 'premium') itemName = 'Prémium hangcsomag (WAV)';

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
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

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
    tls: { ciphers: 'TLSv1.2', rejectUnauthorized: false }
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

/* =================== Test mail endpoint =================== */
app.get('/api/test-mail', (req, res) => {
  const to = ENV.TO_EMAIL || ENV.SMTP_USER;
  queueEmails([{ to, subject: 'EnZenem – gyors teszt', html: '<p>Gyors tesztlevél.</p>' }]);
  res.json({ ok: true, message: 'Teszt e-mail ütemezve: ' + to });
});

/* =================== Order / Contact ====================== */
// === /api/order – csak mentünk, NEM küldünk e-mailt többé ===
app.post('/api/order', (req, res) => {
  const o = req.body || {};
  global.lastOrderData = o; // mentjük a fizetés callbackhez

  // ❗ NINCS több admin email itt!
  // Megrendeléskor NINCS e-mail küldve.

  res.json({
    ok: true,
    message: 'Köszönjük! A megrendelésed rögzítettük, a fizetés után minden automatikusan megtörténik.'
  });
});

app.post('/api/contact', (req, res) => {
  const c = req.body || {};
  const owner = ENV.TO_EMAIL || ENV.SMTP_USER;

  // Email, amit TE kapsz (belső)
  const html = `
    <h2>Új üzenet érkezett az EnZenem.hu oldalról</h2>
    <ul>
      <li><b>Név:</b> ${c.name || '-'}</li>
      <li><b>E-mail:</b> ${c.email || '-'}</li>
    </ul>
    <p>${(c.message || '').replace(/\n/g, '<br/>')}</p>

    <hr style="margin-top:32px;">
    <p style="font-size:12px; color:#777;">
      Ez az üzenet automatikusan generált értesítés az EnZenem.hu rendszeréből.
    </p>
  `;

  // Email, amit az ÜGYFÉL kap (külső)
  const customerHtml = `
    <p>Kedves ${c.name || 'Érdeklődő'}!</p>

    <p>Köszönjük, hogy üzenetet küldtél az EnZenem.hu oldalán keresztül.  
    A megkeresésed beérkezett hozzánk, és 24 órán belül válaszolunk rá.</p>

    <p><b>Az üzenet tartalma:</b></p>
    <p>${(c.message || '').replace(/\n/g, '<br/>')}</p>

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
    { to: owner, subject: 'EnZenem – Új üzenet érkezett', html, replyTo: c.email || undefined }
  ];

  if (c.email) {
    jobs.push({
      to: c.email,
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

/** A rendelés összegének kiszámítása a lastOrderData alapján */
function computeOrderTotal(order = {}) {
  const pkg = (order.package || order.format || "basic").toString().toLowerCase();

  const base =
    pkg === "video"
      ? 21000
      : pkg === "premium"
      ? 35000
      : 10500;

  const extraRaw = parseInt(order.delivery_extra || "0", 10);
  const extra = Number.isNaN(extraRaw) ? 0 : extraRaw;

  return base + extra; // Ft-ban
}

/* ==========================================================
   VIVA SMART CHECKOUT – FIZETÉS INDÍTÁSA (CREATE)
========================================================== */
app.post("/api/payment/create", async (req, res) => {
  try {
    global.lastOrderData = req.body;
    const data = req.body || {};

    // ------ Ár kiszámítása (a saját szabályod szerint) ------
    const total = computeOrderTotal(data);

    console.log(
      `[VIVA CREATE] Fizetés indítva: ${total} Ft | Csomag: ${data.package}`
    );
    global.paymentAlreadyProcessed = false;

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
            "/api/payment/success",
          failureUrl:
            (process.env.PUBLIC_URL || "https://www.enzenem.hu") +
            "/api/payment/fail",
        }),
      }
    );

    const orderJson = await orderRes.json();
    console.log("[VIVA ORDER RESPONSE]", orderJson);

    if (!orderJson?.orderCode) {
      console.error("VIVA ORDER ERROR:", orderJson);
      return res.json({
        ok: false,
        message: "Nem jött létre a Viva rendelés.",
      });
    }

    const payUrl = `https://www.vivapayments.com/web/checkout?ref=${orderJson.orderCode}`;

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
  const orderCode = req.query.orderCode;
  const transactionId = req.query.transactionId;

  console.log("[VIVA SUCCESS REDIRECT]", { orderCode, transactionId });
// === DUPLA FUTÁS ELLENI VÉDELEM ===
if (global.paymentAlreadyProcessed) {
  console.log("[SUCCESS] Már feldolgozott fizetés → redirect NovaBot siker oldalra");
  return res.redirect("/megrendeles.html?paid=success");
}
global.paymentAlreadyProcessed = true;

  const o = global.lastOrderData || {};

  // ====== DAL GENERÁLÁS ======
  try {
    if (global.lastOrderData) {
      const apiUrl =
        (process.env.PUBLIC_URL || "https://www.enzenem.hu") +
        "/api/generate_song";

      await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(global.lastOrderData),
      });

      console.log("[SUCCESS] Dal generálás elindult.");
    } else {
      console.warn(
        "[SUCCESS] Nincs lastOrderData → nem indítom a generálást."
      );
    }
  } catch (err) {
    console.error("[SUCCESS] Generálási hiba:", err);
  }

  // ====== EMAIL + SZÁMLA (AZ EREDETI LOGIKÁDDAL) ======
  try {
    const customer = o.email || "";
    const adminEmail = ENV.TO_EMAIL || ENV.SMTP_USER;
    const deliveryLabel = o.delivery_label || o.delivery || "48 óra";
    const pkg = (o.package || o.format || "basic").toString().toLowerCase();
    const format =
      pkg === "video" ? "MP4" : pkg === "premium" ? "WAV" : "MP3";

    const amount = computeOrderTotal(o); // Ft-ban, ezt adjuk a számlához

    // --- Ügyfél HTML (változatlan szöveg) ---
    const customerHtml = `
  <p>Kedves Megrendelő!</p>

  <p>Köszönjük a sikeres fizetést és a bizalmat! A megrendelésedet a rendszer sikeresen rögzítette.</p>

  <p><b>A megrendelés adatai:</b></p>
  <ul>
    <li><b>Formátum:</b> ${format}</li>
    <li><b>Kézbesítési idő:</b> ${deliveryLabel}</li>
  </ul>

  <p>
    A választott kézbesítési időn belül (<b>${deliveryLabel}</b>) elkészítjük és elküldjük az egyedi zenédet / videódat.
    A kész anyagot az általad megadott e-mail címre fogod megkapni vagy a választott formátumban vagy letöltési link formájában.
  </p>

  <p>Üdvözlettel,<br>
  <b>EnZenem.hu csapat</b></p>

  <hr style="margin-top:32px;">
  <p style="font-size:12px; color:#777;">
    Ez egy automatikusan küldött rendszerüzenet, kérjük, erre az e-mailre ne válaszolj.<br>
    Ha kérdésed van, keress minket bizalommal az <b>info@enzenem.hu</b> címen.
    <br><br>
    <b>Környezetvédelmi figyelmeztetés:</b>
    kérjük, ne nyomtasd ki ezt az e-mailt, hacsak nem feltétlenül szükséges.
  </p>
`;

    // --- Admin HTML (változatlan szöveg + most már jó összeg) ---
    const adminHtml = `
    <h2>Új SIKERES fizetés</h2>
    <ul>
      <li><b>E-mail:</b> ${o.email || ""}</li>
      <li><b>Csomag:</b> ${o.package || o.format}</li>
      <li><b>Stílus:</b> ${o.styles || o.style}</li>
      <li><b>Ének:</b> ${o.vocal || ""}</li>
      <li><b>Nyelv:</b> ${o.language || ""}</li>
      <li><b>Kézbesítési idő:</b> ${deliveryLabel}</li>
      <li><b>Összeg:</b> ${amount} Ft</li>
    </ul>
    <p><b>Brief:</b><br/>${(o.brief || "").replace(/\n/g, "<br/>")}</p>
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
        subject: "EnZenem – Megrendelés visszaigazolás (sikeres fizetés)",
        html: customerHtml,
        attachments: attachments.length ? attachments : undefined,
      });
    }

    // --- Admin email ---
    jobs.push({
      to: adminEmail,
      subject: "EnZenem – Új SIKERES fizetés + számla",
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
  <html><body style="background:#0d1b2a;color:white;text-align:center;padding:50px">
    <h2>✅ Fizetés sikeres!</h2>
    <p>A dal generálása elindult, hamarosan érkezik az email.</p>
    <a href="/" style="color:#21a353;text-decoration:none">
      Vissza a főoldalra
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

/* ================== SUNO HELPERS ========================= */
async function sunoStartV1(url, headers, body){
  for (let i=0; i<6; i++){
    const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
    const txt = await r.text();
    if (r.ok){
      try { return { ok:true, json: JSON.parse(txt) }; }
      catch { return { ok:true, json:{} }; }
    }
    console.warn('[SUNO:START_FAIL]', r.status, txt.slice(0,200));
    if (r.status === 503 || r.status === 502 || r.status === 429){
      await new Promise(res => setTimeout(res, 2000 * (i+1)));
      continue;
    }
    return { ok:false, status:r.status, text:txt };
  }
  return { ok:false, status:503, text:'start_unavailable_after_retries' };
}

/* ============ GPT → Suno generate (NO POLISH) ============ */
app.post('/api/generate_song', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
    if (!rateLimit('gen:' + ip, 45000, 5)) {
      return res.status(429).json({ ok:false, message:'Túl sok kérés. Próbáld később.' });
    }


    // 🔹 1️⃣ Ügyfél azonnali válasz – ne várja meg a hosszú folyamatot
    res.json({ ok:true, message:"Köszönjük! Megrendelésed feldolgozás alatt." });

    // 🔹 2️⃣ Háttérben elindítjuk ugyanazt a folyamatot (GPT → Suno → Sheet)
    setImmediate(async () => {
      try {

    let { title = '', styles = '', vocal = 'instrumental', language = 'hu', brief = '' } = req.body || {};

    // Map package/format
    const pkg = (req.body && (req.body.package||req.body.format)) ? String((req.body.package||req.body.format)).toLowerCase() : 'basic';
    const format = pkg==='basic' ? 'mp3' : (pkg==='video' ? 'mp4' : pkg==='premium' ? 'wav' : pkg);
    const isMP3 = (format === 'mp3');

    // Vocal normalizálás (csak Suno style taghez)
    // Vocal normalizálás (Suno számára)
const v = (vocal || '').toString().trim().toLowerCase();

if (/^női|female/.test(v)) vocal = 'female';
else if (/^férfi|male/.test(v)) vocal = 'male';
else if (/duet|duett/.test(v)) vocal = 'duet';
else if (/^(child|gyerek|gyermek)\b/.test(v)) vocal = 'child';
else if (/robot|synthetic|gépi/.test(v)) vocal = 'robot';
else if (/instrument/.test(v)) vocal = 'instrumental';
else if (/choir|kórus/.test(v)) vocal = 'choir';
else if (/gospel/.test(v)) vocal = 'gospel choir';
else vocal = (v || 'instrumental');

    // ENV
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const SUNO_API_KEY   = process.env.SUNO_API_KEY;
    const SUNO_BASE_URL  = (process.env.SUNO_BASE_URL || '').replace(/\/+$/,'');
    const PUBLIC_URL     = (process.env.PUBLIC_URL || '').replace(/\/+$/,'');

    if (!OPENAI_API_KEY || !SUNO_API_KEY || !SUNO_BASE_URL) {
  console.warn('[generate_song] Missing API keys or base URL.');
  return;
}

    // Idempotencia
    const key = makeKey({ title, styles, vocal, language, brief });
    const now = Date.now();
    const last = activeStarts.get(key) || 0;
    if (now - last < 20000) {
  console.warn('[generate_song] Duplicate request ignored.');
  return;
}

    activeStarts.set(key, now);
    setTimeout(() => activeStarts.delete(key), 60000);

   // --- GPT System Prompt ---
const profile = determineStyleProfile(styles, brief, vocal);

// Magyar nyelvű, de kulcsosított leírás a GPT-nek
const styleProfileText = `
Style profile (in Hungarian, use these traits in writing):
tone: ${profile.tone.emotion}, ${profile.tone.brightness}, ${profile.tone.density}
rhythm: ${profile.rhythm.wordsPerLine[0]}–${profile.rhythm.wordsPerLine[1]} szó/sor, tempó: ${profile.rhythm.tempo}
theme: ${profile.theme || 'általános'}
poetic images: ${profile.words.poeticImages || 'balanced'}
keywords: ${(profile.words.keywords || []).join(', ')}
adultLock: ${profile.adultLock ? 'TRUE – TILOS gyerekdalos szóhasználat és onomatopoézia (napocska, dalocska, taps-taps, la-la, bumm-bumm, játsszunk, ovis). Felnőtt, büszke, megható hangon írj.' : 'FALSE'}
special rules: ${profile.universalRules.enforceVariation ? 'változatos, logikus képek' : ''}
`;

// GPT rendszer prompt (megtartva a JSON formátumot)
const sys1 = [
  'You are a professional music lyric writer AI. You generate complete, structured Hungarian song lyrics strictly following the requested style and theme.',
  'Write STRICTLY in Hungarian. No language mixing.',

  'MODE GATING:',
  (profile && profile.adultLock)
    ? 'ADULT MODE: NEVER write a children song or nursery rhyme. NEVER use childlike/onomatopoeia words (napocska, dalocska, taps-taps, la-la, bumm-bumm, játsszunk, játszunk, ovis, óvoda/ovoda, mesehős). If any appear, rewrite the line into mature adult wording.'
    : 'CHILD MODE: You may use child-friendly vocabulary ONLY because the request is explicitly for a child (<10) or a children song.',

  'STRUCTURE RULES:',
  '(Verse 1)',
  '(Verse 2)',
  '(Chorus)',
  '(Verse 3)',
  '(Verse 4)',
  '(Chorus)',
  '(Chorus)',

  'Each Verse and each Chorus must contain EXACTLY 4 lines.',
  // LINE LENGTH RULE – mandatory
  'Each line in every Verse and Chorus MUST contain between 7 and 16 words.',
  'If any line is shorter than 7 words, you MUST rewrite it so it becomes 7–16 words naturally without breaking the rhythm, meaning, or emotional tone.',

  'Never use more or less than 4 lines in any section.',
  'Each line must be ONE clear, grammatically correct sentence.',
  'Never write paragraph-style verses.',
  'Never chain many comma-clauses into one long line.',

  'The LAST TWO Choruses must both appear in full and must be IDENTICAL.',
  'Always finish the whole song structure, including the final Chorus.',

  'BRIEF INTEGRATION:',
  'Use all key memories, emotions, people and locations from the brief.',
  'If a location is mentioned, use the same full name.',
  'If multiple memories appear, integrate ALL of them across the verses.',
  'Each verse should reflect ONE emotional scene from the brief.',

  'STYLE HINTS:',
  'Follow the given style hints exactly: ' + styles + '.',
  'Never mix or override styles.',

  'OUTPUT RULES:',
  'Output ONLY the final clean lyrics with section titles and line breaks.',
  'Do NOT output explanations, markdown or JSON.',
  'Do not modify section titles.',
  'Do not reinterpret ages, years or events from the brief.'
].join('\\n');


const sys2Adult = [
  '=== GENRE AND TONE RULES (apply ONLY the dominant one) ===',

  'POP:',
  '- Simple, catchy emotional lines.',
  '- Aim for 7–10 words per line.',
  '- Use light, natural rhymes.',

  'ROCK:',
  '- Energetic, strong tone.',
  '- 7–12 words per line.',
  '- Clear, concrete images.',

  'ELECTRONIC / TECHNO / MINIMAL:',
  '- Focus on atmosphere and movement, not long storytelling.',
  '- Each line = 1 sensory snapshot (light, motion, night air).',
  '- Short, percussive, image-based lines.',
  '- Max 1 metaphor per verse.',
  '- Motif repetition allowed, but structure must stay intact.',

  'ACOUSTIC / BALLAD:',
  '- Soft, intimate lyrical tone.',
  '- Gentle, emotional storytelling.',
  '- Coherent, clean metaphors.',

  'ROMANTIC / WEDDING:',
  '- Warm, poetic, cinematic tone.',
  '- Use coherent metaphors (sunset, sea, light, stars, breeze).',
  '- No mixed or contradictory images.',
  '- Keep the feeling uplifting and loving.',

  'REGGAE:',
  '- Laid-back, warm, positive tone.',
  '- Natural, flowing rhythm.',
  '- Simple, uplifting imagery.',
  '- Focus on unity, love, life, freedom.',
  '- Avoid aggressive or dark metaphors.',

  'FUNERAL / LÍRAI:',
  '- ONLY use if brief clearly mentions death or funeral.',
  '- Gentle, calm, peaceful tone.',
  '- No harsh or absurd imagery.',

  'POSITIVE EVENTS (birthday, diploma, wedding, achievement):',
  '- Tone must stay positive, warm and uplifting.',
  '- NEVER use funeral tone for positive events.',

  'RAP:',
  '- Confident, rhythmic Hungarian rap tone.',
  '- 10–16 words per line, always maintaining a clear 4/4 flow.',
  '- Use concrete, everyday imagery (streets, notes, nights, routine, ambition).',
  '- Use light internal rhymes without sacrificing clarity.',
  '- Each line must be one full, grammatically correct Hungarian sentence.',
  '- Avoid lyrical-ballad tone completely; keep the voice direct and grounded.',
  '- Do not use soft romantic metaphors or cinematic descriptions.',
  '- Keep metaphors minimal, simple, and concrete only.',
  '- Maintain a steady rhythmic structure in all four lines of each section.',
  '- Never split one sentence across multiple lines, and never join multiple sentences.',
  '- Do not drift into pop, wedding, ballad, or funeral tone.',
  '- Always keep 4 separate lines per section.'
].join('\\n');

const sys2Child = [
  'CHILD (ONLY IF explicitly requested OR age <10):',
  '- Simple vocabulary, playful rhythm.',
  '- 6–10 words per line.',
  '- No dark or complex metaphors.',
  '- Use happy, safe, child-friendly images.',
  '- Onomatopoetic words (taps-taps, la-la, bumm-bumm) ONLY in the Chorus.',
  '- NEVER invent or distort Hungarian words (pl. ragadogat, csillogogat).',
  '- If many children are listed, distribute them across the verses naturally; never list all in one verse.'
].join('\\n');

const sys2Final = ((profile && profile.theme) === 'child' || String(vocal || '').toLowerCase() === 'child')
  ? [sys2Adult, sys2Child].join('\\n')
  : sys2Adult;


const sys3 = [
  '=== HUNGARIAN LANGUAGE POLISH & COHERENCE RULES ===',
  '- Write in natural, grammatically correct Hungarian.',
  '- Every line must be a full, meaningful sentence.',
  '- Keep a clear logical flow between all lines and sections.',
  '- Use natural Hungarian word order.',
  '- Use correct suffixes, vowel harmony and case endings.',
  '- Ensure verb–noun agreement in number and person.',
  '- Remove unnecessary spaces or blank lines.',
  '- Avoid double punctuation and unwanted repetition.',
  '- Capitalize the first letter of each line.',

  '- Use natural Hungarian conjugations.',
  '- Replace awkward expressions with fluent, native phrasing.',
  '- Convert numeric digits into written Hungarian words.',
  '- Do NOT change the meaning of ages or years.',
  '- Do NOT place numbers in section headings.',

  '- Keep poetic rhythm consistent with the chosen style.',
  '- Use natural rhymes when they fit.',
  '- If a rhyme harms clarity, rewrite naturally.',
  '- Avoid nonsense words or meaningless filler phrases.',

  '- For romantic/wedding: use coherent metaphors only.',
  '- Make sure metaphors support the emotional meaning.',

  '- Make the final Chorus repeat IDENTICALLY.',
  '- Keep the entire song cohesive, expressive and human.',
  '- Avoid confusing or contradictory statements.',
  '- Use ONLY valid, existing Hungarian words (no invented or distorted forms).',
  '- Each line must be a complete, meaningful Hungarian sentence (subject + predicate).',
  '- Maintain consistent verb tense throughout the entire song (no random past/present/future switching).',
  '- Apply correct Hungarian conjugation: verbs and nouns must agree in number and case.',
  '- Do not mix singular/plural inconsistently.',
  '- Keep sentence logic clear: no contradictory or unclear actions.',
  '- Avoid filler words, meaningless expressions, or machine-like phrasing.',
  '- Do not start or end multiple consecutive lines with the same word, unless intentionally for rhyme.',
  '- Keep metaphors simple, coherent and style-appropriate; do NOT combine unrelated images.',
  '- All imagery must support the emotional meaning of the brief.'

].join('\\n');


// Explicit instruction: include all specific years, names, and places mentioned in the brief naturally in the lyrics.
const briefIncludeRule = 'Include every specific year, name, and place mentioned in the brief naturally in the lyrics.';

// User prompt = input + stílusprofil
const usr1 = [
  'Title: ' + title,
  'Client styles: ' + styles,
  'Vocal: ' + vocal,
  'Language: ' + language,
  'Brief: ' + brief,
   briefIncludeRule,
  '',
  '=== STYLE PROFILE ===',
  styleProfileText.trim()
].join('\n');

    // --- Kombinált rendszerprompt: struktúra + stílus + magyar nyelvi polish ---
const sysPrompt = [sys1, sys2Final, sys3].join('\n\n');

const oi1 = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: usr1 }
    ],
    temperature: 0.7,
    max_tokens: 800
  })
});

   if(!oi1.ok){
  const t = await oi1.text();
  console.warn('[generate_song] OpenAI error', t.slice(0,200));
  return;
}
    const j1 = await oi1.json();

// --- ROBUSZTUS JSON + FALLBACK + POLISH ---
const raw = j1?.choices?.[0]?.message?.content || '';

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  payload = {};
}

// több kulcsot is próbálunk, hogy tuti legyen szöveg:
let lyrics = (
  payload.lyrics_draft ||
  payload.lyrics ||
  payload.text ||
  payload.song ||
  ''
).trim();

let gptStyle = (
  payload.style_en ||
  payload.style ||
  ''
).trim();

// ha a JSON üres, essünk vissza a nyers contentre
if (!lyrics && raw) {
  lyrics = String(raw).trim();
}
 // --- ADULT_LOCK post-check (prevent accidental children-song output) ---
if ((profile && profile.adultLock) && containsChildlikeTokens(lyrics)) {
  console.warn('[ADULT_LOCK] Childlike vocabulary detected in lyrics → rewrite once before Suno.');
  try {
    const rewriteSys = [
      'You are a professional Hungarian lyric editor.',
      'Rewrite the draft into a mature, adult POP love song in Hungarian.',
      'Write STRICTLY in Hungarian. No language mixing.',
      'Keep the SAME required structure and constraints:',
      '(Verse 1) (Verse 2) (Chorus) (Verse 3) (Verse 4) (Chorus) (Chorus), each exactly 4 lines.',
      'Each line must have 7–16 words, and be one clear grammatical sentence.',
      'ABSOLUTELY FORBIDDEN: any children-song vocabulary or onomatopoeia such as napocska, dalocska, taps-taps, la-la, bumm-bumm, ovis, óvoda/ovoda, mondóka, altató.',
      'Keep all names, places and key memories from the brief.',
      'Output ONLY the rewritten lyrics with section titles and line breaks.'
    ].join('\\n');

    const rewriteUsr = [
      usr1,
      '',
      '=== DRAFT TO REWRITE (remove any childlike tone) ===',
      lyrics
    ].join('\\n');

    const oi2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: rewriteSys },
          { role: 'user', content: rewriteUsr }
        ],
        temperature: 0.4,
        max_tokens: 900
      })
    });

    if (oi2.ok) {
      const j2 = await oi2.json();
      const rewritten = (j2?.choices?.[0]?.message?.content || '').trim();
      if (rewritten) {
        lyrics = rewritten;
      }
    } else {
      const t2 = await oi2.text();
      console.warn('[ADULT_LOCK] Rewrite OpenAI error', t2.slice(0, 200));
    }
  } catch (e) {
    console.warn('[ADULT_LOCK] Rewrite failed:', e?.message || e);
  }
}

// --- convert numeric numbers to written Hungarian words (universal) ---
function numToHungarian(n) {
  const ones = ['nulla','egy','kettő','három','négy','öt','hat','hét','nyolc','kilenc'];
  const tens = ['','tíz','húsz','harminc','negyven','ötven','hatvan','hetven','nyolcvan','kilencven'];

  if (n < 10) return ones[n];
  if (n < 20) {
    if (n === 10) return 'tíz';
    return 'tizen' + ones[n - 10];
  }
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return tens[t] + (o ? ones[o] : '');
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h > 1 ? ones[h] + 'száz' : 'száz') + (r ? numToHungarian(r) : '');
  }
  if (n < 2000) return 'ezer-' + numToHungarian(n - 1000);
  if (n < 2100) return 'kétezer-' + numToHungarian(n - 2000);
  if (n < 10000) {
    const t = Math.floor(n / 1000);
    const r = n % 1000;
    return ones[t] + 'ezer' + (r ? '-' + numToHungarian(r) : '');
  }
  return String(n); // fallback for very large numbers
}
// --- smarter numeric replacement with suffix support ---
// Évszámok (0–2999) + ragozás (pl. 2014-ben → kétezer-tizennégyben)
lyrics = lyrics.replace(/\b([12]?\d{3})([-–]?(?:ban|ben|as|es|os|ös|ik|tól|től|hoz|hez|höz|nak|nek|ra|re|ról|ről|ba|be))?\b/g, (match, num, suffix='') => {
  const year = parseInt(num, 10);
  if (isNaN(year) || year > 2999) return match; // biztonsági korlát
  let text = '';
  if (year < 1000) text = numToHungarian(year);
  else {
    const thousand = Math.floor(year / 1000);
    const rest = year % 1000;
    const base = thousand === 1 ? 'ezer' : 'kétezer';
    text = base + (rest ? '-' + numToHungarian(rest) : '');
  }
  return text + (suffix || '');
});

// Kis számok (1–999), de NE Verse/Chorus után
lyrics = lyrics.replace(/\b\d{1,3}\b/g, (m, _off, str) => {
  const i = _off ?? 0;
  const prev = str.slice(Math.max(0, i - 7), i); // elég hossz, hogy "Chorus " is beleférjen
  if (/Verse\s$/i.test(prev) || /Chorus\s$/i.test(prev)) return m;
  return numToHungarian(parseInt(m, 10));
});



// --- UNIVERSAL NORMALIZE GENRES (HU → EN) ---
function normalizeGenre(g) {
  if (!g) return '';
  return g.toLowerCase()
    // Alapműfajok
    .replace(/\bmagyar népdal\b/g, 'hungarian folk')
    .replace(/\bnépdal\b/g, 'folk')
    .replace(/\bpop(zene)?\b/g, 'pop')
    .replace(/\brock(zene)?\b/g, 'rock')
    .replace(/\bmet[aá]l\b/g, 'metal')
    .replace(/\bdiszk[oó]\b/g, 'disco')
    .replace(/\btechno\b/g, 'techno')
    .replace(/\bhouse\b/g, 'house')
    .replace(/\btrance\b/g, 'trance')
    .replace(/\bdrum(?!mer)\b/g, 'drum and bass')
    .replace(/\brap(p)?\b/g, 'rap')
    .replace(/\br[&\s]?b\b/g, 'r&b')
    .replace(/\belektronikus(zene)?\b/g, 'electronic')
    // Különleges magyar variációk
    .replace(/\bminimal techno\b/g, 'minimal techno')
    .replace(/\bmodern elektronikus\b/g, 'modern electronic')
    .replace(/\bromantikus pop\b/g, 'romantic pop')
    .replace(/\blírai ballada\b/g, 'lyrical ballad')
    .replace(/\blírai\b/g, 'poetic')
    .replace(/\bgyerekdal\b/g, 'children song')
    .replace(/\bünnepi akusztikus\b/g, 'holiday acoustic')
    .replace(/\bkarácsonyi pop\b/g, 'christmas pop')
    // Hangulatok
    .replace(/\bmelankolikus\b/g, 'melancholic')
    .replace(/\bérzelmes\b/g, 'emotional')
    .replace(/\bromantikus\b/g, 'romantic')
    .replace(/\bvid[aá]m\b/g, 'happy')
    .replace(/\bszomor[úu]\b/g, 'sad')
    .replace(/\blass[uú]\b/g, 'slow')
    .replace(/\bgyors\b/g, 'fast')
    // Hangszerek
    .replace(/\bzongora\b/g, 'piano')
    .replace(/\bheged[űu]\b/g, 'violin')
    .replace(/\bgit[aá]r\b/g, 'guitar')
    .replace(/\bdob(ok)?\b/g, 'drum')
    .replace(/\bfuvola\b/g, 'flute')
    .replace(/\bcsell[oó]\b/g, 'cello')
    .replace(/\bvok[aá]l(os)?\b/g, 'vocal')
    .replace(/\bt[áa]nczene\b/g, 'dance')
    // Egyéb
    .replace(/\bklasszikus(zene)?\b/g, 'classical')
    .replace(/\bkomolyzene\b/g, 'classical')
    .replace(/\bambient\b/g, 'ambient')
    .replace(/\bfilmzene\b/g, 'soundtrack')
    .replace(/\bfolklo[ó]r\b/g, 'folk')
    .replace(/\bünnepi\b/g, 'holiday')
    .replace(/\breggae\b/g, 'reggae')
    .replace(/\breggie\b/g, 'reggae')
    .replace(/\bregg[eé]i\b/g, 'reggae')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- BUILD STYLE (CLIENT → SUNO, HU → EN) ---
function buildStyleEN(client, vocalNorm, styleEN) {
  const protectedGenres = new Set([
    'rap','hip hop','folk','violin','piano','guitar',
    'minimal techno','pop','rock','house','techno','trance','drum and bass',
    'r&b','soul','funk','jazz','blues','edm','electronic','ambient',
    'metal','punk','indie','country','reggaeton','reggae',
    'synthwave','trap','progressive house','deep house','electro house',
    'modern pop','romantic','poetic','lyrical','holiday acoustic','children song'
  ]);

  // Alap szétbontás
  const base = (styleEN || '').split(/[,\|\/]+/).map(s => normalizeGenre(s)).filter(Boolean);
  const cli  = (client || '').split(/[,\|\/]+/).map(s => normalizeGenre(s)).filter(Boolean);

  // 🧠 Egyesített, ismétlődésmentes lista (ez a korábbi all)
  const all = [...new Set([...base, ...cli, vocalNorm].filter(Boolean))];

  const out = [];
  const seen = new Set();

 // 1️⃣ Minden ügyfél által megadott műfajt engedünk (nincs szűrés)
for (const g of cli) {
  if (!seen.has(g)) {
    out.push(g);
    seen.add(g);
  }
}

  // 2️⃣ GPT hangulat / extra tagok (max. 2)
  let addedMood = 0;
  for (const tag of base) {
    if (!protectedGenres.has(tag) && !seen.has(tag) && addedMood < 2) {
      out.push(tag);
      seen.add(tag);
      addedMood++;
    }
  }

  // 3️⃣ Ének típusok
  let vt = '';
  switch (String(vocalNorm || '').toLowerCase()) {
  case 'male': vt = 'male vocals'; break;
  case 'female': vt = 'female vocals'; break;
  case 'duet': vt = 'male and female vocals'; break;
  case 'child': vt = 'child vocal'; break;
  case 'robot': vt = 'synthetic/robotic female vocal (vocoder, AI-like, crystal)'; break;
  case 'choir': vt = 'choir vocals (multiple voices, layered harmonies)'; break;
  case 'gospel choir': vt = 'gospel choir vocals (soulful, uplifting, rich harmonies)'; break;
  default: vt = '';
}

  if (vt && !seen.has(vt)) out.push(vt);

  // 4️⃣ Fallback – ha semmit sem ismert fel, legalább pop legyen
  return out.length ? out.join(', ') : 'pop';
}

// === STYLE FINAL ===
const styleFinal = buildStyleEN(styles, vocal, gptStyle);
// 4️⃣ Dalszöveg szakaszcímek normalizálása
function normalizeSectionHeadingsSafeStrict(text) {
  if (!text) return text;
  let t = String(text);

  // Magyar → angol
  t = t.replace(/^\s*\(?\s*(Vers|Verze)\s*0*([1-4])\s*\)?\s*:?\s*$/gmi, (_m, _v, n) => `Verse ${n}`);
  t = t.replace(/^\s*\(?\s*Refr[eé]n\s*\)?\s*:?\s*$/gmi, 'Chorus');

  // Nem kellő címek eltávolítása
  t = t.replace(/^\s*\(?\s*(H[ií]d|Bridge|Intro|Outro|Interlude)\s*\)?\s*:?\s*$/gmi, '');

  // Angol címek egységesítése
  t = t.replace(/^\s*(?:\(\s*)?(Verse\s+[1-4]|Chorus)(?:\s*\))?\s*:?\s*$/gmi, (_m, h) => `(${h})`);

  return t.trim();
}

    // Ha nem MP3: nincs Suno, csak Sheets + visszaadás
    if (!isMP3) {
      try {
        await safeAppendOrderRow({
          email: req.body.email || '',
          styles, vocal, language, brief, lyrics,
          link1: '', link2: '', format, delivery: req.body.delivery_label || req.body.delivery || ''
        });
      } catch (_e) {
        console.warn('[SHEETS_WRITE_ONLY_MODE_FAIL]', _e?.message || _e);
      }
      lyrics = normalizeSectionHeadingsSafeStrict(lyrics);
      // === GUARD v5.2 – RhythmFix (auto-word-count normalization per genre) ===
try {
  const norm = (styles || '').toLowerCase();

  // genre minimum word targets
  const targets = {
    techno: 7,
    electronic: 7,
    house: 7,
    trance: 7,
    rap: 10,
    'drum and bass': 10,
    child: 6,
    pop: 8,
    acoustic: 7,
    ballad: 7
  };

  let appliedTarget = 0;
  for (const key of Object.keys(targets)) {
    if (norm.includes(key)) { appliedTarget = targets[key]; break; }
  }

  if (appliedTarget > 0) {
    const lines = lyrics.split('\n');
    const fixed = lines.map(line => {
      const clean = line.trim();
     if (!clean) return clean;
    // csak akkor skip, ha TÉNYLEG Verse/Chorus
    if (/^\(\s*(Verse\s*[1-4]|Chorus)\s*\)$/.test(clean)) return clean;

      const wordCount = clean.split(/\s+/).length;
      if (wordCount < appliedTarget) {
        const lastWord = clean.split(/\s+/).pop();
        // ismétlés ritmikai kitöltésre – nem módosít jelentést
        return clean + ' ' + Array(Math.max(1, appliedTarget - wordCount)).fill(lastWord).join(' ');
      }
      return clean;
    });
    lyrics = fixed.join('\n');
    console.log(`[RhythmFix] Applied minimal word-count = ${appliedTarget}`);
  }
} catch (err) {
  console.warn('[RhythmFix] skipped due to error:', err.message);
}

     return; // háttérfolyamat vége – response már elküldve korábban

    }

    // === SUNO API CALL (MP3 only) ===
    const startRes = await sunoStartV1(SUNO_BASE_URL + '/api/v1/generate', {
      'Authorization': 'Bearer ' + SUNO_API_KEY,
      'Content-Type': 'application/json'
    }, {
      customMode: true,
      model: 'V5',
      instrumental: (vocal === 'instrumental'),
      title: title,
      style: styleFinal,
      prompt: lyrics,
      callBackUrl: PUBLIC_URL ? (PUBLIC_URL + '/api/suno/callback') : undefined
    });

   if (!startRes.ok) {
  console.warn('[generate_song] Suno start error', startRes.status);
  return;
}

    const sj = startRes.json;
  if (!sj || sj.code !== 200 || !sj.data || !sj.data.taskId) {
  console.warn('[generate_song] Suno bad response', sj);
  return;
}

    const taskId = sj.data.taskId;

    // Poll up to 2 tracks
    const maxAttempts = Number(process.env.SUNO_MAX_ATTEMPTS || 160);
    const intervalMs  = Math.floor(Number(process.env.SUNO_POLL_INTERVAL || 2000));
    let attempts = 0, tracks = [];
    while (tracks.length < 2 && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, intervalMs));
      const pr = await fetch(SUNO_BASE_URL + '/api/v1/generate/record-info?taskId=' + encodeURIComponent(taskId), {
        method:'GET',
        headers:{ 'Authorization': 'Bearer ' + SUNO_API_KEY }
      });
      if (!pr.ok) continue;
      const st = await pr.json();
      if (!st || st.code !== 200) continue;
      const items = (st.data && st.data.response && st.data.response.sunoData) || [];
      tracks = items.flatMap(d => {
          const urls = [];
          const a1 = d.audioUrl || d.url || d.audio_url;
          const a2 = d.audioUrl2 || d.url2 || d.audio_url_2;
          if (a1) urls.push(a1);
          if (a2) urls.push(a2);
          if (Array.isArray(d.clips)) {
            for (const c of d.clips) {
              if (c?.audioUrl || c?.audio_url) urls.push(c.audioUrl || c.audio_url);
              if (c?.audioUrlAlt || c?.audio_url_alt) urls.push(c.audioUrlAlt || c.audio_url_alt);
            }
          }
          return urls.map(u => ({ title: d.title || title, audio_url: u, image_url: d.imageUrl || d.coverUrl }));
        })
        .map(x => ({ ...x, audio_url: String(x.audio_url||'').trim() }))
        .filter(x => !!x.audio_url && /^https?:\/\//i.test(x.audio_url))
        .reduce((acc, cur) => {
          if (!acc.find(t => t.audio_url === cur.audio_url)) acc.push(cur);
          return acc;
        }, [])
        .slice(0, 2);
    }

    if (!tracks.length) {
  console.warn('[generate_song] No tracks returned in time.');
  return;
}

    try {
      const link1 = tracks[0]?.audio_url || '';
      const link2 = tracks[1]?.audio_url || '';
      await safeAppendOrderRow({ email: req.body.email || '', styles, vocal, language, brief, lyrics, link1, link2, format,
      delivery: req.body.delivery_label || req.body.delivery || '' 
    });
    } catch (_e) { /* log only */ }

    } catch (err) {
        console.error('[BG generate_song error]', err);
      }
    });

  } catch (e) {
    console.error('[generate_song wrapper error]', e);
  }
});

/* ================== DIAG endpoints ======================== */
app.get('/api/generate_song/ping', (req, res) => {
  res.json({ ok:true, diag:{
    node: process.version, fetch_defined: typeof fetch!=='undefined',
    has_OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    has_SUNO_API_KEY: !!process.env.SUNO_API_KEY,
    SUNO_BASE_URL: process.env.SUNO_BASE_URL||null,
    public_url: process.env.PUBLIC_URL || null
  }});
});

app.get('/api/suno/ping', async (req, res) => {
  try{
    const BASE = (process.env.SUNO_BASE_URL || 'https://sunoapi.org').replace(/\/+$/,'');
    const H = { 'Authorization': `Bearer ${process.env.SUNO_API_KEY||''}`, 'Content-Type':'application/json' };
    const r1 = await fetch(`${BASE}/api/v1/generate`, { method:'POST', headers:H, body: JSON.stringify({ invalid:true }) });
    const t1 = await r1.text();
    return res.json({ ok:true, base: BASE, post_generate: { status:r1.status, len:t1.length, head:t1.slice(0,160) } });
  }catch(e){
    return res.status(500).json({ ok:false, error: (e && e.message) || e });
  }
});

/* ================== SUNO CALLBACK (no-op) ================= */
app.post('/api/suno/callback', async (req, res) => {
  try {
    console.log('[SUNO CALLBACK] body:', req.body);
    res.json({ ok:true });
  } catch (e) {
    console.error('[SUNO CALLBACK ERROR]', e);
    res.status(500).json({ ok:false });
  }
});
// === ADULT LOCK HELPERS ===
// Ha a brief felnőtt élethelyzetet jelez (házasság/unoka/40 év stb.), akkor tiltjuk a child témát
// === CHILD/ADULT INTENT HELPERS ===
// Gyerekdal CSAK akkor engedett, ha:
// 1) a stílus/brief KIFEJEZETTEN gyerekdalt kér (pl. "gyerekdal", "altató", "mondóka", "ovis/óvoda"), VAGY
// 2) szerepel konkrét életkor, ami 10 év alatti (1–9 éves / egy–kilenc éves).
// Minden más esetben default: FELNŐTT (adultLock = TRUE).

function detectUnder10Age(text = '') {
  const t = (text || '').toString().toLowerCase();

  // 1–9 éves (számjeggyel, kötőjellel is)
  if (/\b([1-9])\s*[-–]?\s*éves\b/.test(t)) return true;

  // egy–kilenc éves (szóval)
  if (/\b(egy|kettő|két|három|négy|öt|hat|hét|nyolc|kilenc)\s*éves\b/.test(t)) return true;

  // egybeírt formák (pl. "kilencéves")
  if (/\b(egy|kettő|két|három|négy|öt|hat|hét|nyolc|kilenc)éves\b/.test(t)) return true;

  return false;
}

function hasExplicitChildRequest(text = '') {
  const t = (text || '').toString().toLowerCase();

  // Szándékosan NEM triggerelünk pusztán a "gyerek/gyermek" szavakra,
  // mert az felnőtt szerelmes dalokban is előfordulhat ("mint két gyermek").
  return /(\bgyerekdal\b|\bgyermekdal\b|\bmondóka\b|\baltató\b|\baltatódal\b|\bovis\b|\bóvoda\b|\bovoda\b|\bóvodás\b|\bovodas\b|\bbölcsőde\b|\bbolcsode\b|\bkicsiknek\b|\bgyerekeknek\b|\bgyermekeknek\b|\bkids\s*song\b|\bchildren\s*song\b|\bnursery\s*rhyme\b)/.test(t);
}

function isChildIntent(styles = '', brief = '', vocal = '') {
  const s = (styles || '').toString().toLowerCase();
  const b = (brief  || '').toString().toLowerCase();
  const v = (vocal  || '').toString().toLowerCase();

  const vocalChild = /^child\b/.test(v) || /^gyerek\b/.test(v) || /^gyermek\b/.test(v);
  const styleOrBriefExplicit = hasExplicitChildRequest(s + ' ' + b);
  const ageUnder10 = detectUnder10Age(b);

  return !!(vocalChild || styleOrBriefExplicit || ageUnder10);
}


const ADULT_BANNED_CHILD_TOKENS = [
  'napocska','dalocska','taps-taps','la-la','bumm-bumm',
  'ovis','óvoda','ovoda','óvodás','ovodas',
  'mondóka','mondoka','altató','altato',
  'mesehős','mesehos',
  'játsszunk','játszunk'
];

function containsChildlikeTokens(text = '') {
  const t = (text || '').toString().toLowerCase();
  return ADULT_BANNED_CHILD_TOKENS.some(w => t.includes(w));
}

// === STYLE PROFILE DECISION ENGINE (6 fő zenei stílus + 4 tematikus blokk) ===
function determineStyleProfile(styles = '', brief = '', vocal = '') {
  const s = (styles || '').toLowerCase();
  const b = (brief || '').toLowerCase();

  // --- 1️⃣ Alap zenei stílus detektálása ---
  let baseStyle = 'pop';
  if (/(rock|punk|metal)/.test(s)) baseStyle = 'rock';
  else if (/(techno|trance|electro|house|edm|electronic|dnb|drum)/.test(s)) baseStyle = 'electronic';
  else if (/(acoustic|ballad|folk|guitar|piano|lírai|lassú)/.test(s)) baseStyle = 'acoustic';
  else if (/(rap|trap|hip.?hop)/.test(s)) baseStyle = 'rap';
  else if (/(none|null|unknown)/.test(s)) baseStyle = 'none';

   // --- 2️⃣ Tematikus blokk felismerése ---
  let theme = null;

  const childIntent = isChildIntent(styles, brief, vocal);
  const adultLock = !childIntent;

  if (/(esküvő|lánykérés|valentin|jegyes|házasság)/.test(b)) theme = 'wedding';
  else if (/(temetés|halál|gyász|nyugodj|részvét|elmúlás)/.test(b)) theme = 'funeral';
  else if (childIntent) theme = 'child';
  else if (/(szülinap|születésnap|ünnep|party|ünneplés|boldog szülinap)/.test(b)) theme = 'birthday';

  // --- 4️⃣ Alap stílusprofilok ---
  const baseProfiles = {
    pop: {
      rhythm: { wordsPerLine: [8, 10], tempo: 'medium' },
      tone: { emotion: 'high', brightness: 'warm', density: 'balanced' },
      words: { allowSlang: false, repetition: 'low', variation: 'high', poeticImages: 'moderate' }
    },
    rock: {
      rhythm: { wordsPerLine: [8, 12], tempo: 'medium-fast' },
      tone: { emotion: 'strong', brightness: 'bright', density: 'dense' },
      words: { allowSlang: true, repetition: 'low', variation: 'high', poeticImages: 'few' }
    },
    electronic: {
      rhythm: { wordsPerLine: [7, 8], tempo: 'fast' },
      tone: { emotion: 'neutral', brightness: 'cool', density: 'minimal' },
      words: { allowSlang: false, repetition: 'medium', variation: 'medium', poeticImages: 'minimal' }
    },
    acoustic: {
      rhythm: { wordsPerLine: [7, 11], tempo: 'slow' },
      tone: { emotion: 'soft', brightness: 'warm', density: 'airy' },
      words: { allowSlang: false, repetition: 'low', variation: 'high', poeticImages: 'rich' }
    },
    rap: {
      rhythm: { wordsPerLine: [10, 16], tempo: 'variable' },
      tone: { emotion: 'assertive', brightness: 'neutral', density: 'dense' },
      words: { allowSlang: true, repetition: 'rhythmic', variation: 'high', poeticImages: 'few' }
    },
    none: {
      rhythm: { wordsPerLine: [7, 10], tempo: 'medium' },
      tone: { emotion: 'neutral', brightness: 'balanced', density: 'medium' },
      words: { allowSlang: false, repetition: 'moderate', variation: 'medium', poeticImages: 'balanced' }
    }
  };

  // --- 5️⃣ Tematikus módosítók (felülírás a zenei profilon) ---
  const themeMods = {
    wedding: {
      tone: { emotion: 'romantic', brightness: 'warm', density: 'full' },
      words: {
        keywords: ['ígéret', 'hűség', 'örök', 'fény', 'igen'],
        allowSlang: false,
        variation: 'very-high',
        poeticImages: 'rich'
      },
      overrides: {
        positivity: 'high',
        structure: 'balanced',
        metaphorRule: 'logical-only',
        repetition: 'minimal'
      }
    },
    funeral: {
      tone: { emotion: 'serene', brightness: 'dim', density: 'soft' },
      words: {
        keywords: ['emlék', 'fény', 'hála', 'búcsú', 'béke'],
        allowSlang: false,
        variation: 'medium',
        poeticImages: 'gentle'
      },
      overrides: {
        positivity: 'low',
        structure: 'slow',
        metaphorRule: 'realistic',
        repetition: 'minimal'
      }
    },
    child: {
      tone: { emotion: 'joyful', brightness: 'bright', density: 'light' },
      words: {
        keywords: ['játszunk', 'játsszunk', 'napocska', 'dalocska','ovis', 'kacagás', 'bumm-bumm', 'la-la', 'taps-taps'],
        allowSlang: false,
        variation: 'medium',
        poeticImages: 'simple'
      },
      overrides: {
        simplicity: 'high',
        repetition: 'moderate',
        onomatopoeia: ['taps-taps', 'la-la', 'bumm-bumm'],
        onomatopoeiaPlacement: 'chorus-only'
      }
    },
    birthday: {
      tone: { emotion: 'cheerful', brightness: 'bright', density: 'full' },
      words: {
        keywords: ['élet', 'barátok', 'nevetés', 'torta', 'fény', 'emlék', 'boldog születésnap'],
        allowSlang: false,
        variation: 'high',
        poeticImages: 'vivid'
      },
      overrides: {
        positivity: 'very-high',
        structure: 'upbeat',
        refrainNameMention: true,
        repetition: 'moderate'
      }
    }
  };

  // --- 6️⃣ Összevonás és prioritáskezelés ---
  let profile = JSON.parse(JSON.stringify(baseProfiles[baseStyle] || baseProfiles.pop));
  profile.baseStyle = baseStyle;
  profile.theme = theme;
  profile.priority = ['theme', 'style'];

  // Tematikus felülírás
  if (theme && themeMods[theme]) {
    const t = themeMods[theme];
    profile.tone = { ...profile.tone, ...t.tone };
    profile.words = { ...profile.words, ...t.words };
    profile.overrides = { ...t.overrides };
  }

  // Globális szabály: minden stílusban törekvés a változatosságra
  profile.universalRules = {
    enforceVariation: true,
    forbidIdenticalSentenceStart: true,
    forbidNonsensicalMetaphor: true,
    requirePositiveClosure: true
  };
  // --- 7️⃣ Gyerekdal-szókészlet izolálása ---
  // Ha a stílus vagy téma NEM gyerekdal, akkor a gyerekdalos kulcsszavakat töröljük a keywords-ból
  if (profile.theme !== 'child' && profile.baseStyle !== 'child') {
    const childWords = [
      'játszunk', 'játsszunk', 'napocska', 'dalocska',
      'ovis', 'kacagás', 'bumm-bumm', 'la-la', 'taps-taps'
    ];
    if (Array.isArray(profile.words.keywords)) {
      profile.words.keywords = profile.words.keywords.filter(
        w => !childWords.includes(w)
      );
    }
  }
  // --- 8️⃣ AdultLock flag (GPT-nek tiltás-jelzés) ---
  profile.adultLock = !!adultLock;

  return profile;
}


/* ================== Start server ========================== */
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
