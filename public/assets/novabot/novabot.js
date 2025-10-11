// === NovaBot Assistant v3.3 (stable dock + Samsung-only audio enable + talk visual + full-brief speech) ===
(function(){
  const state = {
    bubbleOpen: false,
    synth: ('speechSynthesis' in window) ? window.speechSynthesis : null,
  };

  // ---- böngésző detektálás (Samsung Internet) ----
  const UA = navigator.userAgent || "";
  const NB_IS_SAMSUNG = /SamsungBrowser/i.test(UA);

  // ---- audio flags ----
  let NB_AUDIO_ENABLED = true;  // always enabled; resume on first user gesture if needed  // Chrome/egyéb: induláskor engedélyezett; Samsungon nem
  let NB_VOICES_READY  = false;           // betöltöttek-e a TTS hangok

  // ---- helpers ---------------------------------------------------------
  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
  function norm(s){
    return (s || "").toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim();
  }

  // ---- speaking visuals ------------------------------------------------
  function setSpeaking(on){
    const root = document.getElementById('novabot');
    if(!root) return;
    root.classList.toggle('novabot-speaking', !!on);
  }

  // ---- TTS (Web Speech API) --------------------------------------------
  function speak(text){
    try{
      // Samsung Internet: TTS csak felhasználói gesztus után
      if (!state.synth || !NB_AUDIO_ENABLED) {
        setSpeaking(false);
        return;
      }

      // Voices betöltése (egyes böngészőkben csak később jön meg)
      const loadVoices = () => {
        const voices = state.synth.getVoices();
        if (voices && voices.length) {
          NB_VOICES_READY = true;
          return voices;
        }
        return [];
      };

      let voices = loadVoices();
      if (!NB_VOICES_READY) {
        state.synth.onvoiceschanged = () => { NB_VOICES_READY = true; };
        setTimeout(()=>{ voices = loadVoices(); }, 120);
      }

      state.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);

      // magyar hang preferencia
      const hu = (voices||[]).find(v => /hu|hungar/i.test(v.lang));
      if (hu) u.voice = hu;
      u.lang = hu ? hu.lang : 'hu-HU';
      u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;

      u.onstart = ()=> setSpeaking(true);
      u.onend   = ()=> setSpeaking(false);
      u.onerror = ()=> setSpeaking(false);

      state.synth.speak(u);
    }catch(e){
      setSpeaking(false);
    }
  }

  // ---- UI létrehozás ---------------------------------------------------
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

    // beszéd-hullám vizuál (kis pulzáló pont – CSS pozicionálja "száj" alá)
    const talk = document.createElement('div');
    talk.className = 'novabot-talkWave';
    avatarWrap.appendChild(talk);

    root.appendChild(avatarWrap);
    document.body.appendChild(root);

    // ---- Hang engedélyezése gomb (CSAK Samsung Interneten) ----
    if (false && NB_IS_SAMSUNG) {  // sound button removed
      const soundBtn = document.createElement('button');
      soundBtn.type = 'button';
      soundBtn.className = 'novabot-sound-btn';
      soundBtn.textContent = 'Hang engedélyezése';
      soundBtn.setAttribute('aria-label', 'Hang engedélyezése');
      root.appendChild(soundBtn);

      const enableAudio = ()=>{
        NB_AUDIO_ENABLED = true;
        try { state.synth?.cancel(); state.synth?.resume?.(); } catch(e){}
        soundBtn.classList.add('hide');
      };

      // gomb kattintásra engedélyezünk
      soundBtn.addEventListener('click', (e)=>{
        if (!e.isTrusted) return; // csak valódi érintés
        e.stopPropagation();
        enableAudio();
      });

      // első user GESZTUSRA is (csak touchstart, és csak Samsungon)
      const firstGesture = (ev)=>{
        if (!ev.isTrusted) return;
        enableAudio();
        document.removeEventListener('touchstart', firstGesture, {passive:true});
      };
      document.addEventListener('touchstart', firstGesture, {passive:true});
    } else {
      // nem Samsung → azonnal engedélyezett, gomb sincs
      // NB_AUDIO_ENABLED már true alapból
    }

    // indulás: dokkolt jobb-alsó sarokban
    root.classList.add('nb-docked');

    // global first-interaction resume for WebView/Samsung/Messenger
    (function(){
      const resume = ()=>{
        try { state.synth?.resume?.(); } catch(e){}
        NB_AUDIO_ENABLED = true;
        document.removeEventListener('pointerdown', resume, true);
        document.removeEventListener('touchstart', resume, true);
        document.removeEventListener('click', resume, true);
      };
      document.addEventListener('pointerdown', resume, true);
      document.addEventListener('touchstart', resume, true);
      document.addEventListener('click', resume, true);
    })();
ick', resume, true);
      };
      document.addEventListener('pointerdown', resume, true);
      document.addEventListener('touchstart', resume, true);
      document.addEventListener('click', resume, true);
    })();

    // interakciók
    avatarWrap.addEventListener('click', () => {
      toggleBubble(true);
      const msg = 'Szia, én vagyok NovaBot! Itt vagyok lent és segítek Neked. Próbáld ki a bakelit lemez füleket vagy kattints a Megrendelés lemezre.';
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

  // ---- Tab leírások ----------------------------------------------------
  function describeTab(name){
    const map = {
      bemutatkozas: 'Ez a rész bemutatja, mivel foglalkozik a weboldalunk.',
      arak: 'Ebben a részben találhatóak választható zenei csomagjaink és ezek árai, díjai.',
      referenciak: 'Itt találhatóak a weboldal tulajdonosának eredeti videói, példaként – hogy megtudd, milyen minőségre számíthatsz.',
      megrendeles: 'Itt adhatod le a megrendelést. A mintaleírások segítenek a Leírás megfogalmazásában, görgess le és próbáld ki.',
      hogyan: 'Itt röviden elmagyarázzuk, hogyan zajlik a folyamat, a tényleges vásárlást a Megrendelés fülön tudod megtenni.',
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

  // ---- BRIEF kiolvasása (Megrendelés) ---------------------------------
  function getOrderBriefText() {
    const cand =
      document.querySelector('#order textarea, #order [name*="leiras" i], #order [name*="description" i]') ||
      document.querySelector('[data-section*="order" i] textarea, [data-section*="megrendel" i] textarea');

    if (!cand) return "";
    return (
      cand.getAttribute('placeholder') ||
      (typeof cand.value === 'string' ? cand.value : '') ||
      cand.textContent || ''
    ).trim();
  }

  // ---- Mintagombok: TELJES placeholdert mondunk -----------------------
  function bindExampleChips(){
    document.addEventListener('click', (e)=>{
      const chip = e.target.closest('.example-chip, .example, .chip, .minta, .mintaleiras, [data-example], [data-minta]');
      if(!chip) return;

      const inOrder = chip.closest('#order, [id*="order" i], [data-section*="order" i], [data-section*="megrendel" i], [data-target*="order" i], [href*="#order" i]');
      if(!inOrder) return;

      let full = (chip.getAttribute('data-example') || chip.getAttribute('data-minta') || chip.getAttribute('data-full') || '').trim();

      // Ha másik script most állít placeholdert, várunk kicsit és újraolvasunk
      setTimeout(()=>{
        const briefNow = getOrderBriefText();
        if (briefNow) full = briefNow;
        if (!full) return;

        // Buborék: rövid cím, hang: TELJES szöveg
        const label = (chip.getAttribute('data-label') || '').trim();
        setBubbleText(label || full);
        toggleBubble(true);
        speak(full);
      }, 60);
    }, true);
  }

  // ---- (Opcióként marad) Play célpont kereső – ha később újra kell ----
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

  // ---- Intro flight: KIKAPCSOLVA (stabil dokk) -------------------------
  function runIntroFlight(){
    // csak dokkoljunk stabilan jobb-alsó sarokba, nincs animáció
    try { sessionStorage.setItem('nb_intro_done', '1'); } catch(e){}
    const root = document.getElementById('novabot');
    if (!root) return;
    root.classList.remove('nb-flying', 'nb-inflight');
    root.classList.add('nb-docked');

    // global first-interaction resume for WebView/Samsung/Messenger
    (function(){
      const resume = ()=>{
        try { state.synth?.resume?.(); } catch(e){}
        NB_AUDIO_ENABLED = true;
        document.removeEventListener('pointerdown', resume, true);
        document.removeEventListener('touchstart', resume, true);
        document.removeEventListener('click', resume, true);
      };
      document.addEventListener('pointerdown', resume, true);
      document.addEventListener('touchstart', resume, true);
      document.addEventListener('click', resume, true);
    })();
ick', resume, true);
      };
      document.addEventListener('pointerdown', resume, true);
      document.addEventListener('touchstart', resume, true);
      document.addEventListener('click', resume, true);
    })();
    root.style.transform  = 'none';
    root.style.transition = 'none';
    root.style.left = ''; root.style.top = ''; root.style.right = ''; root.style.bottom = '';
  }

  // ---- Textarea fókusz hint -------------------------------------------
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

  // ---- init ------------------------------------------------------------
  function init(){
    createUI();
    bindTabs();
    bindExampleChips();
    bindOrderTextarea();
    setTimeout(runIntroFlight, 700); // most no-op: stabil dokkolás
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
