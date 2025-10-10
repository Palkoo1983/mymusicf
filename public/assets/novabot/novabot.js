// === NovaBot Assistant v3 (intro flight + talk visual + full-brief speech) ===
(function(){
  const state = {
    bubbleOpen: false,
    synth: ('speechSynthesis' in window) ? window.speechSynthesis : null,
  };

  // --- speaking state (szemfény + talkPulse aktiválás)
  function setSpeaking(on){
    try{
      const root = document.getElementById('novabot');
      if(!root) return;
      root.classList.toggle('novabot-speaking', !!on);
    }catch(e){}
  }

  // --- helpers
  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  // --- beszéd (Web Speech API, HU hang preferált)
  function speak(text){
    try{
      if(!state.synth) return;
      state.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = state.synth.getVoices();
      const hu = voices.find(v => /hu|hungar/i.test(v.lang));
      if(hu) u.voice = hu;
      u.rate = 1.0; u.pitch = 1.0;
      u.onstart = ()=> setSpeaking(true);
      u.onend = ()=> setSpeaking(false);
      u.onerror = ()=> setSpeaking(false);
      state.synth.speak(u);
    }catch(e){ setSpeaking(false); }
  }

  // --- UI építés
  function createUI(){
    if(qs('#novabot')) return;
    const root = document.createElement('div');
    root.id = 'novabot';

    // bubble
    const bubble = document.createElement('div');
    bubble.className = 'novabot-bubble';
    bubble.innerHTML = '<span class="novabot-close" aria-label="Bezárás" title="Bezárás">×</span><div class="nb-text">Szia, én vagyok NovaBot 🤖 – segítek eligazodni! Kattints rám vagy a menükre, és elmondom, mit hol találsz.</div>';
    root.appendChild(bubble);

    // avatar
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'novabot-avatar';
    avatarWrap.style.position = 'relative';

    const img = document.createElement('img');
    img.src = './assets/novabot/novabot.png';
    img.alt = 'NovaBot – segítő robot';
    img.setAttribute('aria-label', 'NovaBot – segítő');
    avatarWrap.appendChild(img);

    const glow = document.createElement('div');
    glow.className = 'novabot-eyeGlow';
    avatarWrap.appendChild(glow);

    // beszéd-hullám vizuál (kis pulzáló pont)
    const talk = document.createElement('div');
    talk.className = 'novabot-talkWave';
    avatarWrap.appendChild(talk);

    root.appendChild(avatarWrap);
    document.body.appendChild(root);

    // interakció
    avatarWrap.addEventListener('click', () => {
      toggleBubble(true);
      const msg = 'Szia, én vagyok NovaBot! Itt a jobb alsó sarokban segítek. Próbáld ki a füleket, vagy ugorj a Megrendelés részhez.';
      setBubbleText(msg);
      speak(msg);
      pointToHowTo();
    });

    bubble.querySelector('.novabot-close').addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleBubble(false);
      if(state.synth) state.synth.cancel();
    });

    // finom automata buborék indítás
    setTimeout(()=> toggleBubble(true), 1200);
  }

  function setBubbleText(t){
    const b = qs('.novabot-bubble .nb-text');
    if(b){ b.textContent = t; }
  }

  function toggleBubble(show){
    const b = qs('.novabot-bubble');
    if(!b) return;
    state.bubbleOpen = !!show;
    b.classList.toggle('show', state.bubbleOpen);
  }

  // --- HowTo kiemelés (marad)
  function pointToHowTo(){
    const candidates = qsa('a[href*="#how" i], [data-target*="how" i], .howto, #howto, [href="#howto"]');
    if(candidates.length){
      candidates[0].classList.add('novabot-ctaPulse');
      setTimeout(()=>candidates[0].classList.remove('novabot-ctaPulse'), 4500);
    }
  }

  // --- Fül leírások (marad, finomítva)
  function describeTab(name){
    const map = {
      bemutatkozas: 'Ez a rész bemutatja, mivel foglalkozik a weboldalunk.',
      arak: 'Ebben a részben találhatóak választható zenei csomagjaink és ezek árai.',
      referenciak: 'Itt találhatóak a zenekészítő már elkészült videói, példaként – hogy milyen minőségre számíthatsz.',
      megrendeles: 'Itt adhatod le a megrendelést. A mintaleírások segítenek a Leírás megfogalmazásában.',
      hogyan: 'Itt röviden elmagyarázzuk, hogyan zajlik a folyamat – a részletes kitöltést a Megrendelés fülön végezd.',
      kapcsolat: 'Itt tudsz üzenni és kérdezni tőlünk.'
    };
    const text = map[name] || 'Ez a rész segít, hogy gyorsan eligazodj ezen a fülön.';
    setBubbleText(text);
    toggleBubble(true);
    speak(text);
  }

  // --- Ékezetfüggetlen összehasonlító
  function norm(s){
    return (s || "")
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  // --- Fül-detektálás (marad)
  function bindTabs(){
    document.addEventListener('click', (e)=>{
      const tab = e.target.closest('.vinyl-tabs .tab, [data-tab], [data-target], nav a, .nav a, .menu a, a[href^="#"]');
      if(!tab) return;

      const href  = tab.getAttribute('href') || '';
      const dt    = tab.getAttribute('data-target') || '';
      const dtab  = tab.getAttribute('data-tab') || '';
      const aria  = tab.getAttribute('aria-controls') || '';
      const id    = tab.id || '';
      const label = tab.textContent || tab.getAttribute('aria-label') || '';

      const hintRaw = [href, dt, dtab, aria, id].join(' ');
      const hint = norm(hintRaw);
      const text = norm(label);

      if ( /how|hogyan|howto/.test(hint) || /hogyan/.test(text) ){
        describeTab('hogyan');
      }
      else if ( /ar|arak|price|pricing|csomag/.test(hint) || /arak|csomag/.test(text) ){
        describeTab('arak');
      }
      else if ( /order|rendel|megrendel/.test(hint) || /megrendeles|rendeles/.test(text) ){
        describeTab('megrendeles');
      }
      else if ( /ref|minta|referenc/.test(hint) || /referencia|referenciak|minta/.test(text) ){
        describeTab('referenciak');
      }
      else if ( /contact|kapcsol/.test(hint) || /kapcsolat/.test(text) ){
        describeTab('kapcsolat');
      }
      else if ( /bemut|fooldal|home|intro/.test(hint) || /bemutatkozas|fooldal|home/.test(text) ){
        describeTab('bemutatkozas');
      }
      else {
        describeTab('');
      }
    }, true);
  }

  // --- BRIEF placeholder/érték kiolvasása (Megrendelés)
  function getOrderBriefText() {
    const cand =
      document.querySelector('#order textarea, #order [name*="leiras" i], #order [name*="description" i]') ||
      document.querySelector('[data-section*="order" i] textarea, [data-section*="megrendel" i] textarea');

    if (!cand) return "";
    return (
      cand.getAttribute('placeholder') ||
      (typeof cand.value === 'string' ? cand.value : '') ||
      cand.textContent ||
      ''
    ).trim();
  }

  // --- Mintagombok: TELJES placeholdert mondunk ki; buborékban a rövid cím maradhat
  function bindExampleChips(){
    document.addEventListener('click', (e)=>{
      const chip = e.target.closest('.example-chip, .example, .chip, .minta, .mintaleiras, [data-example], [data-minta]');
      if(!chip) return;

      const inOrder = chip.closest('#order, [id*="order" i], [data-section*="order" i], [data-section*="megrendel" i], [data-target*="order" i], [href*="#order" i]');
      if(!inOrder) return;

      let full = (chip.getAttribute('data-example') || chip.getAttribute('data-minta') || chip.getAttribute('data-full') || '').trim();

      setTimeout(()=>{
        const briefNow = getOrderBriefText();
        if (briefNow) full = briefNow;
        if (!full) return;

        // Buborék: a rövid cím látszik, de a hang a TELJES szöveg
        const label = (chip.getAttribute('data-label') || '').trim();
        setBubbleText(label || full);
        toggleBubble(true);
        speak(full);
      }, 60);
    }, true);
  }

  // ====== Intro flight: videó play gomb kijelölés + jobb-alsóba állás ======
  function getPlayTarget(){
    const sel = [
      '.play-btn', '.video__play', '.video-play', '.hero-video .play',
      'button[aria-label*="lejátsz" i]', 'button[aria-label*="lejatsz" i]',
      '[data-action="play"]', '.plyr__control--overlaid', '.vjs-big-play-button'
    ].join(',');
    let el = document.querySelector(sel);
    if (el) return el;
    el = document.querySelector('#hero video, .hero video, video');
    if (el) return el;
    el = document.querySelector('#video, .video, [data-section*="video" i]');
    return el || null;
  }

  function rectCenter(el){
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2, r };
  }

  function showPointerAt(x, y){
    const ring = document.createElement('div');
    ring.className = 'nb-pointer';
    ring.style.left = (x - 28) + 'px';
    ring.style.top  = (y - 28) + 'px';
    document.body.appendChild(ring);
    setTimeout(()=> ring.remove(), 2200);
  }

  function positionBottomRight(){
    const root = document.getElementById('novabot');
    if(!root) return;
    const avatar = root.querySelector('.novabot-avatar');
    const w = avatar?.offsetWidth || 120;
    const h = avatar?.offsetHeight || 120;
    const pad = 18;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.style.left = (window.innerWidth  - w - pad) + 'px';
    root.style.top  = (window.innerHeight - h - pad) + 'px';
  }

  function runIntroFlight(){
    try{
      // csak egyszer / munkamenet, és ha nem kér kevesebb animációt
      if (sessionStorage.getItem('nb_intro_done')) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const target = getPlayTarget();
      if(!target) return;

      const root   = document.getElementById('novabot');
      const avatar = root?.querySelector('.novabot-avatar');
      if(!root || !avatar) return;

      // kezdőpozíció: balról „berepül”
      const startTop = Math.round(window.innerHeight * 0.3);
      root.classList.add('nb-inflight');
      root.style.transition = 'left 900ms cubic-bezier(.2,.7,.2,1), top 900ms cubic-bezier(.2,.7,.2,1)';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
      root.style.left = (- (avatar.offsetWidth || 120) - 40) + 'px';
      root.style.top  = startTop + 'px';

      // fénycsóva
      const trail = document.createElement('div');
      trail.className = 'novabot-fxTrail';
      avatar.appendChild(trail);
      setTimeout(()=> trail.remove(), 1000);

      // cél: play gomb közepe
      const { x, y } = rectCenter(target);
      const toLeft = Math.round(x - (avatar.offsetWidth||120)/2);
      const toTop  = Math.round(y - (avatar.offsetHeight||120)/2 - 8);

      // 1) berepül
      requestAnimationFrame(()=>{
        root.style.left = toLeft + 'px';
        root.style.top  = toTop  + 'px';
      });

      // 2) kijelölés + voice prompt
      setTimeout(()=>{
        showPointerAt(x, y);
        const msg = 'Indítsd el a videót!';
        setBubbleText(msg);
        toggleBubble(true);
        speak(msg);
      }, 950);

      // 3) jobb-alsó sarokba áll
      setTimeout(()=>{
        const pad = 18;
        const finalLeft = window.innerWidth  - (avatar.offsetWidth||120) - pad;
        const finalTop  = window.innerHeight - (avatar.offsetHeight||120) - pad;
        root.style.left = finalLeft + 'px';
        root.style.top  = finalTop  + 'px';

        setTimeout(()=>{
          root.classList.remove('nb-inflight');
          sessionStorage.setItem('nb_intro_done', '1');
        }, 900);
      }, 2000);

      window.addEventListener('resize', positionBottomRight);
    }catch(e){ /* no-op */ }
  }

  // --- textarea fókuszhint (marad)
  function bindOrderTextarea(){
    const tryBind = () => {
      const el = qs('#order textarea, #order [name*="leiras" i], #order [name*="description" i]');
      if(!el) return false;
      el.addEventListener('focus', ()=>{
        const msg = 'Írd le röviden az alkalmat, a hangulatot és pár kulcsszót. A mintaleírásokra kattintva felolvasom őket.';
        setBubbleText(msg);
        toggleBubble(true);
        speak(msg);
      }, {once:true});
      return true;
    };
    let attempts = 0;
    const iv = setInterval(()=>{
      attempts++;
      if(tryBind() || attempts>20) clearInterval(iv);
    }, 300);
  }

  // --- init
  function init(){
    createUI();
    bindTabs();
    bindExampleChips();
    bindOrderTextarea();

    // Intro flight a videó play gombhoz (egyszer / munkamenet)
    setTimeout(runIntroFlight, 700);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
