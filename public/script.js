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
// ---- Megrendelésre irányítás az árkártyákról ----
(function () {
  const cards = document.querySelectorAll('.card.package');
  if (!cards.length) return;

  function showOrderPanel() {
    const orderPanel = document.getElementById('megrendeles') || document.getElementById('order');
    if (!orderPanel) return;

    // panelek
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    orderPanel.classList.add('active');

    // tabok
    const tabs = document.querySelectorAll('.vinyl-tabs .tab');
    tabs.forEach(t => t.classList.remove('active'));
    const orderTab = Array.from(tabs).find(t => /megrendel/i.test(t.textContent));
    if (orderTab) orderTab.classList.add('active');

    // tetejére
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return orderPanel;
  }

  function setFormat(orderPanel, pkg) {
    if (!orderPanel) return;

    // select alapú mező
    const sel = orderPanel.querySelector('select[name="format"], #format');
    if (sel) {
      const want = pkg.toLowerCase();
      const opt = Array.from(sel.options).find(o =>
        o.value.toLowerCase() === want || o.text.toLowerCase() === want
      );
      if (opt) sel.value = opt.value;
    }

    // radio alapú mező
    const radio =
      orderPanel.querySelector(`input[type="radio"][name="format"][value="${pkg}"]`) ||
      orderPanel.querySelector(`input[type="radio"][name="format"][value="${pkg.toUpperCase()}"]`) ||
      orderPanel.querySelector(`input[type="radio"][name="format"][value="${pkg.toLowerCase()}"]`);
    if (radio) radio.checked = true;

    // hidden mező fallback
    const hidden = orderPanel.querySelector('input[type="hidden"][name="format"]');
    if (hidden) hidden.value = pkg;
  }

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const pkg = card.getAttribute('data-package'); // 'mp3' | 'mp4' | 'wav'
      const panel = showOrderPanel();
      setFormat(panel, pkg);
    });
  });
})();
