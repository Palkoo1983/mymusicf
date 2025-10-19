// ESM server.js – FINAL (stable)
// - Keeps previous features (HU polish + rhyme/structure + style preserve + "céges"/"évzáró" cleanup)
// - Guarantees numbers from brief appear, then converts digits→words at the very end
// - Non-HU enforce only
// - No stray \1 / print / unclosed strings; Node 18+ fetch OK

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { appendOrderRow, safeAppendOrderRow } from './sheetsLogger.js';


/* === PostProcess Grammar Fix – safe, HU-specific === */
function fixHungarianGrammar(lyrics) {
  let out = String(lyrics || '');

  // tárgyrag tipikus esetei
  out = out.replace(/érzed a szeretet([^a-záéíóöőúüűÁÉÍÓÖŐÚÜŰ])/gi, 'érzed a szeretetet$1');
  out = out.replace(/a szeretet([^a-záéíóöőúüűÁÉÍÓÖŐÚÜŰ])/gi, 'a szeretetet$1');

  // dupla tiltás
  out = out.replace(/soha\s+ne\s+nem/gi, 'soha nem');

  // felesleges "én" mondatvég
  out = out.replace(/vágyat\s+én\b/gi, 'vágyat');
  out = out.replace(/szavak nélkül érzed a vágyat\s+én/gi, 'szavak nélkül érzed a vágyat');

  // általános finomítások
  out = out.replace(/[ ]{2,}/g, ' ').replace(/\s+([.,!?:;])/g, '$1');
  return out;
}

// === EnZenem: Theme/Genre detectors + HU post-processor (regression guard) ===
function detectTheme(brief = '', styles = '') {
  const t = (String(brief) + ' ' + String(styles)).toLowerCase();
  if (/(temet[ée]s|búcsúztat[óő]|gyász|ravatal)/.test(t)) return 'funeral';
  if (/(lánykérés|eljegyzés|kér[jd] meg|proposal)/.test(t)) return 'proposal';
  if (/(esküv[őo]i|esküv[őo]|menyegző|lagzi)/.test(t)) return 'wedding';
  if (/(évforduló|házassági évforduló|jubileum)/.test(t)) return 'anniversary';
  if (/(születésnap|birthday|névnap)/.test(t)) return 'birthday';
  if (/(jobbulás|gyógyulás|betegség|egészség|healing)/.test(t)) return 'healing';
  if (/(gyerekdal|gyermekdal|ovis|óvodás|kids|children)/.test(t)) return 'kidsong';
  return 'generic';
}
function detectGenre(styles = '') {
  const s = String(styles || '').toLowerCase();
  if (/(techno|minimal|house)/.test(s)) return 'techno';
  if (/(rap|hip[\s-]?hop|trap)/.test(s)) return 'rap';
  if (/(pop|ballad|ballada|piano|zongora)/.test(s)) return 'pop';
  if (/(rock|metal)/.test(s)) return 'rock';
  return 'generic';
}
function postProcessHU(lyrics, { theme, genre, brief }) {
  let out = String(lyrics || '');
  out = out.replace(/\b[Cc]éges( gondolatok)?\b/g, '');
  if (/(funeral|wedding|anniversary|kidsong|healing)/.test(String(theme))) {
    out = out.replace(/\b[Tt]empó\b/g, 'ütem');
  }
  out = out.replace(/^\s*,\s*/gm, '').replace(/[ ]{2,}/g, ' ').replace(/\s+([.,!?:;])/g, '$1');
  if (theme === 'funeral') {
    const wantsDrums = /\bvisszafogott\s+dob\b/i.test(brief) || /\bdob\b/i.test(brief);
    if (!wantsDrums) {
      out = out.replace(/\bdob(ok|bal|bal|ot)?\b/gi, '');
      out = out.replace(/[ ]{2,}/g, ' ').replace(/\s+([.,!?:;])/g, '$1');
    } else {
      out = out.replace(/\bdob(ok|bal|bal|ot)?\b/gi, 'visszafogott dob').replace(/visszafogott\s+visszafogott/gi, 'visszafogott');
    }
  }
  if (theme === 'proposal') {
    out = out.replace(/\(Chorus\)([\s\S]*?)(?=\n\(Verse 4\)|$)/, (m, ch) => {
      if (!/[?？]/.test(ch)) {
        return `(Chorus)\n${ch.trim()}\nKérlek, mondd ki most: leszel a feleségem?\n`;
      }
      return m;
    });
  }
  if (theme === 'kidsong') {
    out = out.replace(/(.{9,})/g, (line) => line.replace(/(\S+\s+\S+\s+\S+\s+\S+)(\s+)/g, '$1\n'));
  }
  const briefLower = String(brief || '').toLowerCase();
  if (!briefLower.includes('céges')) { out = out.replace(/\b[Cc]éges( gondolatok)?\b/g, ''); }
  if (!briefLower.includes('tempó')) { out = out.replace(/\b[Tt]empó\b/g, 'ütem').replace(/\b[Tt]empós\b/g, 'lendületes'); }
  out = out.replace(/\btitkus\b/gi, 'titkos').replace(/\bállik\b/gi, 'áll');

  out = out.replace(/^Kulcsszavak:.*$/gmi, '');
  return out;
}
// === End of regression guard helpers ===


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

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/* ================== Middleware / static ================= */
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

async function sendViaSMTP({ to, subject, html, replyTo }) {
  const transport = buildTransport();
  if (!transport) return { skipped: true, reason: 'SMTP not configured/disabled' };
  const from = ENV.MAIL_FROM || ENV.SMTP_USER;
  const info = await transport.sendMail({ from, to, subject, html, replyTo });
  console.log('[MAIL:SENT:SMTP]', { to, subject, id: info.messageId });
  return { messageId: info.messageId };
}

async function sendViaResend({ to, subject, html, replyTo }) {
  if (!ENV.RESEND_API_KEY) return { skipped: true, reason: 'RESEND_API_KEY not set' };
  const from = ENV.MAIL_FROM || 'onboarding@resend.dev';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ENV.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, html, reply_to: replyTo || undefined })
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
app.post('/api/order', (req, res) => {
  const o = req.body || {};
  const owner = ENV.TO_EMAIL || ENV.SMTP_USER;
  const orderHtml = `
    <h2>Új megrendelés</h2>
    <ul>
      <li><b>E-mail:</b> ${o.email || ''}</li>
      <li><b>Esemény:</b> ${o.event_type || ''}</li>
      <li><b>Stílus:</b> ${o.style || ''}</li>
      <li><b>Ének:</b> ${o.vocal || ''}</li>
      <li><b>Nyelv:</b> ${o.language || ''}</li>
    </ul>
    <p><b>Brief:</b><br/>${(o.brief || '').replace(/\n/g, '<br/>')}</p>
  `;
  const jobs = [{ to: owner, subject: 'Új dal megrendelés', html: orderHtml, replyTo: o.email || undefined }];
  if (o.email) {
    jobs.push({
      to: o.email,
      subject: 'EnZenem – Megrendelés fogadva',
      html: `<p>Kedves Megrendelő!</p><p>Köszönjük a megkeresést! A megrendelését megkaptuk, és 36 órán belül elküldjük Önnek a videó letöltési linkjét.
Ha bármilyen kérdése merül fel, szívesen segítünk!</p><p>Üdv,<br/>EnZenem</p>`
    });
  }
  queueEmails(jobs);
  res.json({ ok: true, message: 'Köszönjük! Megrendelésed beérkezett. Hamarosan kapsz visszaigazolást e-mailben.' });
});

app.post('/api/contact', (req, res) => {
  const c = req.body || {};
  const owner = ENV.TO_EMAIL || ENV.SMTP_USER;
  const html = `
    <h2>Új üzenet</h2>
    <ul>
      <li><b>Név:</b> ${c.name || ''}</li>
      <li><b>E-mail:</b> ${c.email || ''}</li>
    </ul>
    <p>${(c.message || '').replace(/\n/g, '<br/>')}</p>
  `;
  const jobs = [{ to: owner, subject: 'EnZenem – Üzenet', html, replyTo: c.email || undefined }];
  if (c.email) jobs.push({ to: c.email, subject: 'EnZenem – Üzenet fogadva', html: '<p>Köszönjük az üzenetet, hamarosan válaszolunk.</p>' });
  queueEmails(jobs);
  res.json({ ok: true, message: 'Üzeneted elküldve. Köszönjük a megkeresést!' });
});

/* =================== Stripe (optional) ==================== */
const PRICE = {
  basic:  Number(process.env.PRICE_BASIC || 19900),
  premium:Number(process.env.PRICE_PREMIUM || 34900),
  video:  Number(process.env.PRICE_VIDEO || 49900)
};
const CURRENCY = (process.env.CURRENCY || 'huf').toLowerCase();

app.post('/api/checkout', async (req, res) => {
  try{
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
    if(!rateLimit('checkout:'+ip, 60000, 10)) return res.status(429).json({ok:false, message:'Túl sok kérés. Próbáld később.'});
    const o = req.body || {};
    if(o._hp) return res.status(400).json({ ok:false, message:'Hiba.' });
    if(!stripe){ return res.status(503).json({ ok:false, message:'Fizetés ideiglenesen nem elérhető.' }); }
    const pack = (o.package || 'basic').toLowerCase();
    const amount = PRICE[pack] || PRICE.basic;
    const lineItem = {
      price_data: {
        currency: CURRENCY,
        unit_amount: Math.max(200, amount),
        product_data: { name: `EnZenem – ${pack} csomag` }
      },
      quantity: 1
    };
    const metadata = {
      email: o.email || '', event_type: o.event_type || '', style: o.style || '',
      vocal: o.vocal || '', language: o.language || '', brief: (o.brief || '').slice(0, 1500), package: pack
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [lineItem],
      success_url: (process.env.PUBLIC_URL || '') + '/success.html',
      cancel_url: (process.env.PUBLIC_URL || '') + '/cancel.html',
      metadata
    });
    res.json({ ok:true, url: session.url });
  }catch(e){
    console.error('[CHECKOUT ERROR]', e);
    res.status(500).json({ ok:false, message:'Nem sikerült a fizetési oldal létrehozása.' });
  }
});

app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if(!stripe){ return res.status(400).end(); }
  let event;
  try {
    if(process.env.STRIPE_WEBHOOK_SECRET){
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (err) {
    console.error('[WEBHOOK VERIFY FAIL]', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try{
    if(event.type === 'checkout.session.completed'){
      const s = event.data.object;
      const md = s.metadata || {};
      const owner = ENV.TO_EMAIL || ENV.SMTP_USER;
      const email = md.email || s.customer_details?.email;
      const orderHtml = `
        <h2>Fizetett megrendelés</h2>
        <ul>
          <li><b>E-mail:</b> ${email || ''}</li>
          <li><b>Esemény:</b> ${md.event_type || ''}</li>
          <li><b>Stílus:</b> ${md.style || ''}</li>
          <li><b>Ének:</b> ${md.vocal || ''}</li>
          <li><b>Nyelv:</b> ${md.language || ''}</li>
          <li><b>Csomag:</b> ${md.package || ''}</li>
          <li><b>Összeg:</b> ${(s.amount_total/100).toFixed(0)} ${s.currency?.toUpperCase()}</li>
        </ul>
        <p><b>Brief:</b><br/>${(md.brief || '').replace(/\n/g,'<br/>')}</p>
        <p><i>Stripe session: ${s.id}</i></p>
      `;
      await sendMailFast({ to: owner, subject: 'EnZenem – Fizetett megrendelés', html: orderHtml, replyTo: email || undefined });
      if(email){
        await sendMailFast({ to: email, subject: 'EnZenem – Fizetés sikeres', html: '<p>Köszönjük a fizetést! Hamarosan jelentkezünk a részletekkel.</p>' });
      }
    }
    res.json({received: true});
  }catch(e){
    console.error('[WEBHOOK HANDLER ERROR]', e);
    res.status(500).end();
  }
});

/* ================== SUNO CALLBACK ========================= */
app.post('/api/suno/callback', async (req, res) => {
  try {
    console.log('[SUNO CALLBACK] body:', req.body);
    res.json({ ok:true });
  } catch (e) {
    console.error('[SUNO CALLBACK ERROR]', e);
    res.status(500).json({ ok:false });
  }
});

/* ================== STYLE PRESERVE helper ================= */
function preserveClientGenres(styles, style_en, vocalTag){
  const protectedGenres = [
    'minimal techno','pop','rock','house','techno','trance','drum and bass','dnb','hip hop','hip-hop',
    'r&b','rnb','soul','funk','jazz','blues','edm','electronic','ambient','lo-fi','lofi','metal','punk',
    'indie','folk','country','reggaeton','reggae','synthwave','vaporwave','trap','drill','hardstyle',
    'progressive house','deep house','electro house','future bass','dubstep','garage','uk garage','breakbeat','phonk'
  ];
  let out = (style_en || '').toLowerCase();
  const src = (styles || '').toLowerCase();

  const toKeep = [];
  for (const g of protectedGenres){
    if (src.includes(g) && !out.includes(g)){
      toKeep.push(g);
    }
  }
  if (toKeep.length){
    out = (out ? out + ', ' : '') + toKeep.join(', ');
  }
  if (vocalTag && !out.includes(vocalTag)){
    out = (out ? out + ', ' : '') + vocalTag;
  }
  return out.replace(/\s+/g,' ').trim();
}

/* ================== SUNO START helper (retry) ============= */
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

/* ======================= HU POLISH HELPER ======================= */
async function polishHungarianLyrics({ OPENAI_API_KEY, OPENAI_MODEL, lyrics, mandatoryKeywords = [] }) {
  const sys = [
    "Te magyar anyanyelvű dalszöveg-szerkesztő vagy.",
    "Javítsd a MAGYAR ragozást, a természetes szórendet és a költői folyamatosságot, úgy, hogy a jelentés NE változzon, a ritmus és a rímek maradjanak, a szakaszfejlécek érintetlenek.",
    "TILOS új fejezetcímeket kitalálni vagy a meglévőket átírni.",
    "Kerüld a tükörfordítás-ízű, magyartalan szerkezeteket.",
    "Pl. \"<főnév> fest aranyra a táj\" helyett természetesebb: \"Arany naplemente nyugszik a tájon\" / \"A tájat aranyra festi a naplemente\".",
    "Megszólításnál természetes alakot használj (pl. \"Bence,\"; érzelmes birtokosnál \"Bencém\"), a tárgyesetet (\"Bencét\") csak indokolt szerkezetben.",
    "A sorok maradjanak rövidek, énekelhetők; a rímek legyenek gyengédek (ne kényszeríts értelmetlenséget).",
    "Kötelező kulcsszavak maradjanak verbatim: " + (mandatoryKeywords.length ? mandatoryKeywords.join(", ") : "(nincs)"),
    "FORMÁTUM: Verse 1 / Verse 2 / Chorus / Verse 3 / Verse 4 / Chorus – és versszakonként ugyanannyi sor maradjon.",
    "Csak a végleges dalszöveget add vissza (fejlécekkel), extra komment nélkül."
  ].join("\n");

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: lyrics }],
      temperature: 0.5,
      max_tokens: 900
    })
  });
  if (!r.ok) return lyrics;
  const j = await r.json();
  const out = (j?.choices?.[0]?.message?.content || '').trim();
  return out || lyrics;
}

/* ===== Kulcsszó-lista jellegű sor-kezdetek természetesítése ===== */
async function rewriteKeywordListOpeners({ OPENAI_API_KEY, OPENAI_MODEL, lyrics }) {
  const looksListy = /(^|\n)\s*[A-ZÁÉÍÓÖŐÚÜŰ][^,\n]+(?:\s*,\s*[A-ZÁÉÍÓÖŐÚÜŰ][^,\n]+){1,}\s*,?\s+[a-záéíóöőúüű]/;
  if (!looksListy.test(lyrics)) return lyrics;

  const sys = [
    "Magyar dalszöveg-szerkesztő vagy.",
    "Ha bármely sor kulcsszó-felsorolással KEZDŐDIK (pl. \"Céges, Tempó, Emlék, …\"), fogalmazd át természetes, énekelhető sorra, a kulcsszavak maradjanak, de ne legyen csupasz lista. Rím/ritmus maradjon.",
    "A szakaszcímek (Verse 1/2/3/4, Chorus) maradjanak változatlanok. A sor- és versszakszám maradjon.",
    "Csak a kész dalszöveget add vissza."
  ].join("\n");

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: lyrics }],
      temperature: 0.4,
      max_tokens: 900
    })
  });
  if (!r.ok) return lyrics;
  const j = await r.json();
  return (j?.choices?.[0]?.message?.content || '').trim() || lyrics;
}

/* ===== HU NUMBERS → WORDS (deterministic) ===== */
function huNumberWord(n) {
  const ones = ['nulla','egy','kettő','három','négy','öt','hat','hét','nyolc','kilenc'];
  const tens = ['','tíz','húsz','harminc','negyven','ötven','hatvan','hetven','nyolcvan','kilencven'];
  const teens = ['tíz','tizenegy','tizenkettő','tizenhárom','tizennégy','tizenöt','tizenhat','tizenhét','tizennyolc','tizenkilenc'];
  n = Number(n);
  if (!Number.isFinite(n)) return String(n);
  if (n < 10) return ones[n];
  if (n < 20) return teens[n-10];
  if (n < 100) {
    const t = Math.floor(n/10), r = n%10;
    return r ? tens[t] + (t===2 ? '' : '') + '-' + ones[r] : tens[t];
  }
  if (n < 1000) {
    const h = Math.floor(n/100), r = n%100;
    const head = (h===1 ? 'száz' : ones[h] + 'száz');
    if (!r) return head;
    if (r < 10) return head + ones[r];
    if (r < 20) return head + teens[r-10];
    const t = Math.floor(r/10), u = r%10;
    return head + tens[t] + (u ? '-' + ones[u] : '');
  }
  if (n < 10000) {
    const th = Math.floor(n/1000), r = n%1000;
    const head = (th===1 ? 'ezer' : ones[th] + 'ezer');
    if (!r) return head;
    let tail = '';
    if (r < 10) tail = ones[r];
    else if (r < 20) tail = teens[r-10];
    else if (r < 100) {
      const t = Math.floor(r/10), u = r%10;
      tail = tens[t] + (u ? '-' + ones[u] : '');
    } else {
      const h = Math.floor(r/100), rr = r%100;
      const head2 = (h===1 ? 'száz' : ones[h] + 'száz');
      if (!rr) tail = head2;
      else if (rr < 10) tail = head2 + ones[rr];
      else if (rr < 20) tail = head2 + teens[rr-10];
      else {
        const t = Math.floor(rr/10), u = rr%10;
        tail = head2 + tens[t] + (u ? '-' + ones[u] : '');
      }
    }
    return head + '-' + tail;
  }
  return String(n);
}
function normalizeNumbersHU(text) {
  let out = text;
  out = out.replace(/(\d+)\s*%/g, (_m, d) => huNumberWord(d) + ' százalék');
  out = out.replace(
    /(\d+)(-|\s)?(os|ös|ban|ben|ból|ből|ra|re|hoz|hez|höz|nál|nél|tól|től|val|vel|ként|ig|nak|nek|ról|ről|ba|be|on|en|ön|n|kor)\b/gi,
    (_m, d, _sep, rag) => huNumberWord(d) + (rag ? ' ' + rag.toLowerCase() : '')
  );
  out = out.replace(/\b\d+\b/g, (m) => huNumberWord(m));
  return out;
}

/* ---- HU soft awkward/profane filter ---- */
function softHungarianAwkwardFilter(text) {
  if (!text) return text;
  let out = String(text);
  const replacements = [
    [/\bközösen dúgja\b/gi, 'közösen dúdolja'],
    [/\bdúgja\b/gi, 'dúdolja'],
    [/\bél a szó\b/gi, 'száll a szó'],
    [/\börök éltet\b/gi, 'örökké éltet'],
    [/\bút nyitva áll\b/gi, 'nyitva a világ'],
    [/\bszívünk mindig szabad\b/gi, 'szívünk szabadon dobban'],
    [/\bmánusz\b/gi, 'manó'],
    [/\bNórit és Otit erős gyökérként állnak\b/gi, 'Nóri és Oti erős gyökérként állnak mellettünk'],
    [/\bÁlmok lassan fonódnak,\s*mint a fények ég\.?/gi, 'Álmok lassan fonódnak, mint fény az égen'],
    [/^\s*Szerepeljen minden érzés, mi él/gmi, 'Minden érzésünk él, ami bennünk él'],
    [/\bSzerepeljen\b/gi, 'Szóljon'],
    [/\besküvői szívekben\b/gi, 'esküvői szívünkben'],
    [/\bgyökérként állnak\b/gi, 'tartó erőként állnak']
  ];
  for (const [rx, to] of replacements) out = out.replace(rx, to);
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---- ENFORCE TARGET LANGUAGE (runs only if NOT HU) ---- */
async function enforceTargetLanguage({ OPENAI_API_KEY, OPENAI_MODEL, lyrics, language, names = [], mandatoryKeywords = [] }) {
  const target = String(language || 'hu').toLowerCase();
  const isHU = /^(hu|hungarian|magyar)$/.test(target);
  const looksHU = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(lyrics);
  if (isHU) return lyrics;
  if (!looksHU) return lyrics;

  let preserveList = [...new Set([...(names || [])].filter(Boolean))];
  const asciiOnly = (mandatoryKeywords || []).filter(k => /^[A-Za-z0-9 .,'"\-\&\(\)]+$/.test(k || ''));
  preserveList = [...new Set([...preserveList, ...asciiOnly])];

  const sys = [
    `Rewrite the lyrics fully into ${target}.`,
    "Preserve ALL section headings (Verse 1/Verse 2/Verse 3/Verse 4/Chorus).",
    "Keep rhythm and gentle rhymes.",
    (preserveList.length
      ? "Keep these tokens verbatim if they are proper names or must-stay words: " + preserveList.join(", ")
      : "Preserve proper names verbatim."),
    "Do NOT mix languages; remove any stray Hungarian words.",
    "Any Hungarian words are not proper names; translate them to the target language.",
    "If a personal name appears with a Hungarian case suffix (nak/nek/ban/ben/hoz/hez/höz/ra/re/tól/től/nál/nél), do not keep the suffix; render it naturally in the target language.",
    "Return ONLY the final lyrics text."
  ].join("\n");

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: lyrics }],
      temperature: 0.3,
      max_tokens: 900
    })
  });
  if (!r.ok) return lyrics;
  const j = await r.json();
  return (j?.choices?.[0]?.message?.content || '').trim() || lyrics;
}

/* ============ GPT → Suno generate ============ */
app.post('/api/generate_song', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
    if (!rateLimit('gen:' + ip, 45000, 5)) {
      return res.status(429).json({ ok:false, message:'Túl sok kérés. Próbáld később.' });
    }

    let { title = '', styles = '', vocal = 'instrumental', language = 'hu', brief = '' } = req.body || {};

    
    // Map requested package->format
    const pkg = (req.body && (req.body.package||req.body.format)) ? String((req.body.package||req.body.format)).toLowerCase() : 'basic';
    const format = pkg==='basic' ? 'mp3' : (pkg==='video' ? 'mp4' : pkg==='premium' ? 'wav' : pkg);
    const isMP3 = (format === 'mp3');
// language autodetect from brief (fallback)
    (function () {
      const b = (brief || '').toLowerCase();
      const cur = String(language || '').toLowerCase().trim();
      const map = [
        { re: /\bholland\b|\bdutch\b|\bnémetalföldi\b/, code: 'nl' },
        { re: /\bangol\b|\benglish\b/, code: 'en' },
        { re: /\bnémet\b|\bgerman\b/, code: 'de' },
        { re: /\bfrancia\b|\bfrench\b/, code: 'fr' },
        { re: /\bolasz\b|\bitalian\b/, code: 'it' },
        { re: /\bspanyol\b|\bspanish\b/, code: 'es' },
        { re: /\bportugál\b|\bportuguese\b/, code: 'pt' },
        { re: /\blengyel\b|\bpolish\b/, code: 'pl' },
        { re: /\bcseh\b|\bczech\b/, code: 'cs' },
        { re: /\bromán\b|\bromanian\b/, code: 'ro' },
        { re: /\bszlovák\b|\bslovak\b/, code: 'sk' },
        { re: /\bszerb\b|\bserbian\b/, code: 'sr' },
        { re: /\bkínai\b|\bchinese\b/, code: 'zh' }
      ];
      if (!cur || cur === 'hu' || cur === 'hungarian') {
        for (const m of map) { if (m.re.test(b)) { language = m.code; break; } }
      }
    })();

    // mandatory keywords (existing)
    const mandatoryKeywords = (() => {
      const b = (brief || '').toString();
      const arr = [];
      const m = b.match(/Kulcsszavak\s*:\s*([^\n\.]+)/i);
      if (m && m[1]) m[1].split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(k => arr.push(k));
      if (/évzáró/i.test(b)) arr.push('évzáró');
      if (/hackathon/i.test(b)) arr.push('hackathon');
      if (/\b2025\b/.test(b) || /kétezer\s+huszonöt/i.test(b)) arr.push('kétezer huszonöt');
      return Array.from(new Set(arr));
    })();

    // ADD: numbers/years from brief as mandatory (guarantee presence)
    (function(){
      const btxt = String(brief || '');
      const allNums = Array.from(btxt.matchAll(/\b\d{1,4}\b/g)).map(m => m[0]);
      const years   = Array.from(btxt.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)).map(m => m[0]);
      const lang = String(language || 'hu').toLowerCase();
      const isHU = /^(hu|hungarian|magyar)$/.test(lang);
      if (isHU) {
        const uniqYears = [...new Set(years)];
        for (const y of uniqYears) {
          const yWord = huNumberWord(Number(y)).replace(/\s+/g, ' ');
          if (yWord && !mandatoryKeywords.includes(yWord)) mandatoryKeywords.push(yWord);
        }
      } else {
        const uniqAll = [...new Set(allNums)];
        for (const n of uniqAll) {
          if (!mandatoryKeywords.includes(n)) mandatoryKeywords.push(n);
        }
      }
    })();

    // FILTER MANDATORY for non-HU (ASCII only)
    (function(){
      const lang = String(language || 'hu').toLowerCase();
      const isHU = /^(hu|hungarian|magyar)$/.test(lang);
      if (!isHU) {
        const asciiRx = /^[A-Za-z0-9 .,'"\-\&\(\)]+$/;
        for (let i = mandatoryKeywords.length - 1; i >= 0; i--) {
          const kw = mandatoryKeywords[i] || '';
          if (!asciiRx.test(kw)) mandatoryKeywords.splice(i, 1);
        }
      }
    })();

    // names + proposal
    let names = (() => {
      const b = (brief || '');
      const raw = b.match(/\b[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+\b/g) || [];
      const stop = new Set(['Szerelmem','Verse','Chorus','Margitszigeten','Margitsziget','Erdély','Tenerife','Madeira','Horvátország','Magyarország','Erdélyi','Horvát','Magyar']);
      return raw.filter(w => !stop.has(w));
    })();
    // drop "céges" accidental name
    if (Array.isArray(names)) {
      names = names.filter(n => n.toLowerCase() !== 'céges' && n.toLowerCase() !== 'ceges');
    }
    // strip HU name suffixes for non-HU
    {
      const lang = String(language || "hu").toLowerCase();
      const isHU = /^(hu|hungarian|magyar)$/.test(lang);
      if (!isHU && Array.isArray(names)) {
        const base = names.map(nm => {
          const s = String(nm || "");
          const mm = s.match(/^([A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű\-']+?)(?:nak|nek|val|vel|ba|be|ban|ben|ra|re|ról|ről|hoz|hez|höz|tól|től|nál|nél)?$/i);
          return mm ? mm[1] : s;
        });
        const seen = new Set(); const clean = [];
        for (const b of base) { const k = b.normalize("NFC"); if (!seen.has(k)) { seen.add(k); clean.push(b); } }
        names = clean;
      }
    }

    const isProposal = /eljegyz|megkérés|kér(?:i|em).*kezét|kér.*hozzám|kérdés.*igen/i.test(brief || '');
    const isKidSong = /gyerekdal|óvoda|ovi|nursery|kids?\b|children\b/i.test((brief || '') + ' ' + (styles || ''));

    // vocal normalization
    const v = (vocal || '').toString().trim().toLowerCase();
    if (/^női|female/.test(v)) vocal = 'female';
    else if (/^férfi|male/.test(v)) vocal = 'male';
    else if (/instrument/.test(v)) vocal = 'instrumental';
    else vocal = (v || 'instrumental');

    // env
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const SUNO_API_KEY   = process.env.SUNO_API_KEY;
    const SUNO_BASE_URL  = (process.env.SUNO_BASE_URL || '').replace(/\/+$/,'');
    const PUBLIC_URL     = (process.env.PUBLIC_URL || '').replace(/\/+$/,'');

    if (!OPENAI_API_KEY) return res.status(500).json({ ok:false, message:'OPENAI_API_KEY hiányzik' });
    if (!SUNO_API_KEY)   return res.status(500).json({ ok:false, message:'Suno API key hiányzik' });
    if (!SUNO_BASE_URL)  return res.status(500).json({ ok:false, message:'SUNO_BASE_URL hiányzik' });

    // idempotency
    const key = makeKey({ title, styles, vocal, language, brief });
    const now = Date.now();
    const last = activeStarts.get(key) || 0;
    if (now - last < 20000) return res.status(202).json({ ok:true, message:'Már folyamatban van egy azonos kérés.' });
    activeStarts.set(key, now);
    setTimeout(() => activeStarts.delete(key), 60000);

    // style hints
    const st = (styles || '').toLowerCase();
    let rhythmHint = 'standard pop verse-chorus structure (6–10 words per line)';
    if (/techno|minimal|house/.test(st)) {
      rhythmHint = 'short, loop-like lines (2–6 words), repetitive, atmospheric; MAY extend a line when needed to naturally include a mandatory keyword';
    } else if (/rap|hip ?hop|trap|drill/.test(st)) {
      rhythmHint = 'longer, rhyme-rich lines (10–20 words) with flow';
    } else if (/trance|dance|edm|k[- ]?pop/.test(st)) {
      rhythmHint = 'energetic, uplifting, 4–6 word lines, catchy and repetitive';
    }
    let toneHint = 'use a natural tone matching the described genre.';
    if (/lírikus|poetic|ballad|ballada|romantik/.test(st)) toneHint = 'use a poetic, lyrical tone with rich imagery, gentle rhymes and emotional depth.';
    else if (/k[- ]?pop/.test(st)) toneHint = 'use catchy K-pop phrasing, easy singalong hooks, some light English loanwords allowed if natural.';
    else if (/trap|drill|rap/.test(st)) toneHint = 'use expressive attitude, internal rhymes and punchy imagery typical for rap.';
    const isLyrical = /lírikus|poetic|ballad|ballada|romantik/.test(st);
    const isPopRockMusical = /pop|rock|musical/.test(st);
    const chorusHint = (isLyrical || isPopRockMusical || isKidSong)
      ? 'Chorus should be 2–4 short, memorable lines with one clear hook (do not over-explain).'
      : 'Keep chorus concise and catchy.';
    const rhymeHint = isKidSong
      ? 'Use very simple AABB end-rhymes in verses (or ABAB if more natural).'
      : (isLyrical || isPopRockMusical)
        ? 'Use clear end-rhymes (ABAB/ABCB) in verses; chorus may use AAXA or AAAA, but stay natural.'
        : 'Gentle end-rhymes are preferred; never force nonsense.';

    const pronunciationSafety =
      "Avoid Hungarian words that AI models sometimes mispronounce when sung (e.g. 'oson', 'mélybe', 'elcsendesült', 'céges', 'üdvözlet', 'hajnali', 'zengjen'). These are NOT banned; only use them if they fit perfectly and pronounce clearly in context.";
    const awkwardHU = [
      'örök éltet','közös dal','minden út nyitva áll','szívünk mindig szabad',
      'él a szó','örök zene','út nyitva áll','szívünkben él a nagy remény','mánusz'
    ];
    const awkwardNote = 'Avoid unidiomatic or cliched Hungarian phrases such as: ' + awkwardHU.join(', ') + '. Prefer natural alternatives like: "örökké szeretlek", "közös történetünk", "nyitva a világ", "szívünk szabadon dobban".';

    // GPT #1
    const sys1 = [
      'You write song lyrics in the requested language and also output an ENGLISH style descriptor (style_en) for a music model.',
      "Write lyrics that MATCH the client's chosen musical style in rhythm and tone.",
      'LANGUAGE LOCK: write the lyrics STRICTLY in ' + language + ' (no mixing).',
      'Do NOT invent or coin nonsense words; only real, idiomatic words.',
      (isKidSong ? 'KID MODE: very simple vocabulary, present tense, 3–6 words per line, AABB rhymes in verses, 2–4 line catchy hook in Chorus, include onomatopoeia (e.g., la la, clap clap) and movement cues.' : ''),
      'Rhythm rule: ' + rhythmHint,
      'Tone rule: ' + toneHint,
      'Rhyme rule: ' + rhymeHint,
      'Chorus rule: ' + chorusHint,
      'Coherence rule: build a clear narrative arc as per brief. In each verse, lines must connect by a shared image/topic (no filler lines).',
      'Personal names found: ' + (names.join(', ') || '(none)') + ' — personal names MUST appear verbatim at least once; if exactly one name is present and this is a proposal theme, include it in the Chorus.',
      (isProposal ? 'Proposal rule: Chorus MUST contain a direct poetic question using typographic quotes and a question mark addressing the partner by name.' : ''),
      (/^(hu|hungarian|magyar)$/.test(String(language||'hu').toLowerCase()) ? pronunciationSafety : ''),
      (/^(hu|hungarian|magyar)$/.test(String(language||'hu').toLowerCase()) ? awkwardNote : ''),
      'MANDATORY: Naturally include ALL of these keywords verbatim at least once if present: ' + (mandatoryKeywords.length ? mandatoryKeywords.join(', ') : '(no mandatory keywords)'),
      'Use typographic quotes if quotes appear.',
      'Return STRICT JSON ONLY: {"lyrics_draft":"...","style_en":"..."}',
      'STRUCTURE: Verse 1 (4) / Verse 2 (4) / Chorus (2–4) / Verse 3 (4) / Verse 4 (4) / Chorus (2–4).',
      "Do NOT override already-English genre tags (e.g., 'minimal techno', 'house', 'pop').",
      "If vocal is male/female/instrumental, append that as 'male vocals'/'female vocals' or omit for instrumental.",
      'All numerals must be fully spelled out in words (no digits).'
    ].filter(Boolean).join('\n');

    const usr1 = [
      'Mandatory keywords: ' + mandatoryKeywords.join(', '),
      'Language for lyrics: ' + language,
      'Title: ' + title,
      'Client styles (primary, do NOT override): ' + styles,
      'Vocal: ' + vocal,
      'Brief (secondary only): ' + brief
    ].join('\n');

    const oi1 = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages:[{role:'system', content: sys1},{role:'user', content: usr1}],
        temperature:0.7,
        response_format:{ type:'json_object' },
        max_tokens: 800
      })
    });
    if(!oi1.ok){
      const t = await oi1.text();
      return res.status(502).json({ ok:false, message:'OpenAI error', detail:t });
    }
    const j1 = await oi1.json();
    let payload = {};
    try { payload = JSON.parse(j1?.choices?.[0]?.message?.content || '{}'); } catch {}
    let lyricsDraft = (payload.lyrics_draft || payload.lyrics || '').trim();
    let gptStyle = (payload.style_en || '').trim();

    // finalize style
    function buildStyleEN(client, vocalNorm, styleEN){
      const protectedGenres = new Set([
        'minimal techno','pop','rock','house','techno','trance','drum and bass','dnb','hip hop','hip-hop',
        'r&b','rnb','soul','funk','jazz','blues','edm','electronic','ambient','lo-fi','lofi','metal','punk',
        'indie','folk','country','reggaeton','reggae','synthwave','vaporwave','trap','drill','hardstyle',
        'progressive house','deep house','electro house','future bass','dubstep','garage','uk garage','breakbeat','phonk','k-pop','kpop'
      ]);
      const base = (styleEN||'').toLowerCase().split(/[,\|\/]+/).map(s=>s.trim()).filter(Boolean);
      const cli  = (client||'').toLowerCase().split(/[,\|\/]+/).map(s=>s.trim()).filter(Boolean);
      const out = []; const seen = new Set();
      for(const g of cli){ if (protectedGenres.has(g) && !seen.has(g)){ out.push(g); seen.add(g); } }
      let addedMood = 0;
      for(const tag of base){
        if (!protectedGenres.has(tag) && !seen.has(tag) && addedMood < 2){ out.push(tag); seen.add(tag); addedMood++; }
      }
      const vt = (vocalNorm==='male') ? 'male vocals' : (vocalNorm==='female') ? 'female vocals' : '';
      if (vt && !seen.has(vt)) out.push(vt);
      return out.join(', ');
    }
    const styleFinal = buildStyleEN(styles, vocal, gptStyle);

    // GPT #2 refine
    const sys2 = [
      'You are a native lyric editor in the target language.',
      'Keep EXACT section headings (Verse 1/Verse 2/Chorus/Verse 3/Verse 4/Chorus).',
      'LANGUAGE LOCK: ensure the entire text is in ' + language + '.',
      'Remove invented/non-words; replace with natural, idiomatic alternatives.',
      (isKidSong ? 'KID MODE ENFORCE: simplify phrasing, fix subject-verb agreement, AABB rhyme in verses, 2–4 line Chorus with a memorable hook and playful repetition.' : ''),
      'Enforce rhythm rule: ' + rhythmHint,
      'Enforce tone rule: ' + toneHint,
      'Apply: ' + rhymeHint,
      'Apply: ' + chorusHint,
      'Ensure narrative coherence: connect images across lines in each verse (no generic filler).',
      'Names: ' + (names.join(', ') || '(none)') + ' MUST remain.',
      (isProposal ? 'Chorus must ask the partner directly by name with typographic quotes and a question mark.' : ''),
      (/^(hu|hungarian|magyar)$/.test(String(language||'hu').toLowerCase()) ? pronunciationSafety : ''),
      (/^(hu|hungarian|magyar)$/.test(String(language||'hu').toLowerCase()) ? awkwardNote : ''),
      'Prefer gentle end-rhymes but NEVER force nonsense.',
      'All numerals must be words (no digits).',
      'Use typographic quotes if quotes appear.',
      'Output ONLY the final lyrics.'
    ].filter(Boolean).join('\n');

    const usr2 = 'Language: ' + language + '\nTitle: ' + title + '\nStyles: ' + styles + '\nVocal: ' + vocal + '\n\n' + lyricsDraft;

    let oi2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages:[{role:'system', content: sys2},{role:'user', content: usr2}],
        temperature:0.6,
        max_tokens: 900
      })
    });
    let lyrics = lyricsDraft;
    if (oi2.ok){
      const j2 = await oi2.json();
      lyrics = (j2?.choices?.[0]?.message?.content || lyricsDraft).trim();
    }

    // HU polish (if HU)
    {
      const lang = String(language || 'hu').toLowerCase();
      if (/^(hu|hungarian|magyar)$/.test(lang)) {
        try {
          lyrics = await polishHungarianLyrics({ OPENAI_API_KEY, OPENAI_MODEL, lyrics, mandatoryKeywords });
        } catch (e) { console.warn('[HU_POLISH_FAIL]', e?.message || e); }
      }
    }

    // listy fix
    try { lyrics = await rewriteKeywordListOpeners({ OPENAI_API_KEY, OPENAI_MODEL, lyrics }); }
    catch(e){ console.warn('[LISTY_FIX_FAIL]', e?.message || e); }

    // PRE-ENFORCE: strip Hungarian name case endings for non-HU targets
    {
      const lang = String(language || "hu").toLowerCase();
      const isHU = /^(hu|hungarian|magyar)$/.test(lang);
      if (!isHU) {
        lyrics = lyrics.replace(/\b([A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű\-']+?)(?:nak|nek|val|vel|ba|be|ban|ben|ra|re|ról|ről|hoz|hez|höz|tól|től|nál|nél)\b/g, "$1");
      }
    }

    // target language enforce (non-HU only)
    try {
      const lang = String(language || 'hu').toLowerCase();
      const isHU = /^(hu|hungarian|magyar)$/.test(lang);
      if (!isHU) {
        lyrics = await enforceTargetLanguage({ OPENAI_API_KEY, OPENAI_MODEL, lyrics, language, names, mandatoryKeywords });
      }
    } catch(e) { console.warn('[LANG_ENFORCE_FAIL]', e?.message || e); }

    // POST-ENFORCE CLEANUP FOR NON-HU TARGETS
    {
      const lang = String(language || 'hu').toLowerCase();
      const isHU = /^(hu|hungarian|magyar)$/.test(lang);
      if (!isHU) {
        lyrics = lyrics.replace(/(^|\n)\s*(céges|évzáró)(\s*\d+)?\s*$(?=\n|$)/gim, '$1');
        lyrics = lyrics.replace(/([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű])(\d+)/g, '$1 $2');
        lyrics = lyrics.replace(/\n{3,}/g, '\n\n').trim();
        lyrics = lyrics.replace(/\b[Cc][eé]ges\b/g, 'corporate'); // extra safety
      }
    }

    // ******** ENSURE mandatory keywords appear (numbers too) ********
    try{
      const missing = (mandatoryKeywords||[]).filter(k => !new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(lyrics));
      if (missing.length){
        const sysK = [
          "Insert the following keywords verbatim at least once into the lyrics.",
          "Make MINIMAL edits only. Preserve rhyme, rhythm, line count, and all section headings.",
          "Return the full lyrics."
        ].join("\n");
        const usrK = 'Missing keywords: ' + missing.join(', ') + '\n\n' + lyrics;
        const oiK = await fetch('https://api.openai.com/v1/chat/completions', {
          method:'POST',
          headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages:[{role:'system', content: sysK},{role:'user', content: usrK}],
            temperature:0.3,
            max_tokens: 800
          })
        });
        if (oiK.ok){
          const jK = await oiK.json();
          lyrics = (jK?.choices?.[0]?.message?.content || lyrics).trim();
        }
      }
    }catch(e){ console.warn('[KW_ENSURE_FAIL]', e?.message || e); }

    // ===== NOW convert numerals to words (AFTER ensure) =====
    {
      const lang = String(language || 'hu').toLowerCase();
      if (/^(hu|hungarian|magyar)$/.test(lang)) {
        lyrics = normalizeNumbersHU(lyrics);
      } else if (/\d/.test(lyrics)) {
        const sysNum = [
          "Rewrite ALL numerals as fully spelled-out words in the requested language.",
          "Keep section headings and line counts. No digits.",
          "Return the full lyrics."
        ].join("\n");
        const numR = await fetch('https://api.openai.com/v1/chat/completions', {
          method:'POST',
          headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages:[{role:'system', content: sysNum},{role:'user', content: lyrics}],
            temperature:0.0,
            max_tokens: 750
          })
        });
        if (numR.ok) {
          const jn = await numR.json();
          lyrics = (jn?.choices?.[0]?.message?.content || lyrics).trim();
        }
      }
    }

    // HU soft filter (only HU)
    {
      const lang = String(language || 'hu').toLowerCase();
      if (/^(hu|hungarian|magyar)$/.test(lang)) lyrics = softHungarianAwkwardFilter(lyrics);
    }

    // Suno call
    lyrics = applySafeMorphHU(lyrics, { language });
    lyrics = applyRefrainAlt(lyrics);
lyrics = applyFinalTinyFixesHU(lyrics, { language });
lyrics = normalizeSectionHeadingsSafe(lyrics);
lyrics = ensureTechnoStoryBits(lyrics, { styles, brief, language });


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
      return res.status(502).json({ ok:false, message:'Suno start error', detail:startRes.text, status:startRes.status });
    }
    const sj = startRes.json;
    if (!sj || sj.code !== 200 || !sj.data || !sj.data.taskId) {
      return res.status(502).json({ ok:false, message:'Suno start error – bad response', detail: JSON.stringify(sj) });
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
      tracks = items
        .map(d => ({
          title: d.title || title,
          audio_url: d.audioUrl || d.url,
          image_url: d.imageUrl || d.coverUrl
        }))
        .filter(x => !!x.audio_url)
        .slice(0, 2);
    }
    if (!tracks.length) return res.status(502).json({ ok:false, message:'Suno did not return tracks in time.' });
try {
  const link1 = tracks[0]?.audio_url || '';
  const link2 = tracks[1]?.audio_url || '';
  await safeAppendOrderRow({ email: req.body.email || '', styles, vocal, language, brief, lyrics, link1, link2 , format });
} catch (_e) { /* handled */ }

    
  try {
    const _theme = detectTheme(typeof brief !== 'undefined' ? brief : '', typeof styles !== 'undefined' ? styles : '');
    const _genre = detectGenre(typeof styles !== 'undefined' ? styles : '');
    const _lang  = String((typeof language !== 'undefined' ? language : 'hu')).toLowerCase();
    if (/^(hu|hungarian|magyar)$/.test(_lang) && typeof lyrics === 'string') {
      lyrics = postProcessHU(lyrics, { theme: _theme, genre: _genre, brief: (typeof brief !== 'undefined' ? brief : '') });
    }
  } catch(e) {
    console.warn('[POSTPROCESS] HU clean skipped:', e?.message || e);
  }

try { lyrics = fixHungarianGrammar(lyrics); } catch(_) {}
return res.json({ ok:true, lyrics, style: styleFinal, tracks });
  } catch (e) {
    console.error('[generate_song]', e);
    return res.status(500).json({ ok:false, message:'Hiba történt', error: (e && e.message) || e });
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
    const r1 = await 
    // === Non-MP3 branch: skip Suno completely, only log to Google Sheet ===
    if (!isMP3) {
      try {
        await safeAppendOrderRow({
          email: req.body.email || '',
          styles, vocal, language, brief, lyrics,
          link1: '', link2: '', format
        });
      } catch (_e) { /* ignore */ }
      return res.json({ ok:true, lyrics, style: styleFinal, tracks: [], format });
    }
fetch(`${BASE}/api/v1/generate`, { method:'POST', headers:H, body: JSON.stringify({ invalid:true }) });
    const t1 = await r1.text();
    return res.json({ ok:true, base: BASE, post_generate: { status:r1.status, len:t1.length, head:t1.slice(0,160) } });
  }catch(e){
    return res.status(500).json({ ok:false, error: (e && e.message) || e });
  }
});

/* ================== Start server ========================== */
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));



/* ======== SAFE MORPH & REFRAIN ALT (non-destructive) ======== */
function applySafeMorphHU(text, opts){
  try{
    const lang = String(opts?.language||'hu').toLowerCase();
    if (!/^(hu|hungarian|magyar)$/.test(lang)) return text;
    let t = String(text||'');
    t = t.replace(/\bszívele\b/gi, "szívével");
    t = t.replace(/\bragyogzik\b/gi, "ragyog");
    t = t.replace(/\bcsillogzik\b/gi, "csillog");
    t = t.replace(/\bnevessz\b/gi, "nevess");
    t = t.replace(/\bvel\.\s*$/gmi, "velünk.");
    t = t.replace(/\bvel,\s*$/gmi, "velünk,");
    t = t.replace(/\bjó a vég\b/gi, "jó a játék");
    t = t.replace(/\bél a dal\b/gi, "száll a dal");
    t = t.replace(/\bél a fény\b/gi, "ragyog a fény");
    return t;
  }catch(_e){ return text; }
}

function applyRefrainAlt(text){
  try{
    const rx = /(Verse\s+[1-4]|Chorus)\s*\n([\s\S]*?)(?=\n\s*(Verse\s+[1-4]|Chorus)\s*\n|$)/gi;
    const sections = [];
    let m;
    while ((m = rx.exec(text))){
      sections.push({ head: m[1], body: m[2] });
    }
    if (!sections.length) return text;

    let chorusCount = 0;
    const out = [];
    for (const s of sections){
      if (/^Chorus$/i.test(s.head.trim())){
        chorusCount += 1;
        if (chorusCount >= 2){
          const lines = s.body.split("\n");
          const mapped = lines.map((ln, idx) => {
            let L = ln;
            if (idx % 2 === 0){
              L = L.replace(/\börökké\b/gi, "mindig")
                   .replace(/\bragyog\b/gi, "fénylik")
                   .replace(/\bkérlek hát\b/gi, "szívem vár");
            } else {
              L = L.replace(/\bmindig\b/gi, "örökké")
                   .replace(/\bfénylik\b/gi, "ragyog")
                   .replace(/\bválaszolj\b/gi, "felelj");
            }
            return L.replace(/[ \t]+/g, " ").trimEnd();
          });
          out.push(s.head + "\n" + mapped.join("\n") + "\n");
          continue;
        }
      }
      out.push(s.head + "\n" + s.body + "\n");
    }
    return out.join("");
  }catch(_e){ return text; }
}
/* ======== /SAFE MORPH & REFRAIN ALT ======== */


/* === FINAL MICRO PATCHES (safe, append-only) ==================== */
/* 1) HU tiny tail fixes to avoid clipped suffixes on line ends */
function applyFinalTinyFixesHU(lyrics, { language } = {}) {
  try {
    const lang = String(language || 'hu').toLowerCase();
    if (!/^(hu|hungarian|magyar)$/.test(lang)) return lyrics;
    let t = String(lyrics || '');

    // 1/a) 'szívemben őrzöm az édes ígéret' (line end) → '... ígéretet'
    t = t.replace(/szívemben őrzöm az édes ígéret\s*$/gmi, 'szívemben őrzöm az édes ígéretet');

    // 1/b) line-end ' vel' (or with punctuation) → ' velünk'
    t = t.replace(/(\s)vel(\s*([.!?,…]))?\s*$/gmi, function(_m, sp, _tail, punc){ return sp + 'velünk' + (punc || ''); });

    return t;
  } catch (_e) { return lyrics; }
}

/* 2) Section headings: HU → EN and wrap into parentheses so singers don't read them aloud */
function normalizeSectionHeadingsSafe(text) {
  try {
    let t = String(text || '');

    // Map Hungarian headings to English on their own lines
    const rules = [
      [/^\s*Verse\s*egy\s*:?\s*$/gmi,   'Verse 1'],
      [/^\s*Verse\s*kettő\s*:?\s*$/gmi, 'Verse 2'],
      [/^\s*Verse\s*ketto\s*:?\s*$/gmi, 'Verse 2'],
      [/^\s*Verse\s*három\s*:?\s*$/gmi, 'Verse 3'],
      [/^\s*Verse\s*harom\s*:?\s*$/gmi, 'Verse 3'],
      [/^\s*Verse\s*négy\s*:?\s*$/gmi,  'Verse 4'],
      [/^\s*Verse\s*negy\s*:?\s*$/gmi,  'Verse 4'],
      [/^\s*Verze\s*1\s*:?\s*$/gmi,     'Verse 1'],
      [/^\s*Verze\s*2\s*:?\s*$/gmi,     'Verse 2'],
      [/^\s*Verze\s*3\s*:?\s*$/gmi,     'Verse 3'],
      [/^\s*Verze\s*4\s*:?\s*$/gmi,     'Verse 4'],
      [/^\s*Refr[eé]n\s*:?\s*$/gmi,     'Chorus'],
      [/^\s*H[ií]d\s*:?\s*$/gmi,        'Bridge'],
      [/^\s*Verse\s*0*([1-4])\s*:?\s*$/gmi, function(_m, d){ return `Verse ${d}`; }],
      [/^\s*Chorus\s*:?\s*$/gmi,        'Chorus'],
      [/^\s*Bridge\s*:?\s*$/gmi,        'Bridge']
    ];
    for (const [rx, to] of rules) t = t.replace(rx, to);

    // Wrap headings in parentheses – apply to all styles and all songs
    t = t.replace(/^\s*(Verse\s+[1-4]|Chorus|Bridge)\s*$/gmi, function(_m, h){ return `(${h})`; });

    return t;
  } catch (_e) { return text; }
}
/* === END FINAL MICRO PATCHES ==================================== */
/* === TECH/HOUSE CONTENT NUDGE (ultra-safe) ===================== */
/* Csak techno/minimal/house esetén: ha a leírás kulcs-elemei
   (helyek/értékek) hiányoznak a szövegből, a VÉGÉRE beteszünk
   egy rövid (Break) blokkot a hiányzó kulcsszavakkal.
   Nem módosítjuk a meglévő versszakokat.                        */
function ensureTechnoStoryBits(lyrics, { styles = '', brief = '', language = '' } = {}) {
  try {
    const isTech = /(minimal\s*techno|techno|house)/i.test(String(styles));
    if (!isTech) return lyrics;

    let t = String(lyrics || '');
    // Ha már van Break, nem bántjuk
    if (/^\s*\(Break\)\s*$/mi.test(t)) return t;

    const b = (brief || '').toLowerCase();
    const must = [];
    const need = (cond, tok) => { if (cond && !new RegExp('\\b' + tok + '\\b', 'i').test(t)) must.push(tok); };

    // Nevek/helyek/motívumok a brief alapján
    need(/nóra/.test(b), 'Nóra');
    need(/pali/.test(b), 'Pali');
    need(/szardíni/.test(b), 'Szardínia');
    need(/portugáli/.test(b), 'Portugália');
    need(/túrá/.test(b), 'túrák');
    need(/goa/.test(b), 'goa');
    need(/kitartás/.test(b), 'kitartás');
    need(/logika/.test(b), 'logika');
    need(/barátság/.test(b), 'barátság');
    need(/újrakezd/.test(b), 'újrakezdés');
    // 100% → "száz százalék" (ha a briefben szerepel)
    need(/100\s*%|száz\s*százalék/.test(b), 'száz százalék');

    if (!must.length) return t;

    const lines = [];
    const take = (arr) => arr.splice(0, Math.min(4, arr.length)).join(', ');
    const pool = must.slice();
    while (pool.length) lines.push(take(pool));

    const breakBlock = '\n(Break)\n' + lines.join('\n') + '\n';
    return t.trimEnd() + breakBlock;
  } catch {
    return lyrics;
  }
}
/* === /TECH/HOUSE CONTENT NUDGE ================================= */

