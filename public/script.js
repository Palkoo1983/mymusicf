if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
const tabs = document.querySelectorAll('.vinyl-tabs .tab');
const panels = document.querySelectorAll('section.panel');
function showPanel(id, opts = {}){
  const { scroll = true } = opts; // alapértelmezés: görgetünk
  panels.forEach(p => p.classList.toggle('active', p.id === id));
  tabs.forEach(t => t.classList.toggle('active', t.dataset.target === id));
  if (scroll) {
    document.querySelector('main').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
tabs.forEach(btn=>btn.addEventListener('click', ()=> showPanel(btn.dataset.target)));
// első betöltéskor: ne görgessünk
showPanel('intro', { scroll: false });

async function postJSON(url, data){
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  if(!res.ok) throw new Error('Hiba a beküldésnél');
  return await res.json();
}

const orderForm = document.getElementById('orderForm');
const orderStatus = document.getElementById('orderStatus');
orderForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  orderStatus.textContent = 'Küldés...';
  const data = Object.fromEntries(new FormData(orderForm).entries());
  try{
    const json = await postJSON('/api/order', data);
    orderStatus.textContent = json.message || 'Köszönjük! Válasz e-mailt küldtünk.';
    orderForm.reset();
  }catch(err){
    orderStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra később.';
    console.error(err);
  }
});

const contactForm = document.getElementById('contactForm');
const contactStatus = document.getElementById('contactStatus');
contactForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  contactStatus.textContent = 'Küldés...';
  const data = Object.fromEntries(new FormData(contactForm).entries());
  try{
    const json = await postJSON('/api/contact', data);
    contactStatus.textContent = json.message || 'Üzenet elküldve, hamarosan jelentkezünk!';
    contactForm.reset();
    const ov = document.getElementById('thanksOverlay'); if(ov){ ov.classList.remove('hidden'); }
  }catch(err){
    contactStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra.';
    console.error(err);
  }
});


document.getElementById('overlayClose')?.addEventListener('click', ()=> document.getElementById('thanksOverlay').classList.add('hidden'));
// ---- TOP OFFSET (fejléc magasság) ----
function getTopOffset() {
  const tb = document.querySelector('.topbar');
  return (tb && tb.offsetHeight) ? tb.offsetHeight : 92;
}

// ---- Fülváltás után görgessünk a tetejére ----
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.vinyl-tabs .tab');
  if (!tab) return;

  // Várunk egy event-ciklust, hogy a panel .active osztály már beálljon
  requestAnimationFrame(() => {
    // görgetés a lap tetejére, hogy semmi ne legyen levágva
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
});

// ---- Anchor linkek (#szekcio) esetén finom offsetelt görgetés ----
function scrollWithOffset(hash) {
  const el = document.querySelector(hash);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.pageYOffset - getTopOffset();
  window.scrollTo({ top: y, behavior: 'smooth' });
}

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const hash = a.getAttribute('href');
    if (!hash || hash === '#') return;
    e.preventDefault();
    scrollWithOffset(hash);
    history.pushState(null, '', hash);
  });
});
// ---- Megrendelésre irányítás + formátum beállítás (stabil verzió) ----
(function () {
  const cards = document.querySelectorAll('.card.package');
  if (!cards.length) return;

  function showOrderPanel() {
    const orderPanel = document.getElementById('megrendeles') || document.getElementById('order');
    if (!orderPanel) return null;

    // panelek
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    orderPanel.classList.add('active');

    // tab aktív jelölés
    const tabs = document.querySelectorAll('.vinyl-tabs .tab');
    tabs.forEach(t => t.classList.remove('active'));
    const orderTab = Array.from(tabs).find(t => /megrendel/i.test(t.textContent));
    if (orderTab) orderTab.classList.add('active');

    // tetejére
    window.scrollTo({ top: 0, behavior: 'auto' });
    return orderPanel;
  }

  function setFormat(orderPanel, pkg /* 'mp3' | 'mp4' | 'wav' */) {
    if (!orderPanel) return;
    const want = pkg.toLowerCase();

    // 1) SELECT mezők — keressük név/id alapján és az opciók szövegében is
    orderPanel.querySelectorAll('select').forEach(sel => {
      const opt = Array.from(sel.options).find(o => {
        const v = (o.value || '').toLowerCase();
        const t = (o.textContent || '').toLowerCase();
        return v === want || t.includes(want);
      });
      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // 2) RADIO gombok — value vagy címke alapján
    orderPanel.querySelectorAll('input[type="radio"][name]').forEach(r => {
      const v = (r.value || '').toLowerCase();
      const lbl = orderPanel.querySelector(`label[for="${r.id}"]`);
      const t = (lbl?.textContent || '').toLowerCase();
      if (v === want || t.includes(want)) {
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // 3) Hidden mező fallback (ha használtok ilyet)
    const hidden = orderPanel.querySelector('input[type="hidden"][name*="format" i]');
    if (hidden) hidden.value = want.toUpperCase();
  }

  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const pkg = card.dataset.package; // 'mp3' | 'mp4' | 'wav'
      const panel = showOrderPanel();
      // Várjunk egy tick-et, hogy a DOM/active állapot biztosan kész legyen
      setTimeout(() => setFormat(panel, pkg), 0);
    });
  });
})();
// --- ÁSZF/Adatkezelés elfogadás banner ---
(function () {
  const key = 'consentAccepted.v1';
  const el  = document.getElementById('consent');
  if (!el) return;

  // ha már elfogadta, ne jelenjen meg
  if (localStorage.getItem(key) === 'true') return;

  // megjelenítés
  el.classList.add('show');

  const btn = document.getElementById('consentAccept');
  if (btn) {
    btn.addEventListener('click', () => {
      localStorage.setItem(key, 'true');
      el.classList.remove('show');
    });
  }
})();
// --- Licenc figyelmeztetés bekötése a Megrendelés gombra ---
(function () {
  const modal  = document.getElementById('license-warning');
  const accept = document.getElementById('licenseAccept');
  const cancel = document.getElementById('licenseCancel');

  // tetszőleges: az elfogadás megmaradjon egy sessionben
  let acceptedThisSession = false;

  // keresd meg a Megrendelés panel gombját (állítsd, ha más a szelektor)
  function getOrderButton() {
    // tipikus elrendezés: a megrendelés panelen az .actions .primary a submit
    const panel = document.getElementById('megrendeles') || document.getElementById('order');
    if (!panel) return null;
    return panel.querySelector('.actions .primary, button[type="submit"], input[type="submit"]');
  }

  function showModal() {
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }
  function hideModal() {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }

  // drótozás
  document.addEventListener('click', (e) => {
    const btn = getOrderButton();
    if (!btn) return;
    if (e.target === btn || btn.contains(e.target)) {
      // ha még nem fogadta el ebben a sessionben, állítsuk meg a gombot és kérjünk elfogadást
      if (!acceptedThisSession) {
        e.preventDefault();
        showModal();
      }
    }
  });

  if (accept) {
    accept.addEventListener('click', () => {
      acceptedThisSession = true;    // csak a mostani rendelési folyamatra
      hideModal();
      // a tényleges rendelés folytatása: indítsuk újra a gomb kattintást
      const btn = getOrderButton();
      if (btn) btn.click();
    });
  }
  if (cancel) {
    cancel.addEventListener('click', () => hideModal());
  }
})();
// --- 'Hogyan működik' -> Megnyitja a Megrendelés tabot és fókuszál a Leírásra
(function () {
  const toOrderBtn = document.getElementById('howto-open-order');
  const orderTabBtn = document.querySelector('.tab[data-target="order"]');

  function focusDesc() {
    const desc =
      document.querySelector('#order textarea#leiras, #order textarea[name="description"], #order textarea#description, #order textarea');
    if (desc) desc.focus();
  }

  toOrderBtn?.addEventListener('click', () => {
    orderTabBtn?.click();      // váltás a Megrendelés fülre
    setTimeout(focusDesc, 80); // kis késleltetés, hogy a panel megjelenjen
  });
})();

// --- Leírás-segéd csak a #order panelre
(function () {
  const orderPanel = document.getElementById('order');
  if (!orderPanel) return;

  const desc =
    orderPanel.querySelector('textarea#leiras, textarea[name="description"], textarea#description, textarea');

  if (!desc) return;

  // Info sor
  const info = document.createElement('div');
  info.style.fontSize = '12px';
  info.style.marginTop = '6px';
  info.style.color = '#b6b6c3';
  info.innerHTML = '<span id="enz-count">0</span> karakter • <strong id="enz-score">Túl rövid</strong>';
  desc.insertAdjacentElement('afterend', info);

  // Példák
  const examples = [
    'Születésnapra készül a dal a nővéremnek, Nóra 46 éves. Szereti a minimál techno és house zenét. Kulcsszavak: kitartás, logika, barátság, újrakezdés. Emlék: amikor együtt túráztunk a Csóványosra.',
    'Esküvőre készül a dal, Kata és Máté számára. Stílus: romantikus pop, lassú tempó. Kulcsszavak: hűség, közös jövő, naplemente. Emlék: első közös balatoni nyaralás.',
    'Évfordulóra szóló dal. Rock-pop stílus, közepes tempó. Kulcsszavak: humor, közös főzés, macskánk: Mázli. Emlék: első saját lakás kulcsa.'
  ];
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexWrap = 'wrap';
  wrap.style.gap = '8px';
  wrap.style.marginTop = '8px';
  examples.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.slice(0, 22) + '… példa';
    b.className = 'chip';
    b.style.padding = '6px 10px';
    b.style.borderRadius = '999px';
    b.style.border = '1px solid #2a2b3a';
    b.style.background = '#10111a';
    b.style.color = '#f4f4f7';
    b.addEventListener('click', () => { desc.value = t; updateQuality(); desc.focus(); });
    wrap.appendChild(b);
  });
  info.insertAdjacentElement('afterend', wrap);

  // Tipp doboz
  const tip = document.createElement('div');
  tip.style.display = 'none';
  tip.style.marginTop = '6px';
  tip.style.padding = '10px';
  tip.style.border = '1px dashed #2b2d3a';
  tip.style.borderRadius = '10px';
  tip.style.background = '#12131a';
  tip.style.color = '#b6b6c3';
  tip.innerHTML = '💡 <strong>Tipp:</strong> írd le <em>kinek</em> készül, <em>milyen alkalomra</em>, stílus/hangulat, 3–5 kulcsszó, 1–2 konkrét emlék, és ha van tiltólista.';
  wrap.insertAdjacentElement('afterend', tip);

  const countEl = info.querySelector('#enz-count');
  const scoreEl = info.querySelector('#enz-score');

  function updateQuality() {
    const len = (desc.value || '').trim().length;
    countEl.textContent = String(len);
    if (len < 120) { scoreEl.textContent = 'Túl rövid'; scoreEl.style.color = '#ef476f'; tip.style.display = 'block'; }
    else if (len < 250) { scoreEl.textContent = 'Elfogadható'; scoreEl.style.color = ''; tip.style.display = 'none'; }
    else if (len < 900) { scoreEl.textContent = 'Kiváló'; scoreEl.style.color = '#06d6a0'; tip.style.display = 'none'; }
    else { scoreEl.textContent = 'Nagyon hosszú (rövidíts)'; scoreEl.style.color = '#ef476f'; tip.style.display = 'block'; }
  }
  desc.addEventListener('input', updateQuality);
  updateQuality();

  // Ha van form a #order panelben, beküldés előtt ellenőrzünk
  const form = desc.closest('form');
  form?.addEventListener('submit', (e) => {
    const len = (desc.value || '').trim().length;
    if (len < 120) {
      e.preventDefault();
      alert('A Leírás túl rövid. Kérlek, adj több támpontot (kinek, alkalom, stílus, kulcsszavak, emlékek), hogy személyre szabhassuk a dalt.');
      desc.focus();
    }
  });
})();
