// EnZenem: Megrendelés -> /api/generate_song (customer-safe feedback only)
(function(){
  window.NB_NOTIFY_SOURCE = 'generate';
  let IN_FLIGHT = false;
  const form = document.getElementById('orderForm');
  if(!form) return;

  // Legacy containers (we now hide them for customers)
  const resultBox = document.getElementById('song-result');
  const linksList = document.getElementById('song-links');
  const lyricsBox = document.getElementById('song-lyrics');

  // Hide any old result sections so customers never see links/lyrics
  [resultBox, linksList, lyricsBox].forEach(el => { if(el){ el.hidden = true; el.innerHTML = ''; } });

  // Lightweight inline feedback banner injected above the form
  let feedback = document.getElementById('order-feedback');
  if(!feedback){
    feedback = document.createElement('div');
    feedback.id = 'order-feedback';
    feedback.setAttribute('aria-live','polite');
    feedback.style.margin = '12px 0';
    feedback.style.padding = '10px 12px';
    feedback.style.borderRadius = '10px';
    feedback.style.fontWeight = '600';
    feedback.style.display = 'none'; // hidden by default
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
    // Try JSON; fallback to text
    const ct = r.headers.get('content-type') || '';
    const payload = ct.includes('application/json') ? await r.json().catch(()=>({})) : await r.text().catch(()=>'');
    if(!r.ok) throw new Error(typeof payload === 'string' ? payload : (payload.error || 'Request failed'));
    return payload || {};
  }

  form.addEventListener('submit', async (e)=>{
    if(IN_FLIGHT) return; IN_FLIGHT = true;
    e.preventDefault();

    // basic collection
    const fd = new FormData(form);
    const data = {
      email: (form.querySelector('[name=email]')||{}).value || '',
      styles: (fd.get('styles')||'').toString(),   // <-- correct field name
      style:  (fd.get('styles')||'').toString(),   // legacy compatibility
      vocal: (form.querySelector('[name=vocal]')||{}).value || '',
      language: (form.querySelector('[name=language]')||{}).value || '',
      brief: (form.querySelector('[name=brief]')||{}).value || '',
      consent: !!(form.querySelector('[name=consent]')||{}).checked,
      package: (fd.get('package')||'basic').toString()
      // 🟡 Kézbesítési mezők hozzáadása a JSON-hoz
     data.delivery_label = (form.querySelector('[name=delivery_label]')||{}).value || '';
     data.delivery_extra = (form.querySelector('[name=delivery_extra]')||{}).value || '0';
    };

    // disable form
    const submitBtn = form.querySelector('button[type=submit], [type=submit]');
    if (submitBtn){ submitBtn.disabled = true; submitBtn.dataset.prevText = submitBtn.textContent; submitBtn.textContent = 'Küldés...'; }

    // Clear any legacy outputs
    [resultBox, linksList, lyricsBox].forEach(el => { if(el){ el.hidden = true; el.innerHTML = ''; } });
    showFeedback('Küldés folyamatban… Kérlek várj.', true);

    try {
      const res = await postJSON('/api/generate_song', data);

      // Regardless of backend details, never render lyrics or links here.
      // Only confirm that generation has started successfully.
      const pkg = (data.package||'basic');
      let okMsg = 'Köszönjük! Megrendelésed beérkezett. Hamarosan kapsz visszaigazolást e-mailben.';
      showFeedback(okMsg, true);

      // Trigger NovaBot success line (speaks when supported)
      if (window.novaOrderSuccess) window.novaOrderSuccess();

    } catch (err) {
      console.error('generate_song failed:', err);

      const badMsg = 'Sajnos most nem sikerült elküldeni. Kérlek próbáld újra néhány perc múlva.';
      showFeedback(badMsg, false);

      if(window.novaOrderFail) window.novaOrderFail();
    } finally {
      if (submitBtn){ submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prevText || 'Megrendelem'; }
      IN_FLIGHT = false;
    }
  });
})();
