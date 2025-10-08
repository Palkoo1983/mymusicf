// --- Betöltéskor NE állítsa vissza a böngésző a korábbi görgetési pozíciót ---
(function() {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  // azonnali (nem "smooth") felgörgetés a tetejére
  window.scrollTo(0, 0);
})();
/* Samsung Internet detektálás – csak osztályt rakunk a <html>-re */
(function () {
  if (/SamsungBrowser/i.test(navigator.userAgent)) {
    document.documentElement.classList.add('ua-samsung');
  }
})();

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
      if (desc) {
        desc.placeholder = text;              // CSAK placeholder!
        desc.dispatchEvent(new Event('input', { bubbles: true }));
        try { desc.focus({ preventScroll: true }); } catch(_) {}
      }
    }, 140);
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
      'Születésnapra készül a dal a nővéremnek, Nóra 46 éves. Szereti a minimál techno és house zenét. Kulcsszavak: kitartás, logika, barátság, újrakezdés. Emlék: amikor együtt túráztunk a Csóványosra.',
      'Esküvőre készül a dal, Kata és Máté számára. Stílus: romantikus pop, lassú tempó. Kulcsszavak: hűség, közös jövő, naplemente. Emlék: első közös balatoni nyaralás.',
      'Évfordulónkra szeretném meglepni a páromat. Közepes tempójú rock-pop, pozitív hangulat. Kulcsszavak: humor, közös főzés, macskánk Mázli. Emlék: amikor megkaptuk az első közös lakás kulcsát.',
      'Búcsúztatóra készül a dal. Méltóságteljes, nyugodt hangulat, kevés dob. Kulcsszavak: hála, fény, emlékek. Emlék: gyerekkori közös zongorázás a nappaliban.',
      'Céges évzáróra kérek dalt. Tempó: lendületes, modern pop/elektronikus. Kulcsszavak: csapatmunka, innováció, 2025 célok, humor. Emlék: a tavaszi hackathon győzelmünk.',
      'Gyerekdal 6 éves kislánynak, Lilinek. Vidám, egyszerű dallam, könnyen énekelhető refrén. Kulcsszavak: unikornis, szivárvány, ovi-barátok. Emlék: közös biciklizés a parkban.',
      'Nyugdíjba vonuló kollégának. Hangulat: nosztalgikus, felemelő, akusztikus gitár+zongora. Kulcsszavak: segítőkészség, humor, 25 év, csapat. Emlék: a legendás hétfő reggeli kávék.',
      'Jobbulást kívánó dal. Lassan építkező, reményt adó hangulat. Kulcsszavak: kitartás, gyógyulás, melletted állunk. Emlék: nyári tábortűz melletti beszélgetések.',
      'Lánykéréshez készülő dal. Romantikus pop ballada, meleg hangzás. Kulcsszavak: közös jövő, „igen” pillanat, összetartozás. Emlék: első csók a Margitszigeten.',
      'Ballagásra/diplomához kérünk dalt. Tempó: közepes, motiváló. Kulcsszavak: álom, kitartás, új kezdet. Emlék: éjszakai tanulások és a záróvizsga napja.'
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
  const modal       = qs('#license-warning');
  const acceptBtn   = qs('#licenseAccept');
  const cancelBtn   = qs('#licenseCancel');
  if (!orderForm) return;

  // ne legyen natív navigáció – fetch küldi
  orderForm.setAttribute('action', 'javascript:void(0)');

  async function actuallySend(data) {
    if (orderStatus) orderStatus.textContent = 'Küldés...';
    try {
      const json = await postJSON('/api/order', data);
      if (orderStatus) orderStatus.textContent = json.message || 'Köszönjük! Válasz e-mailt küldtünk.';
      orderForm.reset();
      setTimeout(() => {
        const desc = qs('#order textarea[name="brief"]');
        if (desc) desc.dispatchEvent(new Event('input', { bubbles: true }));
      }, 10);
    } catch (err) {
      if (orderStatus) orderStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra később.';
      console.error(err);
    }
  }

  function showModal(){ if (modal){ modal.style.display='block'; modal.setAttribute('aria-hidden','false'); } }
  function hideModal(){ if (modal){ modal.style.display='none';  modal.setAttribute('aria-hidden','true'); } }

  orderForm.addEventListener('submit', (e) => {
    e.preventDefault(); e.stopPropagation();
    const data = Object.fromEntries(new FormData(orderForm).entries());

    // MINDIG kérdezzünk rá (nincs cookie / localStorage)
    showModal();

    const onAccept = () => {
      hideModal();
      acceptBtn?.removeEventListener('click', onAccept);
      cancelBtn?.removeEventListener('click', onCancel);
      actuallySend(data);
    };
    const onCancel = () => {
      hideModal();
      if (orderStatus) orderStatus.textContent = 'A megrendelést megszakítottad.';
      acceptBtn?.removeEventListener('click', onAccept);
      cancelBtn?.removeEventListener('click', onCancel);
    };

    acceptBtn?.addEventListener('click', onAccept, { once:true });
    cancelBtn?.addEventListener('click', onCancel, { once:true });
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
