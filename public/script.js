/* =========================================================
   EnZenem – main script (FULL REPLACEMENT)
   - Tab navigation (vinyl-tabs)
   - Package card selection
   - HOWTO -> ORDER focus + example chips
   - Brief helper (counter + quality, NO DUPLICATES) + examples on ORDER
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
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- tabs ---------- */
function initTabs() {
  const buttons = qsa('.tab');
  const panels  = qsa('main .panel');

  function activate(targetId) {
    if (!targetId) return;
    panels.forEach(p => {
      const on = (p.id === targetId);
      p.hidden = !on;
      p.classList.toggle('active', on);
    });
    buttons.forEach(b => {
      const on = b.dataset.target === targetId;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('active', on);
    });
    if (targetId === 'order') setTimeout(initBriefHelper, 50);
  }
function activate(targetId) {
  if (!targetId) return;
  // ... a meglévő kódod ...
  if (targetId === 'order') setTimeout(initBriefHelper, 50);

  // >>> ÚJ: mindig a tetejére gördítünk
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
  // initial
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
  setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });   // <<< ÚJ
    focusBrief();
  }, 80);
});


  // Példachipek a HOWTO panelen
 qsa('#howto .chip[data-example]').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.getAttribute('data-example') || '';
    orderTabBtn?.click();
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' }); // <<< ÚJ
      const desc = qs('#order textarea[name="brief"], #order textarea#brief, #order textarea');
      if (desc) {
        desc.value = text;
        desc.dispatchEvent(new Event('input', { bubbles: true }));
        desc.focus();
      }
    }, 80);
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
      b.addEventListener('click', () => {
        desc.value = t;
        desc.dispatchEvent(new Event('input', { bubbles: true }));
        desc.focus();
      });
      exWrap.appendChild(b);
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

/* ---------- Order form submit ---------- */
/* ---------- Order form submit (with license gate) ---------- */
function initOrderForm() {
  const orderForm   = qs('#orderForm');
  const orderStatus = qs('#orderStatus');
  const modal       = qs('#license-warning');
  const acceptBtn   = qs('#licenseAccept');
  const cancelBtn   = qs('#licenseCancel');

  if (!orderForm) return;

  // Segédfüggvény: tényleges elküldés
  async function actuallySend(data) {
    if (orderStatus) orderStatus.textContent = 'Küldés...';
    try {
      const json = await postJSON('/api/order', data);
      if (orderStatus) orderStatus.textContent = json.message || 'Köszönjük! Válasz e-mailt küldtünk.';
      orderForm.reset();
      // brief helper újraszámolás (lenullázás)
      setTimeout(() => {
        const desc = qs('#order textarea[name="brief"]');
        if (desc) desc.dispatchEvent(new Event('input', { bubbles: true }));
      }, 10);
    } catch (err) {
      if (orderStatus) orderStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra később.';
      console.error(err);
    }
  }

  // Modál megjelenítése/elrejtése
  function showModal() {
    if (!modal) return;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
  }
  function hideModal() {
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  // Submit-kezelő – előbb licenc elfogadás, aztán küldés
  orderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(orderForm).entries());

    // Ha már elfogadta korábban, mehet egyből
    if (localStorage.getItem('enz-license-ok') === '1') {
      actuallySend(data);
      return;
    }

    // Különben: mutassuk a modált, és várjuk a döntést
    showModal();

    // egyszeri elfogadás → mentés + küldés
    const onAccept = () => {
      localStorage.setItem('enz-license-ok', '1');
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

    acceptBtn?.addEventListener('click', onAccept, { once: true });
    cancelBtn?.addEventListener('click', onCancel, { once: true });
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

/* ---------- License modal (optional direct open/close wiring) ---------- */
function initLicenseModal() {
  const modal  = qs('#license-warning');
  const ok     = qs('#licenseAccept');
  const cancel = qs('#licenseCancel');
  if (!modal || !ok || !cancel) return;

  // Ha valahol külön gombbal akarod megnyitni a modált, teheted:
  // qs('#openLicense')?.addEventListener('click', () => {
  //   modal.style.display = 'block';
  //   modal.setAttribute('aria-hidden', 'false');
  // });

  // A bezárást a submit-flow intézi; itt fallbackként is lezárható:
  ok.addEventListener('click', () => { /* a submit flow kezeli a küldést */ });
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
