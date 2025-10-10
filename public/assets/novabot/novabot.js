
// === NovaBot Assistant v2 ===
(function(){
  const state = {
    bubbleOpen: false,
    synth: ('speechSynthesis' in window) ? window.speechSynthesis : null,
  };

  function setSpeaking(on){
    try{
      const root = document.getElementById('novabot');
      if(!root) return;
      root.classList.toggle('novabot-speaking', !!on);
    }catch(e){}
  }

  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

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

  function createUI(){
    if(qs('#novabot')) return;
    const root = document.createElement('div');
    root.id = 'novabot';

    const bubble = document.createElement('div');
    bubble.className = 'novabot-bubble';
    bubble.innerHTML = '<span class="novabot-close" aria-label="Bezárás" title="Bezárás">×</span><div class="nb-text">Szia, én vagyok NovaBot 🤖 – segítek eligazodni! Kattints rám vagy a menükre, és elmondom, mit hol találsz.</div>';
    root.appendChild(bubble);

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

  function pointToHowTo(){
    const candidates = qsa('a[href*=\"#how\" i], [data-target*=\"how\" i], .howto, #howto, [href=\"#howto\"]');
    if(candidates.length){
      candidates[0].classList.add('novabot-ctaPulse');
      setTimeout(()=>candidates[0].classList.remove('novabot-ctaPulse'), 4500);
    }
  }

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

 // Ékezet- és kis/nagybetű-független összehasonlító
function norm(s){
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize('NFD')               // ékezetek bontása
    .replace(/[\u0300-\u036f]/g,'') // ékezetek törlése
    .replace(/\s+/g,' ')            // felesleges whitespace
    .trim();
}

function bindTabs(){
  document.addEventListener('click', (e)=>{
    const tab = e.target.closest('.vinyl-tabs .tab, [data-tab], [data-target], nav a, .nav a, .menu a, a[href^="#"]');
    if(!tab) return;

    // Gyűjtsünk minden lehetséges „hintet”: attr + label
    const href  = tab.getAttribute('href') || '';
    const dt    = tab.getAttribute('data-target') || '';
    const dtab  = tab.getAttribute('data-tab') || '';
    const aria  = tab.getAttribute('aria-controls') || '';
    const id    = tab.id || '';
    const label = tab.textContent || tab.getAttribute('aria-label') || '';

    const hintRaw = [href, dt, dtab, aria, id].join(' ');
    const hint = norm(hintRaw);
    const text = norm(label);

    // Match-elés (ékezetfüggetlen)
    if ( /how|hogyan|howto/.test(hint) || /hogyan/.test(text) ){
      describeTab('hogyan');
    }
    else if ( /ar|arak|price|pricing|csomag/.test(hint) || /arak|csomag/.test(text) ){
      // Árak/Csomagok
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
      // Bemutatkozás
      describeTab('bemutatkozas');
    }
    else {
      describeTab('');
    }
  }, true);
}

  function bindExampleChips(){
    document.addEventListener('click', (e)=>{
      const chip = e.target.closest('.example-chip, .example, .chip, .minta, .mintaleiras, [data-example], [data-minta]');
      if(!chip) return;
      const inOrder = chip.closest('#order, [id*=\"order\" i], [data-section*=\"order\" i], [data-section*=\"megrendel\" i], [data-target*=\"order\" i], [href*=\"#order\" i]');
      if(!inOrder) return;
      const txt = (chip.getAttribute('data-example') || chip.getAttribute('data-minta') || chip.textContent || '').trim();
      if(!txt) return;
      setBubbleText(txt);
      toggleBubble(true);
      speak(txt);
    }, true);
  }

  function bindOrderTextarea(){
    const tryBind = () => {
      const el = qs('#order textarea, #order [name*=\"leiras\" i], #order [name*=\"description\" i]');
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
