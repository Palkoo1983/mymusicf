const tabs = document.querySelectorAll('.vinyl-tabs .tab');
const panels = document.querySelectorAll('section.panel');
function showPanel(id){
  panels.forEach(p=>p.classList.toggle('active', p.id===id));
  tabs.forEach(t=>t.classList.toggle('active', t.dataset.target===id));
  document.querySelector('main').scrollIntoView({behavior:'smooth', block:'start'});
}
tabs.forEach(btn=>btn.addEventListener('click', ()=> showPanel(btn.dataset.target)));
showPanel('intro');

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
