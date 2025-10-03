/* =========================================================
   EnZenem – main script (FULL REPLACEMENT)
   - Tab navigation (vinyl-tabs)
   - Package card selection
   - HOWTO -> ORDER focus + example chips
   - Brief helper (counter + quality, NO DUPLICATES)
   - Order & Contact form submit (fetch JSON)
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

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/* ---------- tabs ---------- */
function initTabs() {
  const buttons = qsa('.tab');
  const panels  = qsa('main .panel');

  function activate(targetId) {
    panels.forEach(p => {
      if (p.id === targetId) {
        p.hidden = false;
        p.classList.add('active');
      } else {
        p.hidden = true;
        p.classList.remove('active');
      }
    });
    // aktív állapot a gombokon
    buttons.forEach(b => {
      const on = b.dataset.target === targetId;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('active', on);
    });
    // megrendelésre lépéskor inicializáljuk a brief helper-t (guard miatt nem dupláz)
    if (targetId === 'order') setTimeout(initBriefHelper, 50);
  }

  // kezdeti: hagyjuk, amit a HTML jelöl 'active'-ként; ha nincs, az első tab
  const activePanel = panels.find(p => p.classList.contains('active')) || panels[0];
  panels.forEach(p => (p.hidden = p !== activePanel));
  buttons.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.target));
  });
}

/* ---------- package cards (pricing) ---------- */
function initPackages() {
  const cards = qsa('.card.package');
  const orderTabBtn = qs('.tab[data-target="order"]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      // vizuálisan kijelölhető, ha szükséges
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      // Megrendelés fülre ugrás és csomag beállítás
      const pkg = card.getAttribute('data-package'); // mp3/mp4/wav
      orderTabBtn?.click();
      setTimeout(() => {
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

/* ---------- HOWTO -> ORDER, example chips ---------- */
function initHowTo() {
  const openBtn     = qs('#howto-open-order');
  const orderTabBtn = qs('.tab[data-target="order"]');

  function focusBrief() {
    const el = qs('#order textarea[name="brief"], #order textarea#brief, #order textarea');
    if (el) el.focus();
  }

  openBtn?.addEventListener('click', () => {
    orderTabBtn?.click();
    setTimeout(focusBrief, 80);
  });

  // Példachipek a HOWTO panelen
  qsa('#howto .chip[data-example]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-example') || '';
      orderTabBtn?.click();
      setTimeout(() => {
        const desc = qs('#order textarea[name="brief"], #order textarea#brief, #order textarea');
        if (desc) {
          desc.value = text;
          desc.dispatchEvent(new Event('input', { bubbles: true }));
          desc.focus();
        }
      }, 80);
    });
  });
}

/* ---------- Leírás helper az ORDER panelen (no duplicates) ---------- */
// === Leírás-segéd az ORDER panelen (counter + minőség + példák, duplázás nélkül) ===
function initBriefHelper() {
  const orderPanel = qs('#order');
  if (!orderPanel) return;

  // ha már létrejött, NE szúrjuk be még egyszer
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

  // === Minta leírások – ORDER panelre (dupla ellen védve) ===
  if (!qs('#enz-order-examples', orderPanel)) {
    const exWrap = document.createElement('div');
    exWrap.id = 'enz-order-examples';
    exWrap.style.display = 'flex';
    exWrap.style.flexWrap = 'wrap';
    exWrap.style.gap = '8px';
    exWrap.style.marginTop = '8px';

    // >>> Itt a BŐVÍTETT példalista <<<
    const examples = [
      // Szülinap
      'Születésnapra készül a dal a nővéremnek, Nóra 46 éves. Szereti a minimál techno és house zenét. Kulcsszavak: kitartás, logika, barátság, újrakezdés. Emlék: amikor együtt túráztunk a Csóványosra.',
      // Esküvő
      'Esküvőre készül a dal, Kata és Máté számára. Stílus: romantikus pop, lassú tempó. Kulcsszavak: hűség, közös jövő, naplemente. Emlék: első közös balatoni nyaralás.',
      // Évforduló
      'Évfordulónkra szeretném meglepni a páromat. Közepes tempójú rock-pop, pozitív hangulat. Kulcsszavak: humor, közös főzés, macskánk Mázli. Emlék: amikor megkaptuk az első közös lakás kulcsát.',
      // Búcsúztató
      'Búcsúztatóra készül a dal. Méltóságteljes, nyugodt hangulat, kevés dob. Kulcsszavak: hála, fény, emlékek. Emlék: gyerekkori közös zongorázás a nappaliban.',
      // Céges rendezvény
      'Céges évzáróra kérek dalt. Tempó: lendületes, modern pop/elektronikus. Kulcsszavak: csapatmunka, innováció, 2025 célok, humor. Emlék: a tavaszi hackathon győzelmünk.',
      // Gyerekdal
      'Gyerekdal 6 éves kislánynak, Lilinek. Vidám, egyszerű dallam, könnyen énekelhető refrén. Kulcsszavak: unikornis, szivárvány, ovi-barátok. Emlék: közös biciklizés a parkban.',
      // Nyugdíjba vonulás
      'Nyugdíjba vonuló kollégának. Hangulat: nosztalgikus, felemelő, akusztikus gitár+zongora. Kulcsszavak: segítőkészség, humor, 25 év, csapat. Emlék: a legendás hétfő reggeli kávék.',
      // Jobbulást / támogatás
      'Jobbulást kívánó dal. Lassan építkező, reményt adó hangulat. Kulcsszavak: kitartás, gyógyulás, melletted állunk. Emlék: nyári tábortűz melletti beszélgetések.',
      // Lánykérés / jegyesség
      'Lánykéréshez készülő dal. Romantikus pop ballada, meleg hangzás. Kulcsszavak: közös jövő, „igen” pillanat, összetartozás. Emlék: első csók a Margitszigeten.',
      // Ballagás / diploma
      'Ballagásra/diplomához kérünk dalt. Tempó: közepes, motiváló. Kulcsszavak: álom, kitartás, új kezdet. Emlék: éjszakai tanulások és a záróvizsga napja.'
    ];

    // (opcionális) kis cím
    const exTitle = document.createElement('div');
    exTitle.textContent = 'Minta leírások:';
    exTitle.style.marginTop = '10px';
    exTitle.style.fontSize = '13px';
    exTitle.style.color = '#b6b6c3';
    info.insertAdjacentElement('afterend', exTitle);

    // chip-ek
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
      b.addEventListener('click', () => {
        desc.value = t;
        desc.dispatchEvent(new Event('input', { bubbles: true }));
        desc.focus();
      });
      exWrap.appendChild(b);
    });

    exTitle.insertAdjacentElement('afterend', exWrap);
  }
  // === /Minta leírások ===

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

  // Beküldés előtt ellenőrzés – 120 karakter alatt ne engedjük
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

/* ---------- Order form submit ---------- */
function initOrderForm() {
  const orderForm   = qs('#orderForm');
  const orderStatus = qs('#orderStatus');
  if (!orderForm) return;

  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    orderStatus.textContent = 'Küldés...';

    const data = Object.fromEntries(new FormData(orderForm).entries());

    try {
      const json = await postJSON('/api/order', data);
      orderStatus.textContent = json.message || 'Köszönjük! Válasz e-mailt küldtünk.';
      orderForm.reset();

      // brief helper újraszámolás (lenullázás)
      setTimeout(() => {
        const desc = qs('#order textarea[name="brief"]');
        if (desc) desc.dispatchEvent(new Event('input', { bubbles: true }));
      }, 10);
    } catch (err) {
      orderStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra később.';
      console.error(err);
    }
  });
}

/* ---------- Contact form submit + thanks overlay ---------- */
function initContactForm() {
  const contactForm   = qs('#contactForm');
  const contactStatus = qs('#contactStatus');
  const overlay       = qs('#thanksOverlay');
  const overlayClose  = qs('#overlayClose');

  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (contactStatus) contactStatus.textContent = 'Küldés...';

      const data = Object.fromEntries(new FormData(contactForm).entries());
      try {
        const json = await postJSON('/api/contact', data);
        if (contactStatus) contactStatus.textContent = json.message || 'Köszönjük! Hamarosan válaszolunk.';
        contactForm.reset();
        overlay?.classList.remove('hidden');
      } catch (err) {
        if (contactStatus) contactStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra később.';
        console.error(err);
      }
    });
  }
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

  // csak példának: a Megrendelés panel megnyitásakor villanthatnánk
  // itt most manuálisan vezérelt (gombok zárnak/nyitnak)
  ok.addEventListener('click', () => { modal.setAttribute('aria-hidden', 'true'); modal.style.display = 'none'; });
  cancel.addEventListener('click', () => { modal.setAttribute('aria-hidden', 'true'); modal.style.display = 'none'; });
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
