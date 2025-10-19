// EnZenem: Megrendelés -> /api/generate_song (GPT+Suno)
// Feltételezi: id="orderForm" és name=title, styles, vocal, language, brief, (opcionális) email
(function(){
  const form = document.getElementById('orderForm');
  if(!form) return;

  const resultBox = document.getElementById('song-result');
  const linksList = document.getElementById('song-links');

  async function postJSON(url, data){
    const r = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      email:   (fd.get('email')||'').toString().trim(),
      title:    (fd.get('title')||'').toString().trim(),
      styles:   (fd.get('styles')||'').toString().trim(),
      vocal:    (fd.get('vocal')||'instrumental').toString(),
      language: (fd.get('language')||'hu').toString(),
      brief:    (fd.get('brief')||'').toString().trim(),
      package: (fd.get('package')||'basic').toString()
    };

    try{
      const data = await postJSON(location.origin + '/api/generate_song', payload);
      if(linksList){
        linksList.innerHTML='';
        (data.tracks||[]).slice(0,2).forEach((t,i)=>{
          const li=document.createElement('li');
          const a=document.createElement('a');
          a.href=t.audio_url; a.target='_blank'; a.rel='noopener';
          a.textContent=`Letöltés #${i+1} – ${t.title||('Track '+(i+1))}`;
          li.appendChild(a); linksList.appendChild(li);
        });
      }
      if(resultBox) resultBox.hidden=false;
      if(window.novaOrderSuccess) window.novaOrderSuccess();
    }catch(err){
      console.error('generate_song failed:', err);
      if(window.novaOrderFail) window.novaOrderFail();
      alert('Hoppá, elakadt a generálás. Próbáld újra kicsit később.');
    }
  });
})();
