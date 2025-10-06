(function(){ if (/SamsungBrowser/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('ua-samsung');
}})();
/* Samsung Internet detektálás – csak osztályt rakunk a <html>-re */
(function () {
  if (/SamsungBrowser/i.test(navigator.userAgent)) {
    document.documentElement.classList.add('ua-samsung');
  }
})();
/* =========================================================
   EnZenem – main script (FULL REPLACEMENT)
   - Tab navigation (vinyl-tabs) + scroll to top
   - Package card selection
   - HOWTO -> ORDER focus + example chips (scroll to top)
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

  // ha épp egy másik elem (pl. YouTube gomb) van fókuszban, engedjük el
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  panels.forEach(p => {
    const on = (p.id === targetId);
    p.hidden = !on;
    p.classList.toggle('active', on);
    // a rejtett paneleket tegyük „inert”-té, így nem kaphatnak fókuszt
    if (on) p.removeAttribute('inert');
    else    p.setAttribute('inert', '');
  });

  buttons.forEach(b => {
    const on = (b.dataset.target === targetId);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('active', on);
  });

  if (targetId === 'order') setTimeout(initBriefHelper, 50);

  // fókuszt rakjunk az új panel címsorára a hozzáférhetőség miatt
  const active = panels.find(p => p.id === targetId);
  const h2 = active && active.querySelector('h2');
  if (h2) {
    h2.setAttribute('tabindex', '-1');
    h2.focus();
  }

  // mindig a lap tetejére gördítünk
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

/* ---------- HOWTO -> ORDER, example chips (PLACEHOLDER ONLY) ---------- */
function initHowTo() {
  const openBtn     = qs('#howto-open-order');
  const orderTabBtn = qs('.tab[data-target="order"]');

  function gotoOrderAndFocus() {
    orderTabBtn?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const el = qs('#order textarea[name="brief"], #order textarea#brief, #order textarea');
      if (el && el.focus) { try { el.focus({ preventScroll: true }); } catch(_) {} }
    }, 120);
  }

  // "Hogyan működik" gomb -> Megrendelés tetejére
  openBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    gotoOrderAndFocus();
  });

  // Példa-chipek a HOWTO panelen -> CSAK PLACEHOLDER, NE VALUE
  qsa('#howto .chip[data-example]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const text = btn.getAttribute('data-example') || '';
      orderTabBtn?.click();

      // azonnal fel
      window.scrollTo({ top: 0, behavior: 'smooth' });

      setTimeout(() => {
        const desc = qs('#order textarea[name="brief"], #order textarea#brief, #order textarea');
        if (desc) {
          desc.value = '';                 // üres érték marad
          desc.placeholder = text;         // csak halvány minta
          desc.dispatchEvent(new Event('input', { bubbles: true }));
          try { desc.focus({ preventScroll: true }); } catch(_) {}
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 120);
    });
  });
}

 // Példa-chipek a HOWTO panelen -> CSAK PLACEHOLDER, NE VALUE
qsa('#howto .chip[data-example]').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.getAttribute('data-example') || '';
    const orderTabBtn = qs('.tab[data-target="order"]');
    orderTabBtn?.click();

    // azonnal felgörgetünk
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setTimeout(() => {
      const desc = qs('#order textarea[name="brief"], #order textarea#brief, #order textarea');
      if (desc) {
       // ÚJ
desc.value = '';                    // üres érték marad
desc.placeholder = text;            // csak halvány minta
desc.dispatchEvent(new Event('input', { bubbles: true }));
try { desc.focus({ preventScroll: true }); } catch(_) {}

      }
      // biztos, ami biztos – fent maradunk
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 120); // maradhat a 120ms késleltetés, de már placeholdert állít
  });
});


/* ---------- Leírás helper az ORDER panelen (no duplicates) + példák ---------- */
function initBriefHelper() {
  const orderPanel = qs('#order');
  if (!orderPanel) return;

  // guard: ha már létrehoztuk, kilépünk
  if (qs('#enz-quality', orderPanel)) return;

  const desc = qs('textarea[name="brief"], textarea#brief, textarea', orderPanel);
  if (!desc) return;

  // infó sor
  const info = document.createElement('div');
  info.id = 'enz-quality';
  info.style.fontSize = '12px';
  info.style.marginTop = '6px';
  info.style.color = '#b6b6c3';
  info.innerHTML = '<span id="enz-count">0</span> karakter • <strong id="enz-score">Túl rövid</strong>';
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
      // ÚJ
      b.addEventListener('click', () => {
  desc.value = '';               // üresen hagyjuk
  desc.placeholder = t;          // csak minta (placeholder)
  desc.dispatchEvent(new Event('input', { bubbles: true }));
  try { desc.focus({ preventScroll: true }); } catch(_) {}
});
    exTitle.insertAdjacentElement('afterend', exWrap);
  }

  // tipp doboz
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
  const scoreEl = qs('#enz-score', info);
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
  // Itt csak fallback bezárás marad:
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
  initHowTo();
  initBriefHelper();   // ha már az ORDER aktív lenne induláskor
  initOrderForm();
  initContactForm();
  initConsent();
  initLicenseModal();
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-jump]');
  if (!a) return;
  e.preventDefault();
  const target = a.getAttribute('data-jump');
  const btn = document.querySelector(`.vinyl-tabs .tab[data-target="${target}"]`);
  if (btn) {
    btn.click();      // aktiválja a panelt (a te tab-logikád szerint)
    btn.focus();      // fókusz a hozzáférhetőségért
  }
});
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const statusEl = document.getElementById('contactStatus');
  const overlay = document.getElementById('thanksOverlay');
  const closeBtn = document.getElementById('overlayClose');

  if (!overlay) return;

  // 1) Ha a státusz szöveg "elküldve" állapotra vált, felugrik az overlay
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

  // 2) Biztos, ami biztos: form submitre is feljegyzünk egy "várakozó" állapotot
  if (form) {
    form.addEventListener('submit', () => {
      // itt NEM állítjuk meg a saját küldési logikádat;
      // az overlay végül a státusz üzenet alapján fog megjelenni
    });
  }

  // 3) Bezárás gomb – overlay eltűnik, az oldalon maradunk
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
// Példachip → csak PLACEHOLDER, ne valódi érték
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip[data-example]");
  if (!chip) return;

  const example = chip.dataset.example || "";
  const brief = document.querySelector('#orderForm textarea[name="brief"]');

  if (!brief) return;

  // csak minta: ne legyen tényleges tartalom
  brief.value = "";                       // kiürítjük, ha bármi volt benne
  brief.placeholder = example;            // halvány “minta” a háttérben

  // ha a chip nem a Megrendelés panelen van, nyissuk meg azt, és fókusz
  const orderTab = document.querySelector('.tab[data-target="order"]');
  if (orderTab) orderTab.click();
  setTimeout(() => brief.focus(), 50);
});
