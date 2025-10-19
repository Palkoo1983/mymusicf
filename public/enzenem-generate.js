// EnZenem: Megrendelés -> /api/generate_song (GPT+Suno or GPT-only for MP4/WAV)
(function(){
  const form = document.getElementById('orderForm');
  if(!form) return;

  const resultBox = document.getElementById('song-result');
  const linksList = document.getElementById('song-links');
  const lyricsBox = document.getElementById('song-lyrics');

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
      title:    (fd.get('title')||'').toString().trim(),
      styles:   (fd.get('styles')||'').toString().trim(),
      vocal:    (fd.get('vocal')||'instrumental').toString(),
      language: (fd.get('language')||'hu').toString(),
      brief:    (fd.get('brief')||'').toString().trim(),
      package:  (fd.get('package')||'basic').toString()
    };

    // vizuális visszajelzés
    if(resultBox) {
      resultBox.hidden = false;
      resultBox.innerHTML = "<p>Generálás folyamatban...</p>";
    }
    if(linksList) linksList.innerHTML = '';

    try {
      const data = await postJSON(location.origin + '/api/generate_song', payload);
      console.log('[generate_song result]', data);

      // Dalszöveg megjelenítése
      if (lyricsBox) {
        lyricsBox.textContent = data.lyrics || '(nincs dalszöveg)';
        lyricsBox.hidden = false;
      }

      // Ha MP3 → jönnek a Suno linkek
      if (data.tracks && data.tracks.length > 0) {
        linksList.innerHTML = '';
        data.tracks.slice(0, 2).forEach((t, i) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = t.audio_url || t;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = `Letöltés #${i + 1}`;
          li.appendChild(a);
          linksList.appendChild(li);
        });
      } 
      // Ha MP4/WAV → csak szöveg, nincs Suno
      else {
        const li = document.createElement('li');
        li.textContent = "MP4/WAV formátum esetén a fájlokat e-mailben küldjük.";
        linksList.appendChild(li);
      }

      if (window.novaOrderSuccess) window.novaOrderSuccess();

    } catch (err) {
      console.error('generate_song failed:', err);
      if(window.novaOrderFail) window.novaOrderFail();
      alert('Hoppá, elakadt a generálás. Próbáld újra kicsit később.');
    }
  });
})();
