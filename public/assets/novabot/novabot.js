// === NovaBot Assistant v3.1 (intro flight + dock fix + talk visual + full-brief speech) ===
(function(){
  const state = {
    bubbleOpen: false,
    synth: ('speechSynthesis' in window) ? window.speechSynthesis : null,
  };

  // —— helpers ——————————————————————————————————————————————————————
  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  // ékezetfüggetlen normálás (tab detektáláshoz)
  function norm(s){
    return (s || "")
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  // —— beszéd (Web Speech API) ————————————————————————————————
  function setSpeaking(on){
    const root = document.getElementById('novabot');
    if(!root) return;
    root.classList.toggle('novabot-speaking', !!on);
  }

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
      u.onend   = ()=> setSpeaking(false);
      u.onerror = ()=> setSpeaking(false);
      state.synth.speak(u);
    }catch(e){ setSpeaking(false); }
  }

  // —— UI létrehozás ———————————————————————————————————————————————
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

    // induláskor legyen dokkolva jobb-alsó sarokban (CSS: #novabot.nb-docked)
    root.classList.add('nb-docked');

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
    if(b) b.textContent = t;
  }

  function toggleBubble(show){
    const b = qs('.novabot-bubble');
    if(!b) return;
    state.bubbleOpen = !!show;
    b.classList.toggle('show', state.bubbleOpen);
  }

  // —— fül-leírások (változatlan logika, HU szövegek) ——————————
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

  function pointToHowTo(){
    const candidates = qsa('a[href*="#how" i], [data-target*="how" i], .howto, #howto, [href="#howto"]');
    if(candidates.length){
      candidates[0].classList.add('novabot-ctaPulse');
      setTimeout(()=>candidates[0].classList.remove('novabot-ctaPulse'), 4500);
    }
  }

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

      const hint = norm([href, dt, dtab, aria, id].join(' '));
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

  // —— BRIEF kiolvasása (Megrendelés) ————————————————————————
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

  // —— Mintagombok: TELJES placeholdert mondunk; buborékban a rövid cím marad ——
  function bindExampleChips(){
    document.addEventListener('click', (e)=>{
      const chip = e.target.closest('.example-chip, .example, .chip, .minta, .mintaleiras, [data-example], [data-minta]');
      if(!chip) return;

      const inOrder = chip.closest('#order, [id*="order" i], [data-section*="order" i], [data-section*="megrendel" i], [data-target*="order" i], [href*="#order" i]');
      if(!inOrder) return;

      let full = (chip.getAttribute('data-example') || chip.getAttribute('data-minta') || chip.getAttribute('data-full') || '').trim();

      // Ha másik script most állít placeholdert, várunk 1 kicsit és újraolvasunk
      setTimeout(()=>{
        const briefNow = getOrderBriefText();
        if (briefNow) full = briefNow;
        if (!full) return;

        // Buborék: rövid cím (ha van), hang: TELJES szöveg
        const label = (chip.getAttribute('data-label') || '').trim();
        setBubbleText(label || full);
        toggleBubble(true);
        speak(full);
      }, 60);
    }, true);
  }

  // —— Intro flight a videó lejátszó gombhoz ————————————————
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
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function showPointerAt(x, y){
    const ring = document.createElement('div');
    ring.className = 'nb-pointer';
    ring.style.left = (x - 28) + 'px';
    ring.style.top  = (y - 28) + 'px';
    document.body.appendChild(ring);
    setTimeout(()=> ring.remove(), 2200);
  }

  // — dokkolás helper: mindig vissza jobb-alsó sarokba ————————
  function dockBottomRight(){
    const root = document.getElementById('novabot');
    if(!root) return;
    root.style.left = '';
    root.style.top  = '';
    root.style.right = '';
    root.style.bottom = '';
    root.style.transition = 'none';
    root.classList.remove('nb-inflight');
    root.classList.add('nb-docked');
  }

function runIntroFlight(){
  try{
    if (sessionStorage.getItem('nb_intro_done')) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const target = getPlayTarget();
    if(!target) return;

    const root   = document.getElementById('novabot');
    const avatar = root?.querySelector('.novabot-avatar');
    if(!root || !avatar) return;

    const MSG_PLAY    = 'Indítsd el a videót!';
    const MSG_WELCOME = 'Szia, én vagyok NovaBot 🤖 – segítek eligazodni! Kattints rám vagy a menükre, és elmondom, mit hol találsz.';

    // segéd: animált mozgatás transformmal
    const flyTo = (x, y, dur=800) => new Promise(resolve=>{
      root.classList.add('nb-flying');
      // kényszerített reflow, hogy a transition biztosan érvényesüljön
      void root.offsetWidth;
      root.style.transition = `transform ${dur}ms cubic-bezier(.2,.7,.2,1)`;
      const onEnd = (ev)=>{
        if(ev.propertyName === 'transform'){
          root.removeEventListener('transitionend', onEnd);
          resolve();
        }
      };
      root.addEventListener('transitionend', onEnd);
      root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    });

    // 0) indulás: vegyük le a dokkolást, repülés mód
    root.classList.remove('nb-docked');
    root.classList.add('nb-flying');
    root.style.transform = `translate3d(-${(avatar.offsetWidth||120)+40}px, -${(avatar.offsetHeight||120)+40}px, 0)`; // bal-felsőből

    // 1) cél 1: play gomb közepe
    const r   = target.getBoundingClientRect();
    const cx  = r.left + r.width/2;
    const cy  = r.top  + r.height/2;
    const toX = cx - (avatar.offsetWidth||120)/2;
    const toY = cy - (avatar.offsetHeight||120)/2 - 8;

    flyTo(toX, toY, 800).then(()=>{
      // célgyűrű + voice
      const ring = document.createElement('div');
      ring.className = 'nb-pointer';
      ring.style.left = (cx - 28) + 'px';
      ring.style.top  = (cy - 28) + 'px';
      document.body.appendChild(ring);
      setTimeout(()=> ring.remove(), 2100);

      setBubbleText(MSG_PLAY);
      toggleBubble(true);
      speak(MSG_PLAY);

      // 2s-ig maradunk itt, aztán jobb-alsó
      setTimeout(async ()=>{
        const pad = 18;
        const finalX = window.innerWidth  - (avatar.offsetWidth||120) - pad;
        const finalY = window.innerHeight - (avatar.offsetHeight||120) - pad;

        await flyTo(finalX, finalY, 800);

        // DOKKOLÁS: vissza jobb-alsó sarokba, transform törlés
        root.classList.remove('nb-flying');
        root.classList.add('nb-docked');
        root.style.transform = 'none';
        root.style.transition = 'none';

        // üdv buborék (ha hangot is akarsz, tedd ide a speak-et)
        setBubbleText(MSG_WELCOME);
        toggleBubble(true);
        // speak(MSG_WELCOME);

        sessionStorage.setItem('nb_intro_done', '1');
      }, 2000);
    });

  }catch(e){ /* no-op */ }
}


  // —— Textarea fókusz hint ————————————————————————————————
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

  // —— init ————————————————————————————————————————————————————
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
