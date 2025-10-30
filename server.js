// ESM server.js – FINAL (stable, prompt-based polish active)
// - Kód szintű polish függvények eltávolítva
// - Prompt-szintű polish (sys2, sys3) aktív maradt

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { appendOrderRow, safeAppendOrderRow } from './sheetsLogger.js';

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

    let { title = '', styles = '', vocal = 'instrumental', language = 'hu', brief = '' } = req.body || {};

    // Map package/format
    const pkg = (req.body && (req.body.package||req.body.format)) ? String((req.body.package||req.body.format)).toLowerCase() : 'basic';
    const format = pkg==='basic' ? 'mp3' : (pkg==='video' ? 'mp4' : pkg==='premium' ? 'wav' : pkg);
    const isMP3 = (format === 'mp3');

    // Vocal normalizálás (csak Suno style taghez)
    const v = (vocal || '').toString().trim().toLowerCase();
    if (/^női|female/.test(v)) vocal = 'female';
    else if (/^férfi|male/.test(v)) vocal = 'male';
    else if (/instrument/.test(v)) vocal = 'instrumental';
    else vocal = (v || 'instrumental');

    // ENV
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const SUNO_API_KEY   = process.env.SUNO_API_KEY;
    const SUNO_BASE_URL  = (process.env.SUNO_BASE_URL || '').replace(/\/+$/,'');
    const PUBLIC_URL     = (process.env.PUBLIC_URL || '').replace(/\/+$/,'');

    if (!OPENAI_API_KEY) return res.status(500).json({ ok:false, message:'OPENAI_API_KEY hiányzik' });
    if (!SUNO_API_KEY)   return res.status(500).json({ ok:false, message:'Suno API key hiányzik' });
    if (!SUNO_BASE_URL)  return res.status(500).json({ ok:false, message:'SUNO_BASE_URL hiányzik' });

    // Idempotencia
    const key = makeKey({ title, styles, vocal, language, brief });
    const now = Date.now();
    const last = activeStarts.get(key) || 0;
    if (now - last < 20000) return res.status(202).json({ ok:true, message:'Már folyamatban van egy azonos kérés.' });
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
special rules: ${profile.universalRules.enforceVariation ? 'változatos, logikus képek' : ''}
`;

// GPT rendszer prompt (megtartva a JSON formátumot)
const sys1 = [
  'You are a professional lyric writer AI. You generate complete, structured Hungarian song lyrics strictly following the requested style and theme.',
  'Follow the given style profile below when creating rhythm, emotion, tone, and vocabulary.',
  'LANGUAGE LOCK: write the lyrics STRICTLY in ' + language + ' (no mixing).',
  'STRUCTURE IS MANDATORY: the song must include these section titles exactly as shown:',
  '(Verse 1)',
  '(Verse 2)',
  '(Chorus)',
  '(Verse 3)',
  '(Verse 4)',
  '(Chorus)',
  'Each verse and chorus must have exactly 4 lines.',
  'OUTPUT: Return only the clean lyrics text with proper section titles and line breaks (no JSON, no markdown, no explanations).',
  'Include and respect all style hints: ' + styles + '.'
].join('\n');

const sys2 = [
  '=== UNIVERSAL STYLE ENFORCEMENT RULES (Natural flow + min word limit) ===',
  '- For POP songs: each line should contain at least 8 words, focusing on emotion, melody, and natural phrasing.',
  '- For ROCK songs: each line should contain at least 8 words, with energetic and expressive rhythm.',
  '- For ELECTRONIC / TECHNO songs: each line should contain at least 6 words, rhythmic and atmospheric, prioritizing imagery over story.',
  '- For ACOUSTIC / BALLAD songs: each line should contain at least 7 words, gentle and poetic, with flowing phrasing.',
  '- For RAP songs: each line should contain at least 10 words, maintaining natural flow, rhyme, and coherent meaning (no fillers).',
  '- For CHILD songs: each line should contain at least 5 words; in the Chorus include 1–2 playful onomatopoeias (e.g., "la-la", "taps-taps", "bumm-bumm"), used rhythmically.',
  '- For WEDDING or ROMANTIC songs: each line should contain at least 8 words; include at least one natural metaphor (sunset, sea, stars, light, breeze) connecting to love or unity.',
  '- For FUNERAL songs: each line should contain at least 7 words; tone must remain calm, serene, full of gratitude and light. Avoid slang and harsh rhythms.',
  '- For BIRTHDAY songs: each line should contain at least 7 words; the person’s name must appear naturally in every Chorus; keep rhythm joyful and positive.',
  '- UNIVERSAL RULES: vary sentence beginnings, ensure meaningful continuity, avoid nonsense or mixed metaphors, preserve natural Hungarian rhythm and vowel harmony, and ensure the final Chorus repeats identically at the end.',
  '- IMPORTANT: onomatopoeia elements (like "la-la", "taps-taps", "bumm-bumm") are allowed ONLY when style = child.',
  '- APPLY ONLY ONE STYLE RULESET matching the most dominant genre from the client styles.',
  '- If multiple genres are listed (e.g. "minimal techno, house, trance"), choose the one that best fits the rhythm and tone, and apply its minimum word rule consistently to all verses and choruses.'
].join('\n');

const sys3 = [
  '=== HUNGARIAN LANGUAGE POLISH & COHERENCE RULES ===',
  '- Write the entire song in natural, grammatically correct Hungarian.',
  '- Every line must form a full, meaningful sentence — avoid fragments or disconnected phrases.',
  '- Ensure logical flow between lines; verses and choruses must connect coherently.',
  '- Use proper Hungarian suffixes and vowel harmony (no "-ban/-ben" mismatches).',
  '- Remove unnecessary spaces or blank lines.',
  '- Avoid double punctuation or repeated words (e.g., "fény fény" → "fény").',
  '- Capitalize the first letter of each line.',
  '- Use correct and natural conjugations (e.g., "szeretet érzem" → "szeretetet érzek", "vágy érzem" → "vágyat érzek").',
  '- Replace incorrect or awkward expressions with fluent, native Hungarian equivalents.',
  '- Convert any numeric digits to written Hungarian words (e.g., 10 → tíz, 2024 → kétezer-huszonnégy).',
  '- Exclude numbers from section headings (Verse, Chorus).',
  '- Keep poetic rhythm consistent with the style, but always semantically correct.',
  '- If style = wedding/romantic, include logical, coherent metaphors (e.g., naplemente, tenger, csillag, fény, szellő). Avoid random or nonsense imagery.',
  '- If style = funeral, use gentle and calm tone, gratitude and peace — no harsh or absurd images.',
  '- Maintain smooth rhyme and rhythm (AABB or ABAB patterns when natural).',
  '- Avoid meaningless repetition or filler words.',
  '- Ensure tense consistency (past/present forms should not randomly change).',
  '- Use rich, expressive but realistic imagery; avoid mixed or unrelated metaphors.',
  '- Avoid invented or non-existent Hungarian words.',
  '- All numeric or temporal expressions (years, ages) must be written in full words.',
  '- Final chorus must repeat identically at the end.',
  '- The song must feel cohesive, fluent and emotionally expressive — never robotic or literal.'
].join('\n');
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
const sysPrompt = [sys1, sys2, sys3].join('\n\n');

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
      return res.status(502).json({ ok:false, message:'OpenAI error', detail:t });
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

// replace all numbers (1–9999) except those following "Verse" or "Chorus"
lyrics = lyrics.replace(/(?<!Verse\s|Chorus\s)\b\d{1,4}\b/g, n => numToHungarian(parseInt(n, 10)));

// --- UNIVERSAL NORMALIZE GENRES (HU → EN) ---
function normalizeGenre(g) {
  if (!g) return '';
  return g.toLowerCase()
    .replace(/\bmagyar népdal\b/g, 'hungarian folk')
    .replace(/\bnépdal\b/g, 'folk')
    .replace(/\bpop(zene)?\b/g, 'pop')
    .replace(/\brock(zene)?\b/g, 'rock')
    .replace(/\bmet[aá]l\b/g, 'metal')
    .replace(/\bdiszk[oó]\b/g, 'disco')
    .replace(/\btechno\b/g, 'techno')
    .replace(/\bhouse\b/g, 'house')
    .replace(/\btrance\b/g, 'trance')
    .replace(/\bgoa\b/g, 'goa')
    .replace(/\bdnb\b/g, 'drum and bass')
    .replace(/\bdrum(?!mer)\b/g, 'drum and bass')
    .replace(/\brap(p)?\b/g, 'rap')
    .replace(/\bhip[\s-]?hop\b/g, 'hip hop')
    .replace(/\br[&\s]?b\b/g, 'r&b')
    .replace(/\bblues\b/g, 'blues')
    .replace(/\bjazz\b/g, 'jazz')
    .replace(/\breggae\b/g, 'reggae')
    .replace(/\bklasszikus(zene)?\b/g, 'classical')
    .replace(/\bkomolyzene\b/g, 'classical')
    .replace(/\bzongora\b/g, 'piano')
    .replace(/\bheged[űu]\b/g, 'violin')
    .replace(/\bgit[aá]r\b/g, 'guitar')
    .replace(/\bdob(ok)?\b/g, 'drum')
    .replace(/\bfuvola\b/g, 'flute')
    .replace(/\bcsell[oó]\b/g, 'cello')
    .replace(/\bmelankolikus\b/g, 'melancholic')
    .replace(/\bérzelmes\b/g, 'emotional')
    .replace(/\bkölt[oő]i\b/g, 'poetic')
    .replace(/\bromantikus\b/g, 'romantic')
    .replace(/\bvid[aá]m\b/g, 'happy')
    .replace(/\bszomor[úu]\b/g, 'sad')
    .replace(/\blass[uú]\b/g, 'slow')
    .replace(/\bgyors\b/g, 'fast')
    .replace(/\bhangszeres\b/g, 'instrumental')
    .replace(/\bvok[aá]l(os)?\b/g, 'vocal')
    .replace(/\bt[áa]nczene\b/g, 'dance')
    .replace(/\belektronikus(zene)?\b/g, 'electronic')
    .replace(/\bambient\b/g, 'ambient')
    .replace(/\bfilmzene\b/g, 'soundtrack')
    .replace(/\bszintetiz[aá]tor\b/g, 'synth')
    .replace(/\bfolklo[ó]r\b/g, 'folk')
    .replace(/\s+/g, ' ')
    .trim();
}

    // Végső stílus Suno-hoz: védd a kliens által kért műfajokat + vokál tag
    function buildStyleEN(client, vocalNorm, styleEN){
      const protectedGenres = new Set([
  'rap','hip hop','hip-hop','folk','violin','piano',
  'minimal techno','pop','rock','house','techno','trance','drum and bass',
  'r&b','rnb','soul','funk','jazz','blues','edm','electronic','ambient',
  'lo-fi','lofi','metal','punk','indie','country','reggaeton','reggae',
  'synthwave','vaporwave','trap','drill','hardstyle','progressive house',
  'deep house','electro house','future bass','dubstep','garage',
  'uk garage','breakbeat','phonk','k-pop','kpop','modern pop','emotional',
  'poetic','drum','cello','flute','hungarian folk','guitar'
]);

    const base = (styleEN||'').split(/[,\|\/]+/).map(s => normalizeGenre(s)).filter(Boolean);
    const cli  = (client||'').split(/[,\|\/]+/).map(s => normalizeGenre(s)).filter(Boolean);

      const out = []; const seen = new Set();
      for(const g of cli){ if (protectedGenres.has(g) && !seen.has(g)){ out.push(g); seen.add(g); } }
      let addedMood = 0;
      for(const tag of base){
        if (!protectedGenres.has(tag) && !seen.has(tag) && addedMood < 2){ out.push(tag); seen.add(tag); addedMood++; }
      }
      let vt = '';
      switch (String(vocalNorm||'').toLowerCase()){
        case 'male': vt = 'male vocals'; break;
        case 'female': vt = 'female vocals'; break;
        case 'duet': vt = 'male and female vocals'; break;
        case 'child': vt = 'child vocal'; break;
        case 'robot': vt = 'synthetic/robotic female vocal (vocoder, AI-like, crystal)'; break;
        default: vt = '';
      }
      if (vt && !seen.has(vt)) out.push(vt);
      return out.join(', ');
    }
    const styleFinal = buildStyleEN(styles, vocal, gptStyle);
    function normalizeSectionHeadingsSafeStrict(text) {
  if (!text) return text;
  let t = String(text);

  // 1) Magyar → angol alapformák (még zárójel nélkül)
  t = t.replace(/^\s*\(?\s*(Vers|Verze)\s*0*([1-4])\s*\)?\s*:?\s*$/gmi, (_m, _v, n) => `Verse ${n}`);
  t = t.replace(/^\s*\(?\s*Refr[eé]n\s*\)?\s*:?\s*$/gmi, 'Chorus');

  // 2) MINDEN NEM KELLŐ SZAKASZCÍM (Bridge/Híd/Intro/Outro/Interlude) TÖRLÉSE
  t = t.replace(/^\s*\(?\s*(H[ií]d|Bridge|Intro|Outro|Interlude)\s*\)?\s*:?\s*$/gmi, '');

  // 3) Angol címsorok normalizálása és zárójelezése
  t = t.replace(/^\s*(?:\(\s*)?(Verse\s+[1-4]|Chorus)(?:\s*\))?\s*:?\s*$/gmi, (_m, h) => `(${h})`);

  return t.trim();
}


    // Ha nem MP3: nincs Suno, csak Sheets + visszaadás
    if (!isMP3) {
      try {
        await safeAppendOrderRow({
          email: req.body.email || '',
          styles, vocal, language, brief, lyrics,
          link1: '', link2: '', format
        });
      } catch (_e) {
        console.warn('[SHEETS_WRITE_ONLY_MODE_FAIL]', _e?.message || _e);
      }
      lyrics = normalizeSectionHeadingsSafeStrict(lyrics);

      return res.json({ ok: true, lyrics, style: styleFinal, tracks: [], format });
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

    if (!tracks.length) return res.status(502).json({ ok:false, message:'Suno did not return tracks in time.' });

    try {
      const link1 = tracks[0]?.audio_url || '';
      const link2 = tracks[1]?.audio_url || '';
      await safeAppendOrderRow({ email: req.body.email || '', styles, vocal, language, brief, lyrics, link1, link2, format });
    } catch (_e) { /* log only */ }

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
// === STYLE PROFILE DECISION ENGINE (6 fő zenei stílus + 4 tematikus blokk) ===
function determineStyleProfile(styles = '', brief = '', vocal = '') {
  const s = (styles || '').toLowerCase();
  const b = (brief || '').toLowerCase();
  const v = (vocal || '').toLowerCase();

  // --- 1️⃣ Alap zenei stílus detektálása ---
  let baseStyle = 'pop';
  if (/(rock|punk|metal)/.test(s)) baseStyle = 'rock';
  else if (/(techno|trance|electro|house|edm|electronic|dnb|drum)/.test(s)) baseStyle = 'electronic';
  else if (/(acoustic|ballad|folk|guitar|piano|lírai|lassú)/.test(s)) baseStyle = 'acoustic';
  else if (/(rap|trap|hip.?hop)/.test(s)) baseStyle = 'rap';
  else if (/(none|null|unknown)/.test(s)) baseStyle = 'none';

  // --- 2️⃣ Tematikus blokk felismerése ---
  let theme = null;
  if (/(esküvő|lánykérés|valentin|jegyes|házasság)/.test(b)) theme = 'wedding';
  else if (/(temetés|búcsúztat|gyász|emlék|nyugodj|részvét|jobbulás)/.test(b)) theme = 'funeral';
  else if (/(gyerek|mese|ovis|humoros|vicces|nevetséges)/.test(b)) theme = 'child';
  else if (/(szülinap|születésnap|ünnep|party|ünneplés|boldog szülinap)/.test(b)) theme = 'birthday';

  // --- 3️⃣ Vocal finomítás (nem felülíró, csak stílusmódosító) ---
  let vocalMode = 'neutral';
  if (/male/.test(v)) vocalMode = 'male';
  else if (/female/.test(v)) vocalMode = 'female';
  else if (/duet/.test(v)) vocalMode = 'duet';
  else if (/child/.test(v)) vocalMode = 'child';
  else if (/robot|synthetic/.test(v)) vocalMode = 'robot';

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
      rhythm: { wordsPerLine: [6, 8], tempo: 'fast' },
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
      rhythm: { wordsPerLine: [6, 10], tempo: 'medium' },
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
        keywords: ['játszunk', 'taps', 'mosoly', 'napocska', 'dal'],
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
  profile.vocal = vocalMode;
  profile.priority = ['theme', 'style', 'vocal'];

  // Tematikus felülírás
  if (theme && themeMods[theme]) {
    const t = themeMods[theme];
    profile.tone = { ...profile.tone, ...t.tone };
    profile.words = { ...profile.words, ...t.words };
    profile.overrides = { ...t.overrides };
  }

  // Vocal finomhangolás – csak akkor vált child témára, ha mind a vokál, mind a brief gyerekes jellegű
if (vocalMode === 'child' && theme !== 'child' && /(gyerek|ovis|mese|ját|iskolás|szülinap|vidám)/.test(b)) {
  profile.theme = 'child';
  const t = themeMods.child;
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

  return profile;
}


/* ================== Start server ========================== */
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
