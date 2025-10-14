const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();
const crypto = require('crypto');
let stripe = null;
try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || ''); } catch(e) { stripe = null; }

const app = express();
const PORT = process.env.PORT || 8000;

// Env aliasok + Resend támogatás + stratégiák
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

app.use(cors());
app.use(express.json());
// --- Simple rate limit (per IP) ---
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

app.use(express.static('public'));

// Health
app.get('/healthz', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ---------- Mail helpers ----------
function buildTransport() {
  if (ENV.RESEND_ONLY) return null; // kifejezetten tiltsuk az SMTP-t
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = ENV;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: ENV.SMTP_SECURE || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // rövid timeoutok, hogy ne lassítson
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
      'Authorization': 'Bearer ' + ENV.RESEND_API_KEY,
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

// Gyors stratégia: ha van RESEND_API_KEY, először Resend-et próbálunk, utána SMTP-t.
// (a korábbi fordított sorrend lassított, ha az SMTP blokkolt)
async function sendMailFast(args) {
  // 1) Resend first (ha van kulcs)
  try {
    const r = await sendViaResend(args);
    if (!r.skipped) return r;
  } catch (e) {
    console.warn('[MAIL:RESEND_FAIL]', e?.message || e);
  }
  // 2) SMTP second (ha engedélyezett)
  try {
    const s = await sendViaSMTP(args);
    if (!s.skipped) return s;
  } catch (e) {
    console.warn('[MAIL:SMTP_FAIL]', e?.message || e);
  }
  console.log('[MAIL:SIMULATED]', { to: args.to, subject: args.subject });
  return { simulated: true };
}

// "fire-and-forget": gyors válasz az API-nak, a küldés háttérben fut
function queueEmails(tasks) {
  setImmediate(async () => {
    await Promise.allSettled(tasks.map(t => sendMailFast(t)));
  });
}

// Teszt végpont
app.get('/api/test-mail', (req, res) => {
  const to = ENV.TO_EMAIL || ENV.SMTP_USER;
  queueEmails([{ to, subject: 'EnZenem – gyors teszt', html: '<p>Gyors tesztlevél.</p>' }]);
  res.json({ ok: true, message: 'Teszt e-mail ütemezve: ' + to });
});

// --------- API: Megrendelés (instant válasz, háttérküldés) ----------
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

  // e-mailek háttérben
  const jobs = [
    { to: owner, subject: 'Új dal megrendelés', html: orderHtml, replyTo: o.email || undefined }
  ];
  if (o.email) {
    jobs.push({
      to: o.email,
      subject: 'EnZenem – Megrendelés fogadva',
      html: `<p>Kedves Megrendelő!</p><p>Köszönjük a megkeresést! A megrendelését megkaptuk, és 36 órán belül elküldjük Önnek a videó letöltési linkjét.
Ha bármilyen kérdése merül fel, szívesen segítünk!</p><p>Üdv,<br/>EnZenem</p>`
    });
  }
  queueEmails(jobs);

  // azonnali válasz
  res.json({ ok: true, message: 'Köszönjük! Megrendelésed beérkezett. Hamarosan kapsz visszaigazolást e-mailben.' });
});

// --------- API: Kapcsolat (instant válasz, háttérküldés) ----------
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

  const jobs = [
    { to: owner, subject: 'EnZenem – Üzenet', html, replyTo: c.email || undefined }
  ];
  if (c.email) {
    jobs.push({ to: c.email, subject: 'EnZenem – Üzenet fogadva', html: '<p>Köszönjük az üzenetet, hamarosan válaszolunk.</p>' });
  }
  queueEmails(jobs);

  res.json({ ok: true, message: 'Üzeneted elküldve. Köszönjük a megkeresést!' });
});


// --- Stripe price defaults via ENV or fallback (HUF) ---
const PRICE = {
  basic:  Number(process.env.PRICE_BASIC || 19900),   // Ft
  premium:Number(process.env.PRICE_PREMIUM || 34900), // Ft
  video:  Number(process.env.PRICE_VIDEO || 49900)    // Ft
};
const CURRENCY = (process.env.CURRENCY || 'huf').toLowerCase();

// --- Checkout: create Stripe session, carry order data in metadata ---
app.post('/api/checkout', async (req, res) => {
  try{
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
    if(!rateLimit('checkout:'+ip, 60000, 10)) return res.status(429).json({ok:false, message:'Túl sok kérés. Próbáld később.'});

    const o = req.body || {};
    if(o._hp) return res.status(400).json({ ok:false, message:'Hiba.' });

    if(!stripe || !process.env.STRIPE_SECRET_KEY){
      return res.status(503).json({ ok:false, message:'Fizetés ideiglenesen nem elérhető.' });
    }
    const pack = (o.package || 'basic').toLowerCase();
    const amount = PRICE[pack] || PRICE.basic;
    const lineItem = {
      price_data: {
        currency: CURRENCY,
        unit_amount: Math.max(200, amount) * (CURRENCY==='huf' ? 1 : 1),
        product_data: { name: `EnZenem – ${pack} csomag` }
      },
      quantity: 1
    };
    const metadata = {
      email: o.email || '',
      event_type: o.event_type || '',
      style: o.style || '',
      vocal: o.vocal || '',
      language: o.language || '',
      brief: (o.brief || '').slice(0, 1500),
      package: pack
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

// --- Stripe webhook: payment success -> send emails with metadata ---
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

app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));

/* ======================== SUNO START RETRY HELPER ===================== */
async function sunoStartWithRetry(url, headers, body){
  for (let i=0; i<6; i++){ // max 6 próbálkozás, exponenciális várakozással
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
/* ===================================================================== */

// === EnZenem: GPT→Suno generate_song API ===============================
app.post('/api/generate_song', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
    if (!rateLimit('gen:'+ip, 45000, 5)) return res.status(429).json({ok:false, message:'Túl sok kérés. Próbáld később.'});

    const { title='', styles='', vocal='instrumental', language='hu', brief='' } = req.body || {};

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const SUNO_API_KEY   = process.env.SUNO_API_KEY;
    const SUNO_BASE_URL  = process.env.SUNO_BASE_URL || 'https://api.suno.ai';

    if (!OPENAI_API_KEY) return res.status(500).json({ ok:false, message:'OPENAI_API_KEY hiányzik' });
    if (!SUNO_API_KEY)   return res.status(500).json({ ok:false, message:'SUNO_API_KEY hiányzik' });

    const vocalTag = vocal === 'male' ? 'male vocals' : (vocal === 'female' ? 'female vocals' : 'instrumental');
    const styleForSuno = vocal === 'instrumental' ? styles : `${styles}, ${vocalTag}`;

    const system = "You are a concise hit-song lyricist. Always return ONLY the final lyrics, no commentary. Structure: Verse 1 (4 lines), Chorus (4 lines), Verse 2 (4), Chorus (same/varied 4), Verse 3 (4). Rhyme optional, keep lines singable and 5–9 words.";
    const userPrompt = language === 'hu'
      ? `Nyelv: magyar.\nCím: ${title}\nHangulat/stílus: ${styles}\nLeírás: ${brief}\n\nÍrj 3 versszakot és 2 refrént a fenti szerkezetben. Adj egyszerű, énekelhető sorokat, központozás mértékkel.`
      : `Language: English.\nTitle: ${title}\nMood/style: ${styles}\nBrief: ${brief}\n\nWrite 3 verses and 2 choruses (structure above). Keep it catchy and singable.`;

    // 1) OpenAI – lyrics
    const oi = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages:[{role:'system', content: system},{role:'user', content:userPrompt}],
        temperature:0.8
      })
    });
    if(!oi.ok){
      const t = await oi.text();
      return res.status(502).json({ ok:false, message:'OpenAI error', detail:t });
    }
    const oiJson = await oi.json();
    const lyrics = (oiJson?.choices?.[0]?.message?.content || '').trim();

    // 2) Suno – start job (custom/v5) RETRY-OS
    const startRes = await sunoStartWithRetry(`${SUNO_BASE_URL}/api/generate`, {
      'Authorization': `Bearer ${SUNO_API_KEY}`,
      'Content-Type': 'application/json'
    }, {
      model: 'custmod-v5',
      custom: true,
      title,
      style_of_music: styleForSuno,
      lyrics
    });

    if (!startRes.ok){
      return res.status(502).json({ ok:false, message:'Suno start error', detail:startRes.text, status:startRes.status });
    }
    const sj = startRes.json;
    let jobId = sj?.job_id || sj?.id || sj?.jobId;
    let tracks = Array.isArray(sj?.tracks) ? sj.tracks : [];

    // 3) Poll (ha kell)
    const maxAttempts = Number(process.env.SUNO_MAX_ATTEMPTS || 120);
    const intervalMs = Math.floor(Number(process.env.SUNO_POLL_INTERVAL || 1.5) * 1000);
    let attempts = 0;

    while (tracks.length < 2 && jobId && attempts < maxAttempts){
      attempts++;
      await new Promise(r => setTimeout(r, intervalMs));
      const pr = await fetch(`${SUNO_BASE_URL}/api/generate/${jobId}`, {
        headers:{ 'Authorization': `Bearer ${SUNO_API_KEY}` }
      });
      if(!pr.ok) continue;
      const st = await pr.json();
      const items = st.tracks || st.result || st.items || [];
      tracks = [];
      for (const it of items){
        const audio = it.audio_url || it.audioUrl || it.url;
        const image = it.image_url || it.imageUrl;
        const ttitle = it.title || title;
        if(audio) tracks.push({ title: ttitle, audio_url: audio, image_url: image });
      }
    }

    if (!tracks.length) return res.status(502).json({ ok:false, message:'Suno did not return tracks in time.' });
    return res.json({ lyrics, tracks });

  } catch (e) {
    console.error('[generate_song]', e);
    return res.status(500).json({ ok:false, message:'Hiba történt', error: (e && e.message) || e });
  }
});
// ======================================================================

// DIAG: környezet ping
app.get('/api/generate_song/ping', (req, res) => {
  res.json({ ok:true, diag:{
    node: process.version, fetch_defined: typeof fetch!=='undefined',
    has_OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    has_SUNO_API_KEY: !!process.env.SUNO_API_KEY, SUNO_BASE_URL: process.env.SUNO_BASE_URL||null
  }});
});
