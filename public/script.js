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
