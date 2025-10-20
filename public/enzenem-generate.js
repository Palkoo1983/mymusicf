// EnZenem: Megrendelés -> /api/generate_song (customer-safe, async-ready)
(function(){
  window.NB_NOTIFY_SOURCE = 'generate';
  let IN_FLIGHT = false;
  const form = document.getElementById('orderForm');
  if(!form) return;

  // Legacy containers (rejtve maradnak az ügyfél előtt)
  const resultBox = document.getElementById('song-result');
  const linksList = document.getElementById('song-links');
  const lyricsBox = document.getElementById('song-lyrics');
  [resultBox, linksList, lyricsBox].forEach(el => { if(el){ el.hidden = true; el.innerHTML = ''; } });

  // Visszajelző sáv a form fölé
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
    const payload = ct.includes('application/json') ? await r.json().catch(()=>({})) : await r.text().catch(()=>'');
    if(!r.ok) throw new Error(typeof payload === 'string' ? payload : (payload.error || 'Request failed'));
    return payload || {};
  }

  // === ÚJ: státusz-polling az async háttérfolyamathoz ===
  async function pollStatus(jobId, opts){
    const cfg = Object.assign({ maxMs: 5*60*1000, // 5 perc
                                firstDelay: 5000, // 5s
                                step: 5000,       // 5s lépcsők
                                speak: true }, opts||{});
    let waited = 0;
    let delay = cfg.firstDelay;

    while (waited <= cfg.maxMs){
      await new Promise(r => setTimeout(r, delay));
      waited += delay;
      delay = Math.min(delay + cfg.step, 15000); // legfeljebb 15s-ig nőjön

      let res;
      try{
        res = await fetch('/api/generate_song/status?jobId=' + encodeURIComponent(jobId), { headers:{'Accept':'application/json'} });
      }catch(_e){ continue; }

      if(!res || !res.ok) continue;
      let data = {};
      try{ data = await res.json(); }catch(_e){ data = {}; }

      if(data && data.ok){
        const st = (data.status||'').toLowerCase();
        if(st === 'done'){
          showFeedback('Kész! A dal elkészült – értesítőt küldünk e-mailben is. ✅', true);
          if (window.novaOrderReady) try{ window.novaOrderReady(jobId, data.result||null); }catch(_){}
          return;
        }
        if(st === 'failed'){
          showFeedback('Sajnos most nem sikerült elkészíteni a dalt. Próbáld újra pár perc múlva, vagy írj nekünk.', false);
          if (window.novaOrderFail) try{ window.novaOrderFail(st, data.error||null); }catch(_){}
          return;
        }
        // processing -> tovább várunk
      }
    }
    // timeout
    showFeedback('A rendelés feldolgozása tovább tart a szokásosnál. A készülésről e-mailt küldünk, amint elkészült. ⏳', true);
  }

  form.addEventListener('submit', async (e)=>{
    if(IN_FLIGHT) return; IN_FLIGHT = true;
    e.preventDefault();

    const fd = new FormData(form);
    const data = {
      email: (form.querySelector('[name=email]')||{}).value || '',
      styles: (fd.get('styles')||'').toString(),
      style:  (fd.get('styles')||'').toString(),
      vocal: (form.querySelector('[name=vocal]')||{}).value || '',
      language: (form.querySelector('[name=language]')||{}).value || '',
      brief: (form.querySelector('[name=brief]')||{}).value || '',
      consent: !!(form.querySelector('[name=consent]')||{}).checked,
      package: (fd.get('package')||'basic').toString()
    };

    const submitBtn = form.querySelector('button[type=submit], [type=submit]');
    if (submitBtn){ submitBtn.disabled = true; submitBtn.dataset.prevText = submitBtn.textContent; submitBtn.textContent = 'Küldés...'; }

    [resultBox, linksList, lyricsBox].forEach(el => { if(el){ el.hidden = true; el.innerHTML = ''; } });
    showFeedback('Feldolgozás alatt… Kérlek, ne zárd be az oldalt. Rövidesen értesítünk. ⏳', true);

    try {
      const res = await postJSON('/api/generate_song', data);
      // Kétféle backend-válaszra felkészítve:
      // 1) { ok:true, status:"processing", jobId }  -> async háttér + polling
      // 2) { ok:true, lyrics, tracks, ... }         -> szinkron (ritka)
      if(res && res.status === 'processing' && res.jobId){
        if (window.novaOrderSuccess) try{ window.novaOrderSuccess(res.jobId); }catch(_){}
        // Indítsuk a status-pollingot – a felhasználó itt csak üzenetet lát, linkeket nem.
        pollStatus(res.jobId);
      } else {
        // Szinkron fallback – nem mutatunk linket/lyrics-et ügyfélnek, csak visszaigazolást
        showFeedback('Köszönjük! Megrendelésed beérkezett. Hamarosan kapsz visszaigazolást e-mailben.', true);
        if (window.novaOrderReady) try{ window.novaOrderReady('direct', res||null); }catch(_){}
      }
    } catch (err) {
      console.error('generate_song failed:', err);
      showFeedback('Sajnos most nem sikerült elküldeni. Kérlek próbáld újra néhány perc múlva.', false);
      if(window.novaOrderFail) try{ window.novaOrderFail('client_error', { message: String(err&&err.message||err) }); }catch(_){}
    } finally {
      if (submitBtn){ submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prevText || 'Megrendelem'; }
      IN_FLIGHT = false;
    }
  });
})();