
// === NovaBot Assistant ===
(function(){
  const state = {
    bubbleOpen: false,
    synth: ('speechSynthesis' in window) ? window.speechSynthesis : null,
    voice: null,
  };

  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function speak(text){
    try{
      if(!state.synth) return;
      // stop previous
      state.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      // prefer Hungarian if available, else default
      const voices = state.synth.getVoices();
      const hu = voices.find(v => /hu|hungar/i.test(v.lang));
      if(hu) u.voice = hu;
      u.rate = 1.0; u.pitch = 1.0;
      state.synth.speak(u);
    }catch(e){/* noop */}
  }

  function createUI(){
    if(qs('#novabot')) return;
    const root = document.createElement('div');
    root.id = 'novabot';

    // bubble
    const bubble = document.createElement('div');
    bubble.className = 'novabot-bubble';
    bubble.innerHTML = '<span class="novabot-close" aria-label="Bezárás" title="Bezárás">×</span><div class="nb-text">Szia, én vagyok Nova 🤖 – segítek eligazodni! Kattints rám vagy a menükre, és elmondom, mit hol találsz.</div>';
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

    root.appendChild(avatarWrap);
    document.body.appendChild(root);

    // interactions
    avatarWrap.addEventListener('click', () => {
      toggleBubble(true);
      speak('Szia, én vagyok Nova! Itt a jobb alsó sarokban segítek. Próbáld ki a fenti füleket, vagy a Megrendelés részt!');
      pointToHowTo();
    });

    bubble.querySelector('.novabot-close').addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleBubble(false);
      if(state.synth) state.synth.cancel();
    });

    // initial gentle greet after user interaction (safer for autoplay)
    setTimeout(()=>{
      toggleBubble(true);
    }, 1200);
  }

  function toggleBubble(show){
    const b = qs('.novabot-bubble');
    if(!b) return;
    state.bubbleOpen = !!show;
    b.classList.toggle('show', state.bubbleOpen);
  }

  function pointToHowTo(){
    // Try to highlight "Hogyan működik" or similar navigation or CTA
    const candidates = qsa('a[href*="#how"], [data-target*="how"], .howto, #howto, [href="#howto"]');
    if(candidates.length){
      candidates[0].classList.add('novabot-ctaPulse');
      setTimeout(()=>candidates[0].classList.remove('novabot-ctaPulse'), 4500);
    }
  }

  // Describe current tab / page section
  function describeTab(name){
    const b = qs('.novabot-bubble .nb-text');
    if(!b) return;
    const map = {
      bemutatkozas: 'Itt megismerheted az EnZenem.hu-t és a személyre szabott dalok ötletét.',
      arak: 'Itt megtalálod a csomagokat és az árakat. Válaszd ki, ami neked a legjobb!',
      megrendeles: 'Itt adhatod le a megrendelést. A mintaleírások segítenek a brief megfogalmazásában.',
      hogyan: 'Itt röviden elmagyarázzuk, hogyan zajlik a folyamat – de a részletes kitöltést a Megrendelés fülön végezd.',
      kapcsolat: 'Itt tudsz üzenni és kérdezni tőlünk.'
    };

    let text = map[name] || 'Ez a rész segít, hogy gyorsan eligazodj ezen a fülön.';
    b.textContent = text;
    toggleBubble(true);
    speak(text);
  }

  // Listen to vinyl tab clicks (generic)
  function bindTabs(){
    document.addEventListener('click', (e)=>{
      const tab = e.target.closest('.vinyl-tabs .tab, [data-tab], [data-target]');
      if(!tab) return;
      const target = (tab.getAttribute('data-tab') || tab.getAttribute('data-target') || '').toLowerCase();
      if(target){
        if(/how/.test(target)) describeTab('hogyan');
        else if(/ar|price|csomag|arak/.test(target)) describeTab('arak');
        else if(/order|rendel|megrendel/.test(target)) describeTab('megrendeles');
        else if(/contact|kapcsol/.test(target)) describeTab('kapcsolat');
        else if(/bemut|home|fooldal/.test(target)) describeTab('bemutatkozas');
        else describeTab('');
      }
    }, true);
  }

  // Read out example / brief chips when clicked – only on Megrendelés
  function bindExampleChips(){
    document.addEventListener('click', (e)=>{
      const chip = e.target.closest('.example-chip, [data-example], .example');
      if(!chip) return;
      // ensure within order/megrendel section
      const inOrder = chip.closest('#order, [data-section*="order"], [data-section*="megrendel"], [data-target*="order"]');
      if(!inOrder) return;
      const txt = chip.getAttribute('data-example') || chip.textContent.trim();
      if(!txt) return;

      const b = qs('.novabot-bubble .nb-text');
      if(b){
        b.textContent = txt;
        toggleBubble(true);
      }
      speak(txt);
    }, true);
  }

  // When user focuses description textarea in order form, guide them
  function bindOrderTextarea(){
    const tryBind = () => {
      const el = qs('#order textarea, #order [name*="leiras"], #order [name*="description"]');
      if(!el) return false;
      el.addEventListener('focus', ()=>{
        const msg = 'Írd le röviden az alkalmat, a hangulatot és pár kulcsszót. Ha rákattintasz bármelyik mintára, felolvasom neked.';
        const b = qs('.novabot-bubble .nb-text');
        if(b){
          b.textContent = msg;
          toggleBubble(true);
        }
        speak(msg);
      }, {once:true});
      return true;
    };
    // retry a few times in case the DOM loads later
    let attempts = 0;
    const iv = setInterval(()=>{
      attempts++;
      if(tryBind() || attempts>20) clearInterval(iv);
    }, 300);
  }

  function init(){
    createUI();
    bindTabs();
    bindExampleChips();
    bindOrderTextarea();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
