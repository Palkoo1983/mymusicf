// ESM server.js – FULL PATCH (style preserve + vocals + 4V2C + rhyme + numbers→words + unique V4 + idempotency)
// IMPORTANT: SUNO_BASE_URL kizárólag ENV-ből (nem írjuk felül a korábbi működést)

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

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

/* ----------------- Idempotency (dupla-kattintás ellen) -- */
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
    headers: { 'Authorization': `Bearer ${ENV.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
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

async function sendMailFast(args) {
  try { const r = await sendViaResend(args); if (!r.skipped) return r; }
  catch (e) { console.warn('[MAIL:RESEND_FAIL]', e?.message || e); }
  try { const s = await sendViaSMTP(args); if (!s.skipped) return s; }
  catch (e) { console.warn('[MAIL:SMTP_FAIL]', e?.message || e); }
  console.log('[MAIL:SIMULATED]', { to: args.to, subject: args.subject });
  return { simulated: true };
}

function queueEmails(tasks) {
  setImmediate(async () => { await Promise.allSettled(tasks.map(t => sendMailFast(t))); });
}

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
    if(!stripe){ return res.status(503).json({ ok:false, message:'Fizetés ideiglenesen nem elérhető.' }); }
    const pack = (o.package || 'basic').toLowerCase();
    const amount = PRICE[pack] || PRICE.basic;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: CURRENCY,
          unit_amount: Math.max(200, amount),
          product_data: { name: `EnZenem – ${pack} csomag` }
        },
        quantity: 1
      }],
      success_url: (process.env.PUBLIC_URL || '') + '/success.html',
      cancel_url: (process.env.PUBLIC_URL || '') + '/cancel.html',
      metadata: {
        email: o.email || '', event_type: o.event_type || '', style: o.style || '',
        vocal: o.vocal || '', language: o.language || '', brief: (o.brief || '').slice(0, 1500), package: pack
      }
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

/* ================== Suno callback ========================= */
app.post('/api/suno/callback', async (req, res) => {
  try { console.log('[SUNO CALLBACK] body:', req.body); res.json({ ok:true }); }
  catch (e) { console.error('[SUNO CALLBACK ERROR]', e); res.status(500).json({ ok:false }); }
});

/* ================== STYLE PRESERVE helpers ================= */

// pontos megőrzés a kliens műfajaira; NEM fordítjuk át „electronic”-ra stb.
const EXACT_GENRES = new Set([
  'minimal techno','house','pop','rock','techno','trance','drum and bass','dnb','hip hop','hip-hop',
  'r&b','rnb','soul','funk','jazz','blues','edm','electronic','ambient','lo-fi','lofi','metal','punk',
  'indie','folk','country','reggaeton','reggae','synthwave','vaporwave','trap','drill','hardstyle',
  'progressive house','deep house','electro house','future bass','dubstep','garage','uk garage','breakbeat','phonk'
]);
// HU->EN normalizálás csak biztos megfelelésekre
const HU_TO_EN = new Map([
  ['minimál technó','minimal techno'],
  ['minimal technó','minimal techno'],
  ['minimal techno','minimal techno'],
  ['techno','techno'],
  ['háusz','house'],
  ['house','house'],
  ['pop','pop'],
  ['rok','rock'],
  ['rock','rock']
]);

function normalizeClientStyles(raw) {
  const out = [];
  const seen = new Set();
  const items = (raw||'').split(/[,\|\/]+/).map(s => s.trim()).filter(Boolean);
  for (let it of items){
    let low = it.toLowerCase();
    if (HU_TO_EN.has(low)) low = HU_TO_EN.get(low);
    if (EXACT_GENRES.has(low) && !seen.has(low)) { seen.add(low); out.push(low); }
  }
  return out; // kisbetű, deduplikált, csak konkrét műfaj
}

function buildStyleEN(clientStylesRaw, vocal, gptStyleEn){
  const primary = normalizeClientStyles(clientStylesRaw);
  const vocalTag = (vocal==='male') ? 'male vocals' : (vocal==='female') ? 'female vocals' : '';
  if (primary.length === 0){
    // nincs kliens-műfaj → GPT javaslat mehet, max 2 „mood”
    const base = (gptStyleEn||'').toLowerCase().split(/[,\|\/]+/).map(s=>s.trim()).filter(Boolean);
    const filtered = base.filter(t => t !== 'male vocals' && t !== 'female vocals');
    if (vocalTag) filtered.push(vocalTag);
    return filtered.join(', ');
  }
  // van kliens-műfaj → ez az elsődleges; GPT-ből csak 1–2 mood mehet
  const extras = (gptStyleEn||'').toLowerCase().split(/[,\|\/]+/)
    .map(s=>s.trim()).filter(Boolean)
    .filter(tag => !EXACT_GENRES.has(tag) && tag!=='male vocals' && tag!=='female vocals');
  const final = [...primary];
  for (const x of extras){
    if (!final.includes(x) && final.length - primary.length < 2) final.push(x);
  }
  if (vocalTag && !final.includes(vocalTag)) final.push(vocalTag);
  return final.join(', ');
}

/* ================== Suno start helper (retry) ============= */
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

/* ============ GPT → Suno generate (4V+2C, rhyme, numbers→words, style-fit) ============ */
app.post('/api/generate_song', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
    if (!rateLimit('gen:'+ip, 45000, 5)) {
      return res.status(429).json({ ok:false, message:'Túl sok kérés. Próbáld később.' });
    }

    const { title='', styles='', vocal='instrumental', language='hu', brief='' } = req.body || {};
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const SUNO_API_KEY   = process.env.SUNO_API_KEY;
    const SUNO_BASE_URL  = (process.env.SUNO_BASE_URL || '').replace(/\/+$/,''); // NEM módosítjuk
    const PUBLIC_URL     = (process.env.PUBLIC_URL || '').replace(/\/+$/,'');

    if (!OPENAI_API_KEY) return res.status(500).json({ ok:false, message:'OPENAI_API_KEY hiányzik' });
    if (!SUNO_API_KEY)   return res.status(500).json({ ok:false, message:'SUNO_API_KEY hiányzik' });
    if (!SUNO_BASE_URL)  return res.status(500).json({ ok:false, message:'SUNO_BASE_URL hiányzik' });

    // idempotencia (20s)
    const key = makeKey({ title, styles, vocal, language, brief });
    const now = Date.now();
    const last = activeStarts.get(key) || 0;
    if (now - last < 20000) {
      return res.status(202).json({ ok:true, message:'Már folyamatban van egy azonos kérés. Várj pár másodpercet.' });
    }
    activeStarts.set(key, now);
    setTimeout(()=> activeStarts.delete(key), 60000);

    // 1) GPT – JSON (lyrics_draft + style_en), style-fit + szerkezet + numbers-as-words
    const sys1 =
      "You write singable song lyrics and also output an ENGLISH style descriptor for a music model. " +
      "Return STRICT JSON only. STRUCTURE EXACTLY: Verse 1 (4) / Verse 2 (4) / Chorus (4) / Verse 3 (4) / Verse 4 (4) / Chorus (4). " +
      "Lines 6–10 words, coherent metaphors OK, avoid nonsense. Gentle end-rhyme per section preferred, but never force meaning. " +
      "Fit the LYRICS to the client’s chosen genres so it sings like that style. " +
      "For style_en: DO NOT replace already-English genres (e.g., 'minimal techno', 'house', 'pop'). " +
      "You may add up to two short mood descriptors if they do not conflict. " +
      "If vocal is male/female, append 'male vocals'/'female vocals'; if instrumental, omit vocals. " +
      "All numerals must be written fully in words in the requested language (no digits).";
    const usr1 = [
      `Language for lyrics: ${language}`,
      `Title: ${title}`,
      `Client styles (primary, do NOT override): ${styles}`,
      `Vocal: ${vocal} (male|female|instrumental)`,
      `Brief (secondary only): ${brief}`,
      `Return JSON only: {"lyrics_draft":"...","style_en":"..."}`
    ].join('\n');

    const oi1 = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages:[{role:'system', content: sys1},{role:'user', content: usr1}],
        temperature:0.7,
        response_format:{ type:'json_object' },
        max_tokens: 650
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

    // 2) STYLE véglegesítés (kliens műfaja elsődleges) + vocals tag
    const styleFinal = buildStyleEN(styles, vocal, gptStyle);

    // 3) REFINE PASS – rím/tisztaság/koherencia (nyelv tartása)
    const sys2 =
      "You are a native-speaker lyric editor. Fix awkward or nonsensical lines without changing meaning. " +
      "Keep EXACT structure: Verse 1 (4) / Verse 2 (4) / Chorus (4) / Verse 3 (4) / Verse 4 (4) / Chorus (4). " +
      "Lines 6–10 words. Gentle end-rhymes preferred, never force nonsense. " +
      "Make sure tone and rhythm FIT the client's chosen genres. " +
      "All numerals must be written fully in words in the requested language (no digits). " +
      "Output ONLY the final lyrics (no JSON, no extra commentary).";
    const usr2 = [
      `Language: ${language}`,
      `Title: ${title}`,
      `Chosen style(s): ${styles}`,
      `Vocal: ${vocal}`,
      "",
      "DRAFT:",
      lyricsDraft
    ].join('\n');

    let oi2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages:[{role:'system', content: sys2},{role:'user', content: usr2}],
        temperature:0.6,
        top_p:0.9,
        max_tokens: 750
      })
    });
    let lyrics = lyricsDraft;
    if (oi2.ok){
      const j2 = await oi2.json();
      lyrics = (j2?.choices?.[0]?.message?.content || lyricsDraft).trim();
    }

    // 4) Ha maradt számjegy, írassa ki szóval
    if (/\d/.test(lyrics)){
      const sysNum = "Rewrite ALL numerals as fully spelled-out words in the requested language. Keep section headings and line counts. No digits.";
      const on = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages:[{role:'system', content: sysNum},{role:'user', content: lyrics}],
          temperature:0.0,
          max_tokens: 750
        })
      });
      if (on.ok){
        const jn = await on.json();
        lyrics = (jn?.choices?.[0]?.message?.content || lyrics).trim();
      }
    }

    // 5) V1 vs V4: ha legalább 2 sor egyezik, parafrázis a Verse 4-re
    function getSection(text, name){
      const rx = new RegExp(`(^|\\n)\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n\\s*(Verse 1|Verse 2|Verse 3|Verse 4|Chorus)\\s*\\n|$)`, 'i');
      const m = text.match(rx);
      return m ? (m[2] || '').trim() : '';
    }
    const v1 = getSection(lyrics, 'Verse 1');
    const v4 = getSection(lyrics, 'Verse 4');
    let needUniqueFix = false;
    if (v1 && v4){
      const set1 = new Set(v1.split('\n').map(s => s.trim().toLowerCase()));
      const sameCount = v4.split('\n').map(s => s.trim().toLowerCase()).filter(s => set1.has(s)).length;
      needUniqueFix = sameCount >= 2;
    }
    if (needUniqueFix){
      const sys4 =
        "Paraphrase ONLY the lines of Verse 4 so they are not identical to Verse 1, " +
        "keep meaning, rhyme feel, and language EXACT. Return FULL lyrics with same headings. No digits.";
      const oi4 = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages:[{role:'system', content: sys4},{role:'user', content: lyrics}],
          temperature:0.6,
          max_tokens: 800
        })
      });
      if (oi4.ok){
        const j4 = await oi4.json();
        lyrics = (j4?.choices?.[0]?.message?.content || lyrics).trim();
      }
    }

    // 6) Heading/szerkezet ellenőrzés
    const needed = ["Verse 1","Verse 2","Chorus","Verse 3","Verse 4","Chorus"];
    const hasAll = needed.every(h => lyrics.includes(h));
    if (!hasAll){
      const sys3 = "Format the lyrics to EXACTLY: Verse 1 (4) / Verse 2 (4) / Chorus (4) / Verse 3 (4) / Verse 4 (4) / Chorus (4). No digits; numbers as words.";
      const oi3 = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages:[{role:'system', content: sys3},{role:'user', content: lyrics}],
          temperature:0.0,
          max_tokens: 600
        })
      });
      if (oi3.ok){
        const j3 = await oi3.json();
        lyrics = (j3?.choices?.[0]?.message?.content || lyrics).trim();
      }
    }

    // ==== Suno V1 – START (customMode + V5) ====
    const startRes = await sunoStartV1(`${SUNO_BASE_URL}/api/v1/generate`, {
      'Authorization': `Bearer ${SUNO_API_KEY}`,
      'Content-Type': 'application/json'
    }, {
      customMode: true,
      model: 'V5',
      instrumental: (vocal === 'instrumental'),
      title,
      style: styleFinal,
      prompt: lyrics,
      callBackUrl: PUBLIC_URL ? `${PUBLIC_URL}/api/suno/callback` : undefined
    });

    if (!startRes.ok) {
      return res.status(502).json({ ok:false, message:'Suno start error', detail:startRes.text, status:startRes.status });
    }
    const sj = startRes.json;
    if (sj?.code !== 200 || !sj?.data?.taskId) {
      return res.status(502).json({ ok:false, message:'Suno start error – bad response', detail: JSON.stringify(sj) });
    }
    const taskId = sj.data.taskId;

    // ==== Poll (max 2 track) ====
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
    const BASE = (process.env.SUNO_BASE_URL || '').replace(/\/+$/,''); // csak ENV-ből
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
