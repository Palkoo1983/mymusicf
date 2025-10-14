// ESM server.js – FULL PATCH
// Suno V1 (customMode + V5 + callBackUrl) + GPT JSON (lyrics + style_en)
// + Duplicate guard (idempotency) + 2-track cap
//
// Required envs (Render -> Environment):
// OPENAI_API_KEY=sk-...
// OPENAI_MODEL=gpt-4.1-mini
// SUNO_API_KEY=su-...
// SUNO_BASE_URL=https://api.sunoapi.org
// PUBLIC_URL=https://www.enzenem.hu
// (Mail/Stripe envs optional – keep your current ones)

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';
import Stripe from 'stripe';

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
  // small fast hash for dedupe (not crypto)
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

/* ================== GPT → Suno V1 generate =================
   OpenAI: JSON { lyrics, style_en } – lyrics in requested language,
   style_en in ENGLISH (+ male/female vocals if needed).
*/
app.post('/api/generate_song', async (req, res) => {
  const startedAt = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
  if (!rateLimit('gen:'+ip, 45000, 5)) return res.status(429).json({ok:false, message:'Túl sok kérés. Próbáld később.'});

  const body = req.body || {};

  // ---- DEDUPE: block same input for 25s
  const key = makeKey(body);
  const existing = activeStarts.get(key);
  if (existing && (startedAt - existing) < 25000){
    return res.status(202).json({ ok:false, duplicate:true, message:'Már folyamatban ugyanilyen kérés.' });
  }
  activeStarts.set(key, startedAt);
  setTimeout(() => { if (activeStarts.get(key) === startedAt) activeStarts.delete(key); }, 30000);

  try {
    const { title='', styles='', vocal='instrumental', language='hu', brief='' } = body;

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const SUNO_API_KEY   = process.env.SUNO_API_KEY;
    const SUNO_BASE_URL  = process.env.SUNO_BASE_URL || 'https://api.sunoapi.org';
    const PUBLIC_URL     = process.env.PUBLIC_URL || 'https://www.enzenem.hu';

    if (!OPENAI_API_KEY) return res.status(500).json({ ok:false, message:'OPENAI_API_KEY hiányzik' });
    if (!SUNO_API_KEY)   return res.status(500).json({ ok:false, message:'SUNO_API_KEY hiányzik' });

// ==== OpenAI – JSON (lyrics + style_en) STRICT 4V+2C + REFINE ====
// CÉL: 4 versszak + 2 refrén (V1,V2,Chorus,V3,V4,Chorus), koherens metaforák,
// és a style_en az ÜGYFÉL "zenei stílus" mezőjéből készüljön angolul (elsődlegesen).

// --------- 1) STYLE-FOCUSED JSON PASS (lyrics_draft + style_en) ----------
const sys1 =
  "You write singable song lyrics and produce an ENGLISH style descriptor for music generation. " +
  "Return STRICT JSON only. The lyrics must be natural and coherent in the requested language. " +
  "Metaphors allowed if coherent; avoid awkward/nonsensical lines. " +
  "STRUCTURE EXACTLY: Verse 1 (4 lines) / Verse 2 (4) / Chorus (4) / Verse 3 (4) / Verse 4 (4) / Chorus (4). " +
  "Each line 6–10 words, light punctuation. " +
  "For style_en: PRIORITIZE the client's CHOSEN MUSIC STYLE(S) exactly. Translate them to concise English genre tags. " +
  "Append 'male vocals' or 'female vocals' if applicable; if instrumental, omit vocals. " +
  "You MAY add up to 2 mood adjectives ONLY if they do not conflict with the chosen style. " +
  "Do NOT let the brief override the main style.";

const usr1 = [
  `Language for lyrics: ${language}`,   // HU → marad magyarul
  `Title: ${title}`,
  `Chosen music style(s) (client): ${styles}`,
  `Vocal: ${vocal} (male|female|instrumental)`,
  `Brief (secondary info): ${brief}`,
  "",
  "Return JSON ONLY in this exact shape:",
  `{"lyrics_draft":"...","style_en":"..."}`,
  "style_en must be concise English tags, comma-separated, e.g. 'pop, minimal techno, male vocals' or 'ambient piano'."
].join("\n");

const oi1 = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: OPENAI_MODEL,
    messages: [{ role: "system", content: sys1 }, { role: "user", content: usr1 }],
    temperature: 0.7,
    top_p: 0.9,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
    response_format: { type: "json_object" },
    max_tokens: 600
  })
});
if (!oi1.ok) {
  const t = await oi1.text();
  return res.status(502).json({ ok:false, message:"OpenAI error", detail:t });
}
const j1 = await oi1.json();
let payload = {};
try { payload = JSON.parse(j1?.choices?.[0]?.message?.content || "{}"); } catch {}
let lyricsDraft = (payload.lyrics_draft || payload.lyrics || "").trim();
let style_en = (payload.style_en || "").trim();

// Fallback style_en + vocals (biztonsági háló – de főként a styles mezőből!)
const vocalTag = (vocal === "male") ? "male vocals" : (vocal === "female") ? "female vocals" : "";
if (!style_en) {
  style_en = (styles || "pop").toString().trim();
  if (vocalTag) style_en += (style_en ? `, ${vocalTag}` : vocalTag);
}

// --------- 2) REFINE PASS (csak a dalszöveghez) ----------
const sys2 =
  "You are a native-speaker lyric editor. Fix awkward or nonsensical lines without changing meaning. " +
  "Metaphors allowed if coherent. Keep the requested language EXACTLY. " +
  "KEEP EXACT STRUCTURE: Verse 1 (4) / Verse 2 (4) / Chorus (4) / Verse 3 (4) / Verse 4 (4) / Chorus (4). " +
  "Each line 6–10 words. Output ONLY the final lyrics (no JSON, no extra commentary).";

const usr2 = [
  `Language: ${language}`,
  `Title: ${title}`,
  `Chosen style (must remain primary): ${styles}`,
  `Vocal: ${vocal}`,
  "",
  "DRAFT:",
  lyricsDraft
].join("\n");

const oi2 = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: OPENAI_MODEL,
    messages: [{ role: "system", content: sys2 }, { role: "user", content: usr2 }],
    temperature: 0.6,
    top_p: 0.9,
    max_tokens: 700
  })
});
let lyrics = lyricsDraft;
if (oi2.ok) {
  const j2 = await oi2.json();
  lyrics = (j2?.choices?.[0]?.message?.content || lyricsDraft).trim();
} else {
  console.warn("[REFINE FAIL] using draft");
}

// --------- 3) Minimális forma-ellenőrzés: 4V+2C fejlécek legyenek meg ----------
const needed = ["Verse 1","Verse 2","Chorus","Verse 3","Verse 4","Chorus"];
const hasAll = needed.every(h => lyrics.includes(h));
if (!hasAll) {
  const sys3 = "Format the provided lyrics to EXACTLY this heading order and counts WITHOUT changing wording: " +
               "Verse 1 (4 lines) / Verse 2 (4) / Chorus (4) / Verse 3 (4) / Verse 4 (4) / Chorus (4). " +
               "Output ONLY the formatted lyrics.";
  const oi3 = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "system", content: sys3 }, { role: "user", content: lyrics }],
      temperature: 0.0,
      max_tokens: 600
    })
  });
  if (oi3.ok) {
    const j3 = await oi3.json();
    lyrics = (j3?.choices?.[0]?.message?.content || lyrics).trim();
  }
}

// >>> a további kódod változatlanul mehet tovább (Suno-hívás), és itt elérhető: lyrics, style_en


    // ==== Suno V1 – START
    console.log('[GEN] Suno V1 start', { base: SUNO_BASE_URL, title, instrumental:(vocal==='instrumental') });
    const startRes = await fetch(`${SUNO_BASE_URL}/api/v1/generate`, {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${SUNO_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        customMode: true,
        model: 'V5',
        instrumental: (vocal === 'instrumental'),
        title,
        style: style_en,
        prompt: lyrics,
        callBackUrl: `${PUBLIC_URL}/api/suno/callback`
      })
    });

    const startTxt = await startRes.text();
    let startJson = {};
    try { startJson = JSON.parse(startTxt); } catch {}
    if (!startRes.ok || startJson?.code !== 200) {
      return res.status(502).json({ ok:false, message:'Suno start error', detail: startTxt });
    }
    const taskId = startJson?.data?.taskId;
    if (!taskId) return res.status(502).json({ ok:false, message:'Suno start error – no taskId', detail: startTxt });

    // ==== Suno V1 – POLL (max 2 links)
    const maxAttempts = Number(process.env.SUNO_MAX_ATTEMPTS || 160);
    const intervalMs  = Math.floor(Number(process.env.SUNO_POLL_INTERVAL || 2000));
    let attempts = 0, tracks = [];

    while (tracks.length < 2 && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, intervalMs));
      const pr = await fetch(`${SUNO_BASE_URL}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
        method:'GET',
        headers:{ 'Authorization': `Bearer ${SUNO_API_KEY}` }
      });
      if (!pr.ok) continue;
      const st = await pr.json();
      if (st?.code !== 200) continue;

      const items = st?.data?.response?.sunoData || [];
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

    return res.json({ lyrics, style_en, tracks });
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
    has_SUNO_API_KEY: !!process.env.SUNO_API_KEY, SUNO_BASE_URL: process.env.SUNO_BASE_URL||null,
    public_url: process.env.PUBLIC_URL || null
  }});
});

app.get('/api/suno/ping', async (req, res) => {
  try{
    const BASE = process.env.SUNO_BASE_URL || 'https://api.sunoapi.org';
    const H = { 'Authorization': `Bearer ${process.env.SUNO_API_KEY||''}`, 'Content-Type':'application/json' };
    const r1 = await fetch(`${BASE}/api/v1/generate`, { method:'POST', headers:H, body: JSON.stringify({ invalid:true }) });
    const t1 = await r1.text();
    return res.json({ ok:true, base: BASE, post_generate: { status:r1.status, len:t1.length, head:t1.slice(0,160) } });
  }catch(e){
    return res.status(500).json({ ok:false, error: (e && e.message) || e });
  }
});

/* ================== Start server ========================== */
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
