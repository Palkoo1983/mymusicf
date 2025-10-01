// ---- BOMBABIZTOS TAB-KEZELŐ ----
(function(){
  function initTabs(){
    const tabs  = document.querySelectorAll('[data-tab]');
    const pages = document.querySelectorAll('[data-page]');
    if(!tabs.length || !pages.length) return;

    const show = (id)=>{
      pages.forEach(p => p.classList.toggle('hidden', p.id !== id));
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    };

    tabs.forEach(t=>{
      t.addEventListener('click', (e)=>{
        e.preventDefault();
        const id = t.dataset.tab;
        if(document.getElementById(id)) {
          show(id);
          history.replaceState(null,'','#'+id);
        }
      });
    });

    const initial = (location.hash && document.getElementById(location.hash.slice(1)))
      ? location.hash.slice(1)
      : (tabs[0]?.dataset.tab || pages[0]?.id);
    if(initial) show(initial);
  }

  // biztosan akkor fusson, amikor a DOM kész
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initTabs);
  }else{
    initTabs();
  }
})();

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

// Kapcsolat űrlap
const contactForm = document.getElementById('contactForm');
const contactStatus = document.getElementById('contactStatus');

contactForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  contactStatus.textContent = 'Küldés...';
  const data = Object.fromEntries(new FormData(contactForm).entries());
  const submitBtn = contactForm.querySelector('button[type="submit"]');
  submitBtn?.setAttribute('disabled','disabled');

  try {
    const json = await postJSON('/api/contact', data);
    contactStatus.textContent = json.message || 'Üzenet elküldve, hamarosan jelentkezünk!';
    contactForm.reset();

    // ÚJ: zárható overlay megjelenítése
    showThanksOverlay('Üzenet elküldve, hamarosan jelentkezünk!');
  } catch (err) {
    contactStatus.textContent = 'Nem sikerült elküldeni. Próbáld újra.';
    console.error(err);
  } finally {
    submitBtn?.removeAttribute('disabled');
  }
});

function showThanksOverlay(message){
  const ov = document.getElementById('thanksOverlay');
  if(!ov) return;
  // ha van üzenet hely, írd ki oda (opcionális)
  const msgEl = ov.querySelector('[data-thanks-msg]');
  if (msgEl) msgEl.textContent = message || 'Köszönjük a megkeresést!';

  ov.classList.remove('hidden');

  // Bezárás kattintásra (háttérre) vagy X gombra
  const close = () => hideThanksOverlay();
  ov.__close && ov.removeEventListener('click', ov.__close);
  ov.__close = (ev)=>{
    if (ev.target.id === 'thanksOverlay' || ev.target.closest('[data-close]')) close();
  };
  ov.addEventListener('click', ov.__close);

  // Esc-re
  const esc = (ev)=>{ if(ev.key === 'Escape') close(); };
  document.addEventListener('keydown', esc, { once:true });

  // Auto-hide 3.5 másodperc után
  clearTimeout(ov.__tid);
  ov.__tid = setTimeout(close, 3500);
}
function hideThanksOverlay(){
  const ov = document.getElementById('thanksOverlay');
  if(!ov) return;
  ov.classList.add('hidden');
  if (ov.__close) ov.removeEventListener('click', ov.__close);
  clearTimeout(ov.__tid);
}

  }
});
(function(){
  const key='cookie-consent-v1';
  const b=document.getElementById('cookieBanner');
  if(!b) return;
  if(localStorage.getItem(key)){ b.classList.add('hidden'); return; }
  b.classList.remove('hidden');
  document.getElementById('cookieAccept')?.addEventListener('click', ()=>{
    localStorage.setItem(key,'1'); b.classList.add('hidden');
  });
  document.getElementById('cookieDecline')?.addEventListener('click', ()=>{
    localStorage.setItem(key,'0'); b.classList.add('hidden');
  });
})();
