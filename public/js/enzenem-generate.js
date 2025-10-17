// EnZenem: Megrendelés -> /api/generate_song (GPT+Suno)
// Promptvédelem + letöltési link elrejtés
(function(){
  const form = document.getElementById('orderForm');
  if(!form) return;

  const resultBox = document.getElementById('song-result');
  const linksList = document.getElementById('song-links');

  async function postJSON(url, data){
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      title:    (fd.get('title')    || '').toString().trim(),
      styles:   (fd.get('styles')   || '').toString().trim(),
      vocal:    (fd.get('vocal')    || 'instrumental').toString(),
      language: (fd.get('language') || 'hu').toString(),
      brief:    (fd.get('brief')    || '').toString().trim()
    };

    try {
      const data = await postJSON(location.origin + '/api/generate_song', payload);

      // 🔒 A letöltési linkeket nem jelenítjük meg
      if (linksList) linksList.innerHTML = '';

      // ✅ Csak sikerességi visszajelzés
      if (resultBox) resultBox.hidden = false;
      if (window.novaOrderSuccess) window.novaOrderSuccess();
    } catch (err) {
      console.error('generate_song failed:', err);
      if (window.novaOrderFail) window.novaOrderFail();
      alert('Hoppá, elakadt a generálás. Próbáld újra kicsit később.');
    }
  });
})();
