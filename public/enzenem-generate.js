// EnZenem – async-safe rendelésküldés (processing + status polling)
// Csak az #orderForm-ot érinti, más funkciókhoz NEM nyúl.

(function () {
  const form = document.getElementById('orderForm');
  if (!form) return;

  let IN_FLIGHT = false;

  // Visszajelző sáv
  let feedback = document.getElementById('order-feedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'order-feedback';
    feedback.setAttribute('aria-live', 'polite');
    feedback.style.margin = '12px 0';
    feedback.style.padding = '10px 12px';
    feedback.style.borderRadius = '10px';
    feedback.style.fontWeight = '600';
    feedback.style.display = 'none';
    const note = document.querySelector('p.note');
    (note && note.parentNode ? note.parentNode : form.parentNode).insertBefore(feedback, (note && note.nextSibling) || form.nextSibling);
  }
  function showFeedback(text, ok) {
    feedback.textContent = text;
    feedback.style.display = 'block';
    feedback.style.background = ok ? '#e6ffed' : '#ffecec';
    feedback.style.border = '1px solid ' + (ok ? '#21a353' : '#d33');
    feedback.style.color = ok ? '#0b6b2b' : '#8a1f1f';
  }

  async function postJSON(url, data) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const ct = r.headers.get('content-type') || '';
    const payload = ct.includes('application/json') ? await r.json().catch(() => ({})) : await r.text().catch(() => '');
    if (!r.ok) throw new Error(typeof payload === 'string' ? payload : (payload.message || payload.error || 'Request failed'));
    return payload || {};
  }

  // === ÚJ: státusz-polling az async háttérfolyamathoz ===
  async function pollStatus(jobId, opts) {
    const cfg = Object.assign({ maxMs: 5 * 60 * 1000, firstDelay: 5000, step: 5000 }, opts || {});
    let waited = 0;
    let delay = cfg.firstDelay;

    while (waited <= cfg.maxMs) {
      await new Promise(r => setTimeout(r, delay));
      waited += delay;
      delay = Math.min(delay + cfg.step, 15000);

      let res;
      try {
        res = await fetch('/api/generate_song/status?jobId=' + encodeURIComponent(jobId), { headers: { 'Accept': 'application/json' } });
      } catch (_) { continue; }
      if (!res || !res.ok) continue;

      let data = {};
      try { data = await res.json(); } catch (_) { data = {}; }

      if (data && data.ok) {
        const st = String(data.status || '').toLowerCase();
        if (st === 'done') {
          showFeedback('Kész! A dal elkészült – értesítőt küldünk e-mailben is. ✅', true);
          if (window.novaOrderReady) try { window.novaOrderReady(jobId, data.result || null); } catch (_) {}
          return;
        }
        if (st === 'failed') {
          showFeedback('Sajnos most nem sikerült elkészíteni a dalt. Próbáld meg pár perc múlva, vagy írj nekünk.', false);
          if (window.novaOrderFail) try { window.novaOrderFail(st, data.error || null); } catch (_) {}
          return;
        }
        // processing -> folytatjuk a pollolást
      }
    }
    // timeout (ritka, hosszan foglalt Suno esetén)
    showFeedback('A feldolgozás tovább tart a szokásosnál. A készülésről e-mailt küldünk, amint elkészült. ⏳', true);
  }

  form.addEventListener('submit', async (e) => {
    if (IN_FLIGHT) return;
    IN_FLIGHT = true;
    e.preventDefault();

    const fd = new FormData(form);
    const data = {
      email: (form.querySelector('[name=email]') || {}).value || '',
      styles: (fd.get('styles') || '').toString(),
      style:  (fd.get('styles') || '').toString(),
      vocal: (form.querySelector('[name=vocal]') || {}).value || '',
      language: (form.querySelector('[name=language]') || {}).value || '',
      brief: (form.querySelector('[name=brief]') || {}).value || '',
      consent: !!(form.querySelector('[name=consent]') || {}).checked,
      package: (fd.get('package') || 'basic').toString()
    };

    const btn = form.querySelector('button[type=submit], [type=submit]');
    if (btn) { btn.disabled = true; btn.dataset.prevText = btn.textContent; btn.textContent = 'Küldés...'; }

    showFeedback('Küldés folyamatban… Kérlek várj.', true);

    try {
      const res = await postJSON('/api/generate_song', data);

      // ASYNC mód: azonnali processing + jobId
      if (res && res.status === 'processing' && res.jobId) {
        showFeedback('Feldolgozás alatt… Ne zárd be az oldalt. ⏳', true);
        if (window.novaOrderSuccess) try { window.novaOrderSuccess(res.jobId); } catch (_) {}
        pollStatus(res.jobId);
      } else {
        // Szinkron (ritka) – nem mutatunk linket/lyrics-et
        showFeedback('Köszönjük! Megrendelésed beérkezett. Hamarosan kapsz visszaigazolást e-mailben.', true);
        if (window.novaOrderReady) try { window.novaOrderReady('direct', res || null); } catch (_) {}
      }

    } catch (err) {
      console.error('generate_song failed:', err);
      showFeedback('Sajnos most nem sikerült elküldeni. Kérlek próbáld újra pár perc múlva.', false);
      if (window.novaOrderFail) try { window.novaOrderFail('client_error', { message: String((err && err.message) || err) }); } catch (_) {}
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.prevText || 'Küldés'; }
      IN_FLIGHT = false;
    }
  });
})();