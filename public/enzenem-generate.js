// EnZenem: Megrendelés -> VPOS redirect ONLY (no API feedback to frontend)
(function(){
  window.NB_NOTIFY_SOURCE = 'vpos';
  let IN_FLIGHT = false;
  const form = document.getElementById('orderForm');
  if(!form) return;

  // Hide any legacy result areas if exist
  ['song-result','song-links','song-lyrics'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.hidden = true; el.innerHTML = ''; }
  });

  // Simple inline feedback util (used only until VPOS redirect)
  function showFeedback(msg, ok){
    try {
      const id = 'order-feedback';
      let f = document.getElementById(id);
      if(!f){
        f = document.createElement('div');
        f.id = id;
        f.style.margin = '12px 0';
        f.style.padding = '10px 12px';
        f.style.borderRadius = '10px';
        form.parentNode.insertBefore(f, form);
      }
      f.textContent = msg;
      f.style.display = 'block';
      f.style.background = ok ? '#e6ffed' : '#ffecec';
      f.style.border = '1px solid ' + (ok ? '#21a353' : '#d33');
      f.style.color = ok ? '#0b6b2b' : '#8a1f1f';
    } catch(_) {}
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    if(IN_FLIGHT) return;
    IN_FLIGHT = true;

    const submitBtn = form.querySelector('button[type="submit"], .order-submit, #orderSubmit');
    if(submitBtn){ submitBtn.dataset.prevText = submitBtn.textContent; submitBtn.disabled = true; submitBtn.textContent = 'Átirányítás a fizetésre...'; }

    try {
      // Collect fields
      const fd = new FormData(form);
      const payload = {};
      fd.forEach((v,k)=>{ payload[k]=typeof v==='string'?v:v.toString(); });

      // Create a real form POST -> backend (so backend can 302 redirect to VPOS)
      const post = document.createElement('form');
      post.method = 'POST';
      post.action = '/api/vpos/start';
      post.style.display = 'none';
      for(const [k,v] of Object.entries(payload)){
        const inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = k;
        inp.value = v;
        post.appendChild(inp);
      }
      document.body.appendChild(post);
      post.submit();
      // From here the browser navigates away to VPOS; no more UI work here.

    } catch(err){
      console.error('vpos start failed:', err);
      showFeedback('Sajnos most nem sikerült elindítani a fizetést. Próbáld újra kérlek.', false);
      if(window.novaOrderFail) window.novaOrderFail();
      if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.prevText || 'Megrendelem'; }
      IN_FLIGHT = false;
    }
  });
})();