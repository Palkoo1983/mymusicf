// --- Betöltéskor NE állítsa vissza a böngésző a korábbi görgetési pozíciót ---
(function() {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  // azonnali (nem "smooth") felgörgetés a tetejére
  window.scrollTo(0, 0);
})();

// === NovaBot hooks (SAFE, no-op ha nincs NovaBot) ==========================
(function(){
  function nbSay(text){
    try { if (window.novaBotSay) { window.novaBotSay(text); } } catch(_) {}
  }
  window.novaOrderSuccess = function(){
    nbSay('Éljen, megrendelésedet elküldted, 48 órán belül megkapod a dalodat.');
  };
  window.novaOrderFail = function(){
    nbSay('Oh :(, megrendelésed nem sikerült, kérlek próbáld újra');
  };
})();
// ==========================================================================

// Samsung Internet detektálás – biztosan lefut
(function () {
  try {
    var ua = navigator.userAgent || "";
    if (ua.includes("SamsungBrowser")) {
      document.documentElement.classList.add("ua-samsung");
    }
  } catch (e) {
    console.warn("Samsung detection error:", e);
  }
})();
// --- WebView + "Asztali webhely kérése" – DESKTOP-SAFE + THROTTLE + NO-OP ---
(function () {
  try {
    var html = document.documentElement;
    var ua   = navigator.userAgent || "";

    var isAndroid = /Android/i.test(ua);
    var isIOS     = /iPhone|iPad|iPod/i.test(ua);

    var isAndroidWV = isAndroid && /\bwv\b/i.test(ua);
    var isSafari    = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    var isIOSWV     = isIOS && (!isSafari || !!(window.webkit && window.webkit.messageHandlers));

    function isMobileLike(){
      try{
        var coarse  = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var noHover = window.matchMedia && window.matchMedia("(hover: none)").matches;
        return (isAndroid || isIOS || (coarse && noHover));
      }catch(_){ return (isAndroid || isIOS); }
    }
    function isDesktopLike(){
      try{
        return (window.matchMedia && window.matchMedia("(pointer: fine) and (hover: hover)").matches) && !(isAndroid || isIOS);
      }catch(_){ return !(isAndroid || isIOS); }
    }

    var lastSig = "";

    function applyFlagsCore(){
      var mobileLike   = isMobileLike();
      var desktopLike  = isDesktopLike();
      var looksDesktop = window.innerWidth >= 900;

      var need = [];
      if (isAndroidWV) need.push("ua-androidwv");
      if (isIOSWV)     need.push("ua-ioswv");
      if (isAndroidWV || isIOSWV) need.push("ua-webview");
      if (mobileLike)  need.push("ua-mobilelike");
      if (mobileLike && looksDesktop && !desktopLike) need.push("ua-desktopreq");

      var sig = need.join("|");
      if (sig === lastSig) return; // NO-OP ha nincs változás

      html.classList.remove("ua-androidwv","ua-ioswv","ua-mobilelike","ua-desktopreq","ua-webview");
      need.forEach(function(c){ html.classList.add(c); });
      lastSig = sig;
    }

    applyFlagsCore();

    function throttle(fn, ms){
      var t=null, pend=false;
      return function(){
        if(t){ pend=true; return; }
        var args=arguments;
        t=setTimeout(function(){ t=null; fn.apply(null,args); if(pend){ pend=false; fn.apply(null,args);} }, ms);
      }
    }
    var onResize = throttle(applyFlagsCore, 250);
    addEventListener("resize", onResize, {passive:true});
    addEventListener("orientationchange", applyFlagsCore);
  } catch(e) {}
})();
;



/* =========================================================
   EnZenem – main script
   - Tab navigation (vinyl-tabs) + scroll to top
   - Package card selection
   - HOWTO -> ORDER (delegált) + example chips → placeholder
   - Brief helper (counter + quality, NO DUPLICATES) + examples on ORDER
   - Order form (ALWAYS show license modal) + Contact form
   - Thanks overlay
   - Consent bar + License modal
   ========================================================= */

/* ---------- helpers ---------- */
async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json().catch(() => ({}));
}
const qs  = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- tabs ---------- */
function initTabs() {
  const buttons = qsa('.tab');
  const panels  = qsa('main .panel');

  function activate(targetId) {
    if (!targetId) return;

    // ha épp más elem van fókuszban, engedjük el
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    panels.forEach(p => {
      const on = (p.id === targetId);
      p.hidden = !on;
      p.classList.toggle('active', on);
      if (on) p.removeAttribute('inert'); else p.setAttribute('inert', '');
    });

    buttons.forEach(b => {
      const on = (b.dataset.target === targetId);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('active', on);
    });

    if (targetId === 'order') setTimeout(initBriefHelper, 50);

    // fókusz az új panel címsorára
    const active = panels.find(p => p.id === targetId);
    const h2 = active && active.querySelector('h2');
    if (h2) {
      h2.setAttribute('tabindex', '-1');
      h2.focus();
    }

    // tetejére görgetés
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // initial state
  const activePanel = panels.find(p => p.classList.contains('active')) || panels[0];
  panels.forEach(p => (p.hidden = p !== activePanel));

  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      activate(btn.dataset.target);
    });
  });
}

/* ---------- package cards (pricing) ---------- */
function initPackages() {
  const cards = qsa('.card.package');
  const orderTabBtn = qs('.tab[data-target="order"]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      const pkg = card.getAttribute('data-package'); // mp3/mp4/wav
      orderTabBtn?.click();
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const sel = qs('#order select[name="package"]');
        if (!sel) return;
        if (pkg === 'mp3') sel.value = 'basic';
        else if (pkg === 'mp4') sel.value = 'video';
        else if (pkg === 'wav') sel.value = 'premium';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, 60);
    });
  });
}

/* ---------- HOWTO -> ORDER, example chips (delegált) ---------- */
function initHowTo() {
  const howto = qs('#howto');
  if (!howto) return;

  const orderTabSelector = '.vinyl-tabs .tab[data-target="order"]';
  function gotoOrder() {
    const btn = qs(orderTabSelector);
    if (!btn) return;
    btn.click(); // a te tab-logikád aktiválja az ORDER panelt
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const desc = qs('#order textarea[name="brief"], #order textarea#brief, #order textarea');
      if (desc) {
        try { desc.focus({ preventScroll: true }); } catch(_) {}
      }
    }, 60);
  }

  // „Ugorj a Megrendeléshez” gomb (ha van külön ilyen)
  const openBtn = qs('#howto-open-order');
  openBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    gotoOrder();
  });

  // Delegált kattintás-kezelés BÁRMELY minta-chipre a HOWTO panelen
  howto.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-example], .example-chip, .chip.example, .brief-example, .chip');
    if (!chip) return;

    e.preventDefault();
    e.stopPropagation();

    const text =
      chip.getAttribute('data-example') ||
      chip.getAttribute('data-text') ||
      (chip.textContent || '').trim();

    // először átváltunk ORDER-re
    gotoOrder();

    // majd pici késleltetéssel beállítjuk a placeholdert
  setTimeout(() => {
  const desc = qs('#order textarea[name="brief"], #order textarea#brief, #order textarea');
  if (!desc) return;

  desc.placeholder = text;
  desc.dispatchEvent(new Event('input', { bubbles: true }));

  const isMobile = window.innerWidth < 640;

  if (isMobile) {
    try { desc.focus({ preventScroll: true }); } catch (_) {}
    desc.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  } else {
    // DESKTOP → görgetés a Megrendelés panel tetejére
    const orderPanel = qs('#order');
    if (orderPanel) {
      orderPanel.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }
}, 400);

  });
}

/* ---------- Leírás helper az ORDER panelen (no duplicates) + példák ---------- */
function initBriefHelper() {
  const orderPanel = qs('#order');
  if (!orderPanel) return;

  // guard: ha már létrehoztuk, kilépünk
  if (qs('#enz-quality', orderPanel)) return;

  const desc = qs('textarea[name="brief"], textarea#brief, textarea', orderPanel);
  if (!desc) return;

  // infó sor (színezéssel + Elfogadható label)
  const info = document.createElement('div');
  info.id = 'enz-quality';
  info.style.fontSize = '12px';
  info.style.marginTop = '6px';
  info.classList.add('too-short'); // kezdetben piros
  info.innerHTML = '<span id="enz-count">0</span> / 120 <span id="enz-ok-label" aria-live="polite"></span>';
  desc.insertAdjacentElement('afterend', info);

  // minta leírások – csak egyszer
  if (!qs('#enz-order-examples', orderPanel)) {
    const exWrap = document.createElement('div');
    exWrap.id = 'enz-order-examples';
    exWrap.style.display = 'flex';
    exWrap.style.flexWrap = 'wrap';
    exWrap.style.gap = '8px';
    exWrap.style.marginTop = '8px';

    const examples = [
      'Születésnapi dalt szeretnék a nővéremnek, Nórának. Pali vagyok, a legjobb barátja. A minimal techno és a house áll hozzá közel. Jó lenne, ha megjelenne benne a kitartás, a logika, a barátság és az újrakezdés motívuma. Idézzük meg a közös túráinkat, a 2014-es szardíniai utat, Portugáliát és a közös techno bulikat. A munkahelyi százszázalékos tervteljesítések is rólunk szólnak.',
      'Esküvői dalt kérünk Katának és Máténak, lassú, romantikus pop hangulatban. Szerepeljen benne a hűség, a közös jövő és a naplemente képe. Jó lenne felidézni az első közös balatoni nyaralást, a margitszigeti csókot, és említeni a legjobb barátokat, Nórit és Otit. Az utazásaink közül Dominika is fontos emlék.',
      'Évfordulóra lepnék meg a párommal egy dallal. Közepes tempójú, pozitív rock-popra gondolok. Legyen benne a humor, a közös főzéseink és a macskánk, Mázli. Jó lenne megemlíteni azt a pillanatot is, amikor megkaptuk az első közös lakásunk kulcsát.',
      'Búcsúztató dal készül. Szeretném, ha méltóságteljes és nyugodt lenne, visszafogott dobbal. A hála, a fény és az emlékek témája fontos. Gyerekkori közös zongorázásaink a nappaliban különösen kedvesek.',
      'Céges évzáróra kérek dalt lendületes, modern pop/elektronikus hangzással. Jó lenne, ha a csapatmunka, az innováció, a kétezer-huszonötös célok és egy kis humor is beleférne. A tavaszi hackathon-győzelmünk legyen benne.',
      'Gyerekdalt szeretnék egy hatéves kislánynak, Lilinek, ma van a születésnapja. Vidám, egyszerű dallamra és könnyen énekelhető refrénre vágyunk. Szerepeljen benne az unikornis, a szivárvány és az ovis barátok. Jó lenne megemlíteni a közös biciklizést a parkban és a legjobb barátját, Sanyikát.',
      'Nyugdíjba vonuló kollégának kérünk dalt. Legyen nosztalgikus és felemelő, akusztikus gitár és zongora kísérettel. Fontos témák: segítőkészség, humor, huszonöt év közös munka, és a csapat. A legendás hétfő reggeli kávézások mindenképp kerüljenek bele.',
      'Jobbulást kívánó dalt szeretnénk. Lassan építkező, reményt adó hangulatban gondolkodunk. A kitartás, a gyógyulás és az, hogy mellette állunk, mind jelenjen meg. A nyári tábortűz melletti beszélgetéseink szép emlékek.',
      'Lánykéréshez kérek dalt romantikus pop ballada hangzásban, meleg tónusokkal. A közös jövő, az „igen” pillanat és az összetartozás legyen benne. Az első csókunk a Margitszigeten különösen fontos és a Budai vár, ahol megkértem Éva kezét.',
      'Ballagásra/diplomához kérünk dalt a fiamnak, Tamásnak. Közepes tempójú, motiváló darabot szeretnénk. Az álom, a kitartás és az új kezdet témája jelenjen meg. Jó lenne felidézni az éjszakai tanulásokat és a záróvizsga napját.'
    ];

    const exTitle = document.createElement('div');
    exTitle.textContent = 'Minta leírások:';
    exTitle.style.marginTop = '10px';
    exTitle.style.fontSize = '13px';
    exTitle.style.color = '#b6b6c3';
    info.insertAdjacentElement('afterend', exTitle);

    examples.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = (t.slice(0, 24) + '… példa');
      b.className = 'chip';
      b.style.padding = '6px 10px';
      b.style.borderRadius = '999px';
      b.style.border = '1px solid #2a2b3a';
      b.style.background = '#10111a';
      b.style.color = '#f4f4f7';
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // csak placeholder – a value-t sosem írjuk!
        desc.placeholder = t;
        try { desc.focus({ preventScroll: true }); } catch(_) {}
      });
      exWrap.appendChild(b);
    });

    exTitle.insertAdjacentElement('afterend', exWrap);
  }

  // tipp doboz (rejtett, később aktiválható)
  const tip = document.createElement('div');
  tip.style.display = 'none';
  tip.style.marginTop = '6px';
  tip.style.padding = '10px';
  tip.style.border = '1px dashed #2b2d3a';
  tip.style.borderRadius = '10px';
  tip.style.background = '#12131a';
  tip.style.color = '#b6b6c3';
  tip.innerHTML = '💡 <strong>Tipp:</strong> írd le <em>kinek</em> készül, <em>milyen alkalomra</em>, stílus/hangulat, 3–5 kulcsszó, 1–2 konkrét emlék, és ha van tiltólista.';
  const anchor = qs('#enz-order-examples', orderPanel) || info;
  anchor.insertAdjacentElement('afterend', tip);

  // minőségértékelés
  const countEl = qs('#enz-count', info);
  const okLabel = qs('#enz-ok-label', info);
  function updateQuality(){
    const len = (desc.value || '').trim().length;
    countEl.textContent = String(len);

    const ok = len >= 120;
    info.classList.toggle('ok', ok);
    info.classList.toggle('too-short', !ok);
    okLabel.textContent = ok ? ' — Elfogadható' : '';
  }
  desc.addEventListener('input', updateQuality);
  updateQuality();

  // Beküldés előtt ellenőrzés – 120 karakter alatt ne engedje
  const form = desc.closest('form');
  form?.addEventListener('submit', (e) => {
    const len = (desc.value || '').trim().length;
    if (len < 120) {
      e.preventDefault();
      alert('A Leírás túl rövid. Kérlek, adj több támpontot (kinek, alkalom, stílus, kulcsszavak, emlékek), hogy személyre szabhassuk a dalt.');
      desc.focus();
    }
  });
}

/* ---------- Order form submit (NO WAIT, NO MODAL) ---------- */
function initOrderForm() {
  const orderForm = qs('#orderForm');
  if (!orderForm) return;

  // ne legyen natív navigáció – fetch küldi
  orderForm.setAttribute('action', 'javascript:void(0)');

  orderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const data = Object.fromEntries(new FormData(orderForm).entries());

    // 🔹 Azonnal elküldjük, de biztonságos "fire-and-forget" módon
    (async () => {
      try {
        await fetch('/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (err) {
        console.error('Order send error (ignored):', err);
      }
    })();

    // 🔹 Azonnali NovaBot visszajelzés
    try {
      if (!(window.NB_NOTIFY_SOURCE === 'generate')) {
        window.novaOrderSuccess && window.novaOrderSuccess();
      }
    } catch (_) {}

    // 🔹 Form ürítés
    orderForm.reset();
  });
}

/* ---------- Contact form submit + thanks overlay (no redirect) ---------- */
function initContactForm() {
  const contactForm   = qs('#contactForm');
  const contactStatus = qs('#contactStatus');
  const overlay       = qs('#thanksOverlay');
  const overlayClose  = qs('#overlayClose');
  if (!contactForm) return;

  // ne navigáljon sehova – a JS küldi fetch-csel
  contactForm.setAttribute('action', 'javascript:void(0)');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (contactStatus) contactStatus.textContent = 'Küldés...';

    const data = Object.fromEntries(new FormData(contactForm).entries());

    try {
      const json = await postJSON('/api/contact', data);
      if (contactStatus) contactStatus.textContent = json.message || 'Köszönjük! Hamarosan válaszolunk.';
      contactForm.reset();
      overlay?.classList.remove('hidden'); // felugró „Köszönjük” kártya
    } catch (err) {
      if (contactStatus) contactStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra később.';
      console.error(err);
    }
  });

  overlayClose?.addEventListener('click', () => overlay?.classList.add('hidden'));
}

/* ---------- Consent bar ---------- */
function initConsent() {
  const bar    = qs('#consent');
  const accept = qs('#consentAccept');
  if (!bar || !accept) return;

  if (localStorage.getItem('enz-consent') === '1') {
    bar.style.display = 'none';
  } else {
    bar.style.display = '';
  }
  accept.addEventListener('click', () => {
    localStorage.setItem('enz-consent', '1');
    bar.style.display = 'none';
  });
}

/* ---------- License modal ---------- */
function initLicenseModal() {
  const modal  = qs('#license-warning');
  const ok     = qs('#licenseAccept');
  const cancel = qs('#licenseCancel');
  if (!modal || !ok || !cancel) return;

  // A tényleges megnyitást az Order submit flow intézi.
  ok.addEventListener('click', () => { /* submit flow kezeli */ });
  cancel.addEventListener('click', () => {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  });
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPackages();
  initHowTo();       // delegált HOWTO→ORDER
  initBriefHelper(); // ha az ORDER aktív lenne induláskor
  initOrderForm();
  initContactForm();
  initConsent();
  initLicenseModal();
});

// Anchor → tab váltás
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-jump]');
  if (!a) return;
  e.preventDefault();
  const target = a.getAttribute('data-jump');
  const btn = document.querySelector(`.vinyl-tabs .tab[data-target="${target}"]`);
  if (btn) {
    btn.click();
    btn.focus();
  }
});

// Köszönjük overlay „intelligens” megjelenítés
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const statusEl = document.getElementById('contactStatus');
  const overlay = document.getElementById('thanksOverlay');
  const closeBtn = document.getElementById('overlayClose');

  if (!overlay) return;

  // 1) Ha a státusz szöveg „elküldve” állapotra vált, felugrik az overlay
  if (statusEl) {
    const obs = new MutationObserver(() => {
      const t = (statusEl.textContent || '').toLowerCase();
      if (t.includes('elküldve') || t.includes('köszönjük')) {
        overlay.classList.remove('hidden');
        overlay.classList.add('show');
      }
    });
    obs.observe(statusEl, { childList: true, subtree: true, characterData: true });
  }

  // 3) Bezárás gomb – overlay eltűnik
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('show');
    });
  }
});

/* Samsung Internet fix – smoothScroll + preventScroll polyfill */
(function() {
  // smooth scroll fallback
  if (!('scrollBehavior' in document.documentElement.style)) {
    window.scrollToSmooth = (opts) => window.scrollTo(0, opts?.top || 0);
  } else {
    window.scrollToSmooth = (opts) => window.scrollTo(opts);
  }

  // preventScroll fix for focus()
  const origFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function(opts) {
    try {
      if (opts && opts.preventScroll) {
        const x = window.scrollX, y = window.scrollY;
        origFocus.call(this);
        window.scrollTo(x, y);
      } else {
        origFocus.call(this, opts);
      }
    } catch {
      origFocus.call(this);
    }
  };
})();
// LOGÓ: a forgást a szülő wrapperre tesszük, az <img> marad fix méretű (tegnapi bevált fix)
document.addEventListener('DOMContentLoaded', () => {
  const logoImg = document.querySelector('.topbar .brand > img.spinning-vinyl, .site-logo img');
  if (!logoImg) return;

  // ha már be van csomagolva, nem csinálunk semmit
  if (logoImg.closest('.spin-wrap')) return;

  // wrapper létrehozása és beillesztése
  const wrap = document.createElement('span');
  wrap.className = 'spin-wrap';
  logoImg.parentNode.insertBefore(wrap, logoImg);
  wrap.appendChild(logoImg);
});
// LOGÓ: wrap + integer px. A lemezekhez NEM nyúlunk.
document.addEventListener('DOMContentLoaded', () => {
  const logoImg = document.querySelector('.topbar .brand > img.spinning-vinyl, .site-logo img');
  if (!logoImg) return;

  // ha már be van csomagolva, ne duplikáljuk
  if (!logoImg.closest('.spin-wrap')) {
    const wrap = document.createElement('span');
    wrap.className = 'spin-wrap';
    logoImg.parentNode.insertBefore(wrap, logoImg);
    wrap.appendChild(logoImg);
  }
  const wrap = logoImg.closest('.spin-wrap');

  // MENÜ lemez aktuális szélességének mérése → integer px (sweet spot)
  const tab = document.querySelector('.vinyl-tabs .tab');
  // fallback: ha nincs tab, használjuk a jelenlegi logo szélességét
  const baseW = tab ? tab.getBoundingClientRect().width : logoImg.getBoundingClientRect().width;
  const size = Math.round(baseW);           // egész px → nem recés
  wrap.style.width  = size + 'px';
  wrap.style.height = size + 'px';

  // biztosan ne forogjon a kép, csak a wrap (felülírjuk inline is)
  logoImg.style.animation = 'none';
  logoImg.style.transform = 'none';
  logoImg.style.width  = '100%';
  logoImg.style.height = '100%';
});
// ORDER "Minta leírások" – futás közben beszúrjuk a szükséges CSS-t
(function injectOrderExamplesStyles(){
  const id = 'order-example-hotfix';
  const old = document.getElementById(id);
  if (old) old.remove();
  const css = `
#order #enz-order-examples .chip,
#order #enz-order-examples .chip * {
  background: #000 !important;
  color: #f3d27a !important;
  -webkit-text-fill-color: #f3d27a !important;
  background-image: none !important;
  -webkit-background-clip: initial !important;
  background-clip: initial !important;
  text-shadow: none !important;
  border: 1px solid #d4af37 !important;
  border-radius: 999px !important;
  padding: 8px 12px !important;
  opacity: 1 !important;
  mix-blend-mode: normal !important;
  text-indent: 0 !important;
  letter-spacing: normal !important;
}
#order #enz-order-examples .chip:hover,
#order #enz-order-examples .chip:focus {
  box-shadow: 0 0 0 2px rgba(243,210,122,.25) inset !important;
  outline: none !important;
}
  `.trim();
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();
// --- HOWTO példák: töltsük fel a hiányzó data-example-öket ---
(function seedHowtoExamples(){
  const map = {
    "Szülinap": "Születésnapra készül a dal a nővéremnek, Nóra 46 éves. Szereti a minimál techno és house zenét. Kulcsszavak: kitartás, logika, barátság, újrakezdés. Emlék: amikor együtt túráztunk a Csóványosra.",
    "Esküvő": "Esküvőre készül a dal, Kata és Máté számára. Stílus: romantikus pop, lassú tempó. Kulcsszavak: hűség, közös jövő, naplemente. Emlék: első közös balatoni nyaralás.",
    "Évforduló": "Évfordulónkra szeretném meglepni a páromat. Közepes tempójú rock-pop, pozitív hangulat. Kulcsszavak: humor, közös főzés, macskánk Mázli. Emlék: amikor megkaptuk az első közös lakás kulcsát.",
    "Búcsúztató": "Búcsúztatóra készül a dal. Méltóságteljes, nyugodt hangulat, kevés dob. Kulcsszavak: hála, fény, emlékek. Emlék: gyerekkori közös zongorázás a nappaliban.",
    "Céges rendezvény": "Céges évzáróra kérek dalt. Tempó: lendületes, modern pop/elektronikus. Kulcsszavak: csapatmunka, innováció, 2025 célok, humor. Emlék: a tavaszi hackathon győzelmünk.",
    "Gyerekdal": "Gyerekdal 6 éves kislánynak, Lilinek. Vidám, egyszerű dallam, könnyen énekelhető refrén. Kulcsszavak: unikornis, szivárvány, ovi-barátok. Emlék: közös biciklizés a parkban.",
    "Nyugdíj": "Nyugdíjba vonuló kollégának. Hangulat: nosztalgikus, felemelő, akusztikus gitár+zongora. Kulcsszavak: segítőkészség, humor, 25 év, csapat. Emlék: a legendás hétfő reggeli kávék.",
    "Jobbulást": "Jobbulást kívánó dal. Lassan építkező, reményt adó hangulat. Kulcsszavak: kitartás, gyógyulás, melletted állunk. Emlék: nyári tábortűz melletti beszélgetések.",
    "Lánykérés": "Lánykéréshez készülő dal. Romantikus pop ballada, meleg hangzás. Kulcsszavak: közös jövő, „igen” pillanat, összetartozás. Emlék: első csók a Margitszigeten.",
    "Ballagás/Diploma": "Ballagásra/diplomához kérünk dalt. Tempó: közepes, motiváló. Kulcsszavak: álom, kitartás, új kezdet. Emlék: éjszakai tanulások és a záróvizsga napja."
  };

  const chips = document.querySelectorAll('#howto .examples .chip');
  chips.forEach(btn => {
    if (!btn.hasAttribute('data-example')) {
      const label = (btn.textContent || '').replace(/^[^\wÁÉÍÓÖŐÚÜŰáéíóöőúüű]+/, '').trim(); // emoji lecsípése
      const key = Object.keys(map).find(k => label.includes(k));
      if (key) btn.setAttribute('data-example', map[key]);
    }
  });
})();
// === ORDER kötelező mezők: Nyelv + Leírás (min 120) – beküldés blokkolása ===
(function hardenOrderValidation(){
  const form = document.getElementById('orderForm');
  if (!form) return;

  const lang = form.querySelector('input[name="language"]');
  const desc = form.querySelector('textarea[name="brief"], textarea#brief, textarea');

  // tegyük kötelezővé natívan is
  if (lang) lang.setAttribute('required', '');
  if (desc) { desc.setAttribute('required', ''); desc.setAttribute('minlength', '120'); }

  // globális, CAPTURE fázisú submit-őr – megelőzi a többi listener működését
  document.addEventListener('submit', function(e){
    if (e.target !== form) return;

    // alaphelyzet: nincs hiba
    if (lang) lang.setCustomValidity('');
    if (desc) desc.setCustomValidity('');

    const missingLang = !lang || !lang.value || !lang.value.trim();
    const briefText   = desc ? (desc.value || '').trim() : '';
    let ok = true;

    if (missingLang){
      ok = false;
      if (lang) lang.setCustomValidity('Kérlek add meg a nyelvet.');
    }
    if (desc && briefText.length < 120){
      ok = false;
      desc.setCustomValidity('Kérlek írj legalább 120 karaktert a leírásba.');
    }

    if (!ok){
      e.preventDefault();
      e.stopPropagation();           // ne fusson le semmilyen másik submit-handler
      form.reportValidity();         // natív buborék/kiemelés
    }
  }, true); // ⬅ capture: igaz
})();

/* [GOLDEN WV PATCH v2] Mark video/sample as ready in WebView to avoid flash */
(function(){
  function arm(el){
    if(!el) return;
    var ready = function(){ el.classList.add('is-ready'); };
    var ifr = el.querySelector('iframe');
    if (ifr){
      var t = setTimeout(ready, 150);
      ifr.addEventListener('load', function(){ clearTimeout(t); ready(); }, {once:true});
    }
    var vid = el.querySelector('video');
    if (vid){
      if (vid.readyState >= 2){ ready(); }
      else {
        var ok = function(){ ready(); vid.removeEventListener('loadeddata', ok); };
        vid.addEventListener('loadeddata', ok);
        setTimeout(ready, 200);
      }
    }
  }
  function init(){
    if (!document.documentElement.classList.contains('ua-webview')) return;
    arm(document.querySelector('.video-panel'));
    arm(document.querySelector('.sample-player'));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
