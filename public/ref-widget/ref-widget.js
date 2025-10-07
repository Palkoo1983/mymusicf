/**
 * ref-widget.js
 * Desktop: fixed side video panel with selectable references
 * Mobile: compact audio-only bar with selector
 * Requires: YouTube embed iframes already present on page (.embed .video iframe)
 */

(function(){
  const isMobile = matchMedia('(max-width:1024px)').matches;

  // Collect reference videos from existing embeds
  function collectRefs(){
    const iframes = Array.from(document.querySelectorAll('.embed .video iframe, .embeds .embed .video iframe'));
    const refs = [];
    let idx = 0;
    for (const f of iframes){
      try{
        const src = new URL(f.src, location.href);
        // typical: https://www.youtube.com/embed/VIDEOID?...
        let videoId = null;
        if (/youtube\.com\/embed\//.test(src.href)){
          videoId = src.pathname.split('/').pop();
        } else if (src.searchParams.get('v')){
          videoId = src.searchParams.get('v');
        }
        if (!videoId) continue;
        // title from sibling <p>, fallback to text content around
        let title = '';
        const wrap = f.closest('.embed') || f.parentElement;
        if (wrap){
          const p = wrap.querySelector('p');
          title = (p && p.textContent.trim()) || '';
        }
        if (!title) title = `Referencia ${++idx}`; else idx++;
        refs.push({ id: videoId, title });
      }catch(_){}
    }
    // Fallback: if none found, use a default from the prompt video
    if (!refs.length){
      refs.push({ id: 'Crf1xVh4BYA', title: 'Referencia' });
    }
    return refs;
  }

  const refs = collectRefs();
  let current = 0;

  // Build UI
  function el(tag, props={}, children=[]){
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k,v])=>{
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    });
    for (const c of (Array.isArray(children) ? children : [children])){
      if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else if (c) n.appendChild(c);
    }
    return n;
  }

  // YouTube API bootstrap
  let ytReady = false;
  let ytQueue = [];
  function ensureYT(cb){
    if (ytReady && window.YT && YT.Player){ cb(); return; }
    ytQueue.push(cb);
    if (document.getElementById('yt-iframe-api')) return;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.id = 'yt-iframe-api';
    document.head.appendChild(s);
    }

  // Desktop panel
  const panel = el('div', { class:'rw-panel' });
  const title = el('div', { class:'rw-title', text:'Referenciaklip – válassz és indítsd el' });
  const video = el('div', { class:'rw-video' });
  const controls = el('div', { class:'rw-controls' });
  const prev = el('button', { type:'button', title:'Előző' }, '⏮');
  const play = el('button', { type:'button', title:'Lejátszás/Szünet' }, '▶︎');
  const next = el('button', { type:'button', title:'Következő' }, '⏭');
  const sel = el('select', { title:'Referencia választása' });
  const spacer = el('div', { class:'rw-spacer' });

  refs.forEach((r, i)=>{
    sel.appendChild(el('option', { value:String(i) }, r.title));
  });

  controls.append(prev, play, next, spacer, sel);
  panel.append(title, controls, video);

  // Mobile bar
  const mbar = el('div', { class:'rw-mobile' });
  const mtitle = el('div', { class:'rw-title', text:'Referencia' });
  const mplay = el('button', { type:'button', title:'Lejátszás/Szünet' }, '▶︎');
  const msel = el('select', { title:'Referencia választása' });
  refs.forEach((r, i)=> msel.appendChild(el('option', { value:String(i) }, r.title)) );
  mbar.append(mplay, msel);

  document.body.append(panel, mbar);

  // Players
  let deskPlayer = null;
  let mobPlayer = null;
  let deskState = 2; // paused
  let mobState = 2;

  function loadDesk(i){
    current = i;
    sel.value = String(i);
    try { deskPlayer && deskPlayer.cueVideoById(refs[i].id); } catch(_){}
  }
  function loadMob(i){
    current = i;
    msel.value = String(i);
    try { mobPlayer && mobPlayer.cueVideoById(refs[i].id); } catch(_){}
  }

  function mountDesktop(){
    ensureYT(()=>{
      if (deskPlayer) return;
      const mount = el('div');
      video.appendChild(mount);
      deskPlayer = new YT.Player(mount, {
        width:'100%', height:'100%',
        videoId: refs[current].id,
        playerVars: { autoplay:0, controls:1, rel:0, modestbranding:1, playsinline:1 },
        events: {
          onReady: ()=> { deskPlayer.setVolume(75); },
          onStateChange: (e)=>{
            deskState = e.data;
            if (deskState === 1) play.textContent = '⏸'; else play.textContent = '▶︎';
          }
        }
      });
    });
  }

  function mountMobile(){
    ensureYT(()=>{
      if (mobPlayer) return;
      const mount = el('div');
      // Invisible, audio-only
      mount.style.position = 'absolute';
      mount.style.width = '1px'; mount.style.height = '1px';
      mount.style.overflow = 'hidden'; mount.style.clipPath = 'inset(50%)';
      document.body.appendChild(mount);
      mobPlayer = new YT.Player(mount, {
        width:'1', height:'1',
        videoId: refs[current].id,
        playerVars: { autoplay:0, controls:0, rel:0, modestbranding:1, playsinline:1 },
        events: {
          onReady: ()=> { mobPlayer.setVolume(75); },
          onStateChange: (e)=>{
            mobState = e.data;
            if (mobState === 1) mplay.textContent = '⏸'; else mplay.textContent = '▶︎';
          }
        }
      });
    });
  }

  // Wire controls
  prev.addEventListener('click', ()=>{
    const i = (current - 1 + refs.length) % refs.length;
    loadDesk(i);
    try { deskPlayer && deskPlayer.playVideo(); } catch(_){}
  });
  next.addEventListener('click', ()=>{
    const i = (current + 1) % refs.length;
    loadDesk(i);
    try { deskPlayer && deskPlayer.playVideo(); } catch(_){}
  });
  sel.addEventListener('change', ()=>{
    loadDesk(parseInt(sel.value,10));
    try { deskPlayer && deskPlayer.playVideo(); } catch(_){}
  });
  play.addEventListener('click', ()=>{
    if (!deskPlayer){ mountDesktop(); return; }
    if (deskState === 1) { try { deskPlayer.pauseVideo(); }catch(_){}} else { try{ deskPlayer.playVideo(); }catch(_){} }
  });

  msel.addEventListener('change', ()=>{
    loadMob(parseInt(msel.value,10));
    try { mobPlayer && mobPlayer.playVideo(); } catch(_){}
  });
  mplay.addEventListener('click', ()=>{
    if (!mobPlayer){ mountMobile(); return; }
    if (mobState === 1) { try { mobPlayer.pauseVideo(); }catch(_){}} else { try{ mobPlayer.playVideo(); }catch(_){} }
  });

  // Initial mount depending on viewport (only after user interaction will autoplay work)
  if (isMobile) {
    mountMobile();
  } else {
    mountDesktop();
  }

  // If the page already had a global "sound" toggle, hide it to avoid duplication
  const legacy = document.getElementById('soundToggle') || document.getElementById('audioToggle');
  if (legacy) legacy.classList.add('rw-hidden');
})();
