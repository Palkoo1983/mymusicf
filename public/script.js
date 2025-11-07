// === UA Detector for Samsung Internet / iPad WebView (Messenger excluded) – Nova 2025-11-03 ===
(function() {
  const ua = navigator.userAgent.toLowerCase();
  const html = document.documentElement;

  const isMessenger = ua.includes('fban/messenger') || ua.includes('fb_iab');

  // Samsung Internet mobil + WebView (Messenger nélkül)
  if ((ua.includes('samsungbrowser') || ua.includes('wv')) && !isMessenger) {
    html.classList.add('ua-samsung');
  }

  // iPad Safari / WebView
  if (ua.includes('ipad') || (ua.includes('macintosh') && 'ontouchend' in document)) {
    html.classList.add('ua-ipad');
  }
})();

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

    const ua = navigator.userAgent.toLowerCase();
    const isSamsungWV = ua.includes('samsungbrowser') || ua.includes('wv');

    const doActivate = () => activate(btn.dataset.target);

    // Samsung Internet / WebView esetén kicsi delay – így nem esik szét
    if (isSamsungWV) {
      setTimeout(() => requestAnimationFrame(doActivate), 80);
    } else {
      doActivate();
    }
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
  'A nővéremnek, Nórának szeretnék születésnapi dalt. 46 éves, és mindig is imádta a táncolós zenéket. Emlékszem, amikor a nappaliban táncoltunk a kedvenc számaira, és mindenki nevetett. Jó lenne, ha a dalban benne lenne az a nyári este is, amikor együtt túráztunk a Csóványoson, és végignevettük az éjszakát.',
  
  'Kata és Máté esküvőjére szeretnék egy romantikus dalt. Az első közös balatoni nyaralásukon ismerkedtek meg igazán, amikor eláztak a viharban, de táncoltak a parton. A lánykérés Toszkánában volt, naplementében, a dombtetőn — ezt az érzést szeretném viszont hallani a dalban.',
  
  'A házassági évfordulónkra szeretném meglepni a férjemet, Bencét, egy dallal. Az első randinkon eltévedtünk a Városligetben, és a padon ettük meg a fagyit nevetve. A másik emlék, amikor a lakásfelújítás közben pizzát ettünk a padlón ülve, és sírtunk a nevetéstől.',
  
  'Egy búcsúztatóra szeretnék dalt a kollégánknak, Zolinak, aki mindig összetartotta a csapatot. Egyszer, amikor elromlott a nyomtató, ő oldotta meg egy gémkapoccsal és kávéval. A másik pillanat, amikor karácsony előtt mindenkinek sütit hozott, és a legnagyobb nevetése volt az irodában.',
  
  'A munkahelyi évzárónkra kérek egy dalt a csapatunknak, amit András vezet. Volt egy közös projektünk, ahol éjszakába nyúlóan dolgoztunk, de közben zenét hallgattunk és táncoltunk. A másik emlék, amikor megnyertük a céges versenyt, és pezsgővel öntöttük le a főnököt – ez a mi kis legendánk.',
  
  'A kislányomnak, Lilinek szeretnék születésnapi dalt. Minden reggel a tükör előtt táncol a hajkefével a kezében, és saját dalt énekel. A másik kedvenc történetünk, amikor a parkban elesett a biciklivel, de felállt és azt mondta: „Semmi baj, anya, a hősök nem sírnak!”',
  
  'Egy nyugdíjba vonuló kollégának, Ferinek kérek dalt. Ő volt az, aki minden hétfő reggel kávét vitt mindenkinek, és mindig azt mondta: „Ez is csak egy új kezdet.” Egyszer a céges kiránduláson ő szervezte meg a karaoke estét, és senki nem felejti el, ahogy Elvis Presley-t énekelt.',
  
  'A barátnőmnek, Eszternek szeretnék jobbulást kívánni egy dallal. Amikor a kórházban volt, nevetve mondta, hogy ha jobban lesz, elmegyünk táncolni, mint régen. A másik emlék, amikor eltévedtünk a Balaton-felvidéken, de az volt az egyik legszebb napunk – szeretném, ha a dal erőt adna neki.',
  
  'A lánykérésemhez szeretnék dalt, mert Párizsban fogom megkérni Anna kezét az Eiffel-torony előtt. Az első közös utunk is ide vezetett, akkor még csak barátok voltunk. A másik pillanat, amikor először táncoltunk az esőben a Montmartre lépcsőin – ez biztosan beleillene a dalba.',
  
  'A fiamnak, Tamásnak kérek dalt a diplomaosztójára. Emlékszem, ahogy éjszakákon át tanult a konyhaasztalnál, és kávéval próbált ébren maradni. A másik pillanat, amit megőriztem, amikor gyerekként azt mondta: „Anya, egyszer nagy ember leszek” — és most tényleg az lett.'
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

/* ---------- Order form submit (ALWAYS show license modal) ---------- */
function initOrderForm() {
  const orderForm   = qs('#orderForm');
  const orderStatus = qs('#orderStatus');
  if (!orderForm) return;

  // ne legyen natív navigáció – fetch küldi
  orderForm.setAttribute('action', 'javascript:void(0)');

  async function actuallySend(data) {
    if (orderStatus) orderStatus.textContent = 'Küldés...';
    try {
      const json = await postJSON('/api/order', data);
      if (orderStatus) { orderStatus.textContent = ''; orderStatus.style.display = 'none'; }
      orderForm.reset();
      // ✅ NOVABOT: SIKER
      try { if (!(window.NB_NOTIFY_SOURCE === 'generate')) { window.novaOrderSuccess && window.novaOrderSuccess(); } } catch(_){}
      setTimeout(() => {
        const desc = qs('#order textarea[name="brief"]');
        if (desc) desc.dispatchEvent(new Event('input', { bubbles: true }));
      }, 10);
    } catch (err) {
      if (orderStatus) orderStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra később.';
      console.error(err);
      // ✅ NOVABOT: HIBA
      try { if (!(window.NB_NOTIFY_SOURCE === 'generate')) { window.novaOrderFail && window.novaOrderFail(); } } catch(_){}
    }
  }

  function showModal(){ if (modal){ modal.style.display='block'; modal.setAttribute('aria-hidden','false'); } }
  function hideModal(){ if (modal){ modal.style.display='none';  modal.setAttribute('aria-hidden','true'); } }

  orderForm.addEventListener('submit', (e) => {
    e.preventDefault(); e.stopPropagation();
    const data = Object.fromEntries(new FormData(orderForm).entries());
const delivLabel = document.querySelector('input[name="delivery_label"]');
if (delivLabel) data.delivery_label = delivLabel.value;

    // MINDIG kérdezzünk rá (nincs cookie / localStorage)
    showModal();

    const onAccept = () => {
  hideModal();

  // 🟡 Frissítsük a kézbesítési címkét a legutóbbi gombnyomás után
  const delivLabel = document.querySelector('input[name="delivery_label"]');
  if (delivLabel) data.delivery_label = delivLabel.value || '';

  acceptBtn?.removeEventListener('click', onAccept);
  cancelBtn?.removeEventListener('click', onCancel);
  actuallySend(data);
};

    const onCancel = () => {
      hideModal();
      if (orderStatus) orderStatus.textContent = 'A megrendelést megszakítottad.';
      acceptBtn?.removeEventListener('click', onAccept);
      cancelBtn?.removeEventListener('click', onCancel);
      // ✅ NOVABOT: FELTÉTEL ELUTASÍTVA → HIBA üzenet
      try { if (!(window.NB_NOTIFY_SOURCE === 'generate')) { window.novaOrderFail && window.novaOrderFail(); } } catch(_){}
    };

    acceptBtn?.addEventListener('click', onAccept, { once:true });
    cancelBtn?.addEventListener('click', onCancel, { once:true });
  });
}
// === Kézbesítési opciók kiválasztása + árfrissítés a Megrendelés gombon (javított delegált verzió) ===
document.addEventListener('DOMContentLoaded', () => {
  const container   = document.querySelector('.delivery-buttons');
  const hiddenExtra = document.querySelector('input[name="delivery_extra"]');
  const hiddenLabel = document.querySelector('input[name="delivery_label"]');
  const pkgSel      = document.querySelector('select[name="package"]');
  const submitBtn   = document.querySelector('#orderForm button[type="submit"], #orderForm .primary');

  if (!container || !pkgSel || !submitBtn || !hiddenExtra) return;

  // Alapárak (Ft)
  const basePrices = {
    basic: 10500,   // MP3
    video: 21000,   // MP4
    premium: 35000  // WAV
  };

  const formatFt = (n) => (Number(n)||0).toLocaleString('hu-HU') + ' Ft';

  function updatePriceLabel() {
    const pkg   = pkgSel.value;
    const extra = parseInt(hiddenExtra.value || '0', 10);
    const base  = basePrices[pkg] || 0;
    const total = base + extra;

    submitBtn.style.transition = 'opacity 0.25s ease';
    submitBtn.style.opacity = '0';
    setTimeout(() => {
      submitBtn.innerHTML = `<span class="gold-text">Megrendelés – ${formatFt(total)}</span>`;
      submitBtn.style.opacity = '1';
      submitBtn.classList.remove('price-update');
      void submitBtn.offsetWidth; // force reflow
      submitBtn.classList.add('price-update');
    }, 200);
  }

  function setActive(btn) {
    container.querySelectorAll('.delivery-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    hiddenExtra.value = btn.dataset.extra || '0';
    if (hiddenLabel) hiddenLabel.value = (btn.textContent || '').trim();
    updatePriceLabel();
  }

  // Alapértelmezett (48h)
  const defaultBtn = container.querySelector('.delivery-btn[data-extra="0"]');
  if (defaultBtn) setActive(defaultBtn);
  else updatePriceLabel();

  // Delegált eseménykezelő – garantáltan csak egy gomb aktív marad
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.delivery-btn');
    if (!btn || !container.contains(btn)) return;
    e.preventDefault();
    setActive(btn);
  });

  // Csomagváltáskor újraszámolás
  pkgSel.addEventListener('change', updatePriceLabel);
});

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

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPackages();
  initHowTo();       // delegált HOWTO→ORDER
  initBriefHelper(); // ha az ORDER aktív lenne induláskor
  initOrderForm();
  initContactForm();
  initConsent();
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
  "Szülinap": "A nővéremnek, Nórának szeretnék születésnapi dalt. 46 éves, mindig is imádta a táncolós zenéket. Emlékszem, amikor a nappaliban táncoltunk a régi kedvenc számaira, és mindenki nevetett. Jó lenne, ha a dalban benne lenne az a nyári este is, amikor együtt túráztunk a Csóványoson, és végignevettük az éjszakát.",
  
  "Esküvő": "Kata és Máté esküvőjére kérek egy romantikus dalt. Az első közös balatoni nyaralásukon ismerkedtek meg igazán, amikor eláztak egy viharban, de táncoltak a parton. A lánykérés Toszkánában volt, naplementében, a dombtetőn — ezt a pillanatot szeretném viszont hallani a dalban.",
  
  "Évforduló": "A házassági évfordulónkra szeretnék dalt a férjemnek, Bencének. Az első randinkon eltévedtünk a Városligetben, és a padon ettük meg a fagyit nevetve. A másik emlék, amikor a lakásfelújítás közben pizzát ettünk a padlón ülve, és sírtunk a nevetéstől.",
  
  "Búcsúztató": "Egy búcsúztatóra szeretnék dalt a kollégánknak, Zolinak, aki mindig összetartotta a csapatot. Egyszer, amikor elromlott a nyomtató, ő oldotta meg egy gémkapoccsal és kávéval. A másik pillanat, amikor karácsony előtt mindenkinek sütit hozott, és a legnagyobb nevetése volt az irodában.",
  
  "Céges rendezvény": "A munkahelyi évzárónkra kérek dalt a csapatunknak, amit András vezet. Volt egy közös projektünk, ahol éjszakába nyúlóan dolgoztunk, de közben zenét hallgattunk és táncoltunk. A másik emlék, amikor megnyertük a céges versenyt, és pezsgővel öntöttük le a főnököt – ez a mi kis legendánk.",
  
  "Gyerekdal": "A kislányomnak, Lilinek szeretnék születésnapi dalt. Minden reggel a tükör előtt táncol a hajkefével a kezében, és saját dalt énekel. A másik kedvenc történetünk, amikor a parkban elesett a biciklivel, de felállt és azt mondta: ‘Semmi baj, anya, a hősök nem sírnak!’",
  
  "Nyugdíj": "Egy nyugdíjba vonuló kollégának, Ferinek kérek dalt. Ő volt az, aki minden hétfő reggel kávét vitt mindenkinek, és mindig azt mondta: ‘Ez is csak egy új kezdet.’ Egyszer a céges kiránduláson ő szervezte meg a karaoke estét, és senki nem felejti el, ahogy Elvis Presley-t énekelt.",
  
  "Jobbulást": "A barátnőmnek, Eszternek szeretnék jobbulást kívánni egy dallal. Amikor a kórházban volt, nevetve mondta, hogy ha jobban lesz, elmegyünk táncolni, mint régen. A másik emlék, amikor eltévedtünk a Balaton-felvidéken, de az volt az egyik legszebb napunk – szeretném, ha a dal erőt adna neki.",
  
  "Lánykérés": "A lánykérésemhez szeretnék dalt, mert Párizsban fogom megkérni Anna kezét az Eiffel-torony előtt. Az első közös utunk is ide vezetett, akkor még csak barátok voltunk. A másik pillanat, amikor először táncoltunk az esőben a Montmartre lépcsőin – ez biztosan beleillene a dalba.",
  
  "Ballagás/Diploma": "A fiamnak, Tamásnak kérek dalt a diplomaosztójára. Emlékszem, ahogy éjszakákon át tanult a konyhaasztalnál, és kávéval próbált ébren maradni. A másik pillanat, amit megőriztem, amikor gyerekként azt mondta: ‘Anya, egyszer nagy ember leszek’ — és most tényleg az lett."
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
  if (desc) { desc.setAttribute('required', ''); desc.setAttribute('minlength', '120'); desc.setAttribute('maxlength', '4000'); }

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
// === NovaBot fallback – stabil végleges verzió ===
document.addEventListener('DOMContentLoaded', () => {
  const bar = document.getElementById('nv-tts-fallback');
  if (!bar) return;

  // ha van TTS (speechSynthesis), akkor ne mutassa
  const hasTTS = !!(window.speechSynthesis && typeof speechSynthesis.speak === 'function');
  bar.style.display = hasTTS ? 'none' : 'block';

  // --- Gombok ---
  const open = document.getElementById('nv-open-browser');
  const mute = document.getElementById('nv-silent');

  // Chrome intent Samsungból → Chrome megnyitás
 open?.addEventListener('click', (e) => {
  e.preventDefault();
  const target = window.location.href.replace(/^https?:\/\//, '');
  window.location.href = `intent://${target}#Intent;scheme=https;package=com.android.chrome;end`;
});

  // Néma mód → elrejtés
  mute?.addEventListener('click', () => {
    bar.style.display = 'none';
  });
});
// === Árkijelzés animáció – Nova 2025-11-04 ===
document.addEventListener('DOMContentLoaded', () => {
  const orderBtn = document.querySelector('.primary[type="submit"], .form .primary');
  if (!orderBtn) return;

  // kis fényes pulzálás árfrissítéskor
  const animatePrice = () => {
    orderBtn.classList.add('price-update');
    setTimeout(() => orderBtn.classList.remove('price-update'), 600);
  };

  // ha valaki kézbesítési opcióra kattint
  const deliveryButtons = document.querySelectorAll('.delivery-btn');
  deliveryButtons.forEach(btn => {
    btn.addEventListener('click', animatePrice);
  });

  // ha valaki csomagot vált
  const pkgSelect = document.querySelector('select[name="package"]');
  if (pkgSelect) pkgSelect.addEventListener('change', animatePrice);
});
// === Megrendelés-gombhoz finom görgetés, hogy látszódjon az animáció ===
document.addEventListener('DOMContentLoaded', () => {
  const orderBtn = document.querySelector('.primary[type="submit"], .form .primary');
  if (!orderBtn) return;

  function scrollToOrderBtn() {
    const rect = orderBtn.getBoundingClientRect();
    const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!visible) {
      orderBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  const deliveryButtons = document.querySelectorAll('.delivery-btn');
  const pkgSelect = document.querySelector('select[name="package"]');

  deliveryButtons.forEach(btn => {
    btn.addEventListener('click', scrollToOrderBtn);
  });
  if (pkgSelect) pkgSelect.addEventListener('change', scrollToOrderBtn);
});
