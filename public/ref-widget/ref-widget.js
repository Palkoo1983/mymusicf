(function(){
  // Build playlist from existing .embed items (iframe + caption)
  function collectRefs(){
    const items = [];
    document.querySelectorAll('.embed .video iframe, .embeds .embed .video iframe').forEach((ifr) => {
      try{
        const u = new URL(ifr.src, location.href);
        const vid = (u.pathname.includes('/embed/') ? u.pathname.split('/embed/')[1] : u.searchParams.get('v')) || '';
        const title = (ifr.closest('.embed')?.querySelector('p')?.textContent || 'Referencia').trim();
        if (vid) items.push({ id: vid, title });
      }catch(_){}
    });
    // Fallback to provided example if nothing found
    if (!items.length) items.push({ id: 'Crf1xVh4BYA', title: 'Kata & Máté – Esküvő' });
    return items;
  }

  // Remove any legacy audio widgets left in HTML
  ['bg-audio','bg-audio-iframe','soundToggle','audioToggle'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const playlist = collectRefs();

  // ---- Desktop dock (video) ----
  const dock = document.createElement('div');
  dock.id = 'refDock';
  dock.innerHTML = `
    <div class="ref-card">
      <div class="ref-video"><iframe allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="ref-list"></div>
    </div>
  `;
  document.body.appendChild(dock);

  const iframe = dock.querySelector('iframe');
  const listWrap = dock.querySelector('.ref-list');

  playlist.forEach((it, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = it.title || ('Tétel ' + (i+1));
    b.dataset.id = it.id;
    b.addEventListener('click', () => {
      setActive(it.id);
      playVideo(it.id);
    });
    listWrap.appendChild(b);
  });

  function setActive(id){
    listWrap.querySelectorAll('button').forEach(btn=>{
      btn.classList.toggle('active', btn.dataset.id === id);
    });
  }
  function playVideo(id){
    const src = `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    iframe.src = src;
  }

  // init with first
  setActive(playlist[0].id);
  playVideo(playlist[0].id);

  // ---- Mobile compact audio (no video) ----
  const bar = document.createElement('div');
  bar.id = 'refAudioBar';
  bar.innerHTML = `
    <div class="audio-card">
      <div class="audio-controls">
        <button id="audioToggle" type="button" aria-pressed="false" aria-label="Lejátszás">▶︎</button>
        <select id="audioSelect" class="audio-select"></select>
      </div>
    </div>
    <div id="bg-audio" data-video="${playlist[0].id}" aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px;">
      <div id="bg-audio-iframe"></div>
    </div>
  `;
  document.body.appendChild(bar);

  // Fill select with gold labels
  const sel = bar.querySelector('#audioSelect');
  playlist.forEach((it)=> {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = it.title;
    sel.appendChild(opt);
  });

  // Audio via hidden YT player
  const holder = bar.querySelector('#bg-audio');
  const videoId = holder.dataset.video || playlist[0].id;
  const mountId = 'bg-audio-iframe';
  const btn = bar.querySelector('#audioToggle');

  let player = null;
  let ready = false;
  let isPlaying = false;
  let wantPlay = false; // user asked to play

  function loadYT(){
    if (window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
    if (document.getElementById('yt-iframe-api')) return;
    const s = document.createElement('script');
    s.src = "https://www.youtube.com/iframe_api";
    s.id = "yt-iframe-api";
    document.head.appendChild(s);
  }

  window.onYouTubeIframeAPIReady = function(){
    if (player) return;
    player = new YT.Player(mountId, {
      height: '1', width: '1', videoId,
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1, fs: 0,
        modestbranding: 1, rel: 0, playsinline: 1
      },
      events: { onReady, onStateChange: onState }
    });
  };

  function onReady(){
    ready = true;
    try { player.setVolume(70); } catch(_){}
    try { player.cueVideoById(videoId); } catch(_){}
    if (wantPlay){
      try { player.playVideo(); } catch(_){}
    }
  }
  function onState(e){
    const st = e && typeof e.data === 'number' ? e.data : -1;
    if (st === 1){ // playing
      isPlaying = true;
      btn.textContent = '⏸︎';
      btn.setAttribute('aria-pressed','true');
      btn.setAttribute('aria-label','Szünet');
    } else if (st === 2 || st === 0){
      isPlaying = false;
      btn.textContent = '▶︎';
      btn.setAttribute('aria-pressed','false');
      btn.setAttribute('aria-label','Lejátszás');
    }
  }

  // First click should work even if API still loading
  btn.addEventListener('click', () => {
    wantPlay = !isPlaying || !ready;
    if (!ready){
      loadYT();
      try { player && player.playVideo(); } catch(_){}
      btn.textContent = '⏸︎';
      return;
    }
    if (isPlaying){
      try { player.pauseVideo(); } catch(_){}
    } else {
      try { player.playVideo(); } catch(_){}
    }
  });

  sel.addEventListener('change', () => {
    const id = sel.value;
    // desktop mirror: change video
    playVideo(id);
    // mobile audio: cue or play selected
    if (!player){ loadYT(); return; }
    try {
      if (isPlaying) player.loadVideoById(id);
      else player.cueVideoById(id);
    } catch(_){}
  });

  // Prime API on first user interaction
  function primeOnce(){
    document.removeEventListener('pointerdown', primeOnce, { passive:true });
    loadYT();
  }
  document.addEventListener('pointerdown', primeOnce, { passive:true });

  // Safety init
  loadYT();
})();