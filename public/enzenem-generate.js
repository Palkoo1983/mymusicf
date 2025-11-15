// EnZenem: Megrendelés -> /api/payment/create (VPOS test-ready version)
(function(){
  window.NB_NOTIFY_SOURCE = 'generate';
  let IN_FLIGHT = false;
  const form = document.getElementById('orderForm');
  if(!form) return;

  // Legacy containers (hidden for customers)
  const resultBox = document.getElementById('song-result');
  const linksList = document.getElementById('song-links');
  const lyricsBox = document.getElementById('song-lyrics');
  [resultBox, linksList, lyricsBox].forEach(el => { if(el){ el.hidden = true; el.innerHTML = ''; } });

  // Inline feedback banner
  let feedback = document.getElementById('order-feedback');
  if(!feedback){
    feedback = document.createElement('div');
    feedback.id = 'order-feedback';
    feedback.setAttribute('aria-live','polite');
    feedback.style.margin = '12px 0';
    feedback.style.padding = '10px 12px';
    feedback.style.borderRadius = '10px';
    feedback.style.fontWeight = '600';
    feedback.style.display = 'none';
    const payNote = document.querySelector('p.note');
    if(payNote && payNote.parentNode){
      payNote.parentNode.insertBefore(feedback, payNote.nextSibling);
    } else {
      form.parentNode.insertBefore(feedback, form.nextSibling);
    }
  }

  function showFeedback(text, ok=true){
    feedback.textContent = text;
    feedback.style.display = 'block';
    feedback.style.background = ok ? '#e6ffed' : '#ffecec';
    feedback.style.border = '1px solid ' + (ok ? '#21a353' : '#d33');
    feedback.style.color = ok ? '#0b6b2b' : '#8a1f1f';
  }

  async function postJSON(url, data){
    const r = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const ct = r.headers.get('content-type') || '';
    const payload = ct.includes('application/json')
      ? await r.json().catch(()=>({}))
      : await r.text().catch(()=>'');
    if(!r.ok) throw new Error(typeof payload === 'string' ? payload : (payload.error || 'Request failed'));
    return payload || {};
  }

 // 🔹 Új fizetési folyamat – admin e-mail + VPOS indítás
form.addEventListener('submit', async (e) => {
  if (IN_FLIGHT) return;
  IN_FLIGHT = true;
  e.preventDefault();

  const fd = new FormData(form);
  const data = {
    email: (form.querySelector('[name=email]') || {}).value || '',
    styles: (fd.get('styles') || '').toString(),
    style: (fd.get('styles') || '').toString(),
    vocal: (form.querySelector('[name=vocal]') || {}).value || '',
    language: (form.querySelector('[name=language]') || {}).value || '',
    brief: (form.querySelector('[name=brief]') || {}).value || '',
    consent: !!(form.querySelector('[name=consent]') || {}).checked,
    package: (fd.get('package') || 'basic').toString(),
    delivery_label: (form.querySelector('[name=delivery_label]') || {}).value || '',
    delivery_extra: (form.querySelector('[name=delivery_extra]') || {}).value || '0',
    // Céges számlázási adatok
  invoice_company: !!(form.querySelector('[name=invoice_company]') || {}).checked,
  invoice_company_name: (form.querySelector('[name=invoice_company_name]') || {}).value || '',
  invoice_vat_number: (form.querySelector('[name=invoice_vat_number]') || {}).value || '',
  invoice_address: (form.querySelector('[name=invoice_address]') || {}).value || ''
  };

  const submitBtn = form.querySelector('button[type=submit], [type=submit]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.prevText = submitBtn.textContent;
    submitBtn.textContent = 'Fizetés indítása...';
  }

  [resultBox, linksList, lyricsBox].forEach(el => {
    if (el) { el.hidden = true; el.innerHTML = ''; }
  });
  showFeedback('Kapcsolódás a fizetési rendszerhez...', true);

  try {
    // 🟡 1️⃣ Admin e-mail azonnal (megrendelés leadásakor)
    await postJSON('/api/order', data);
    console.log('[ORDER] Admin értesítés elküldve');

    // 🟢 2️⃣ Fizetési folyamat indítása
    const res = await postJSON('/api/payment/create', data);
    if (res.ok && res.successUrl) {
      showFeedback('Átirányítás a fizetési oldalra...', true);
      window.location.href = res.successUrl;
    } else {
      showFeedback('Nem sikerült elindítani a fizetést.', false);
    }

  } catch (err) {
    console.error('VPOS create failed:', err);
    showFeedback('Hiba történt a fizetés indításakor.', false);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.prevText || 'Megrendelés';
    }
    IN_FLIGHT = false;
  }
});
})();

