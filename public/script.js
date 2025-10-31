// --- Betöltéskor NE állítsa vissza a böngésző a korábbi görgetési pozíciót ---
(function() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
})();

// === NovaBot hooks (SAFE) ==========================================
(function(){
  function nbSay(text){ try { if (window.novaBotSay) window.novaBotSay(text); } catch(_) {} }
  window.novaOrderSuccess = () => nbSay('Éljen, megrendelésedet elküldted, 48 órán belül megkapod a dalodat.');
  window.novaOrderFail    = () => nbSay('Oh :(, megrendelésed nem sikerült, kérlek próbáld újra');
})();

// === Samsung Internet detektálás ===================================
(function () {
  try {
    var ua = navigator.userAgent || "";
    if (ua.includes("SamsungBrowser")) document.documentElement.classList.add("ua-samsung");
  } catch (e) { console.warn("Samsung detection error:", e); }
})();

// --- WebView + Desktop-Safe flags ----------------------------------
(function () {
  try {
    var html = document.documentElement, ua = navigator.userAgent || "";
    var isAndroid = /Android/i.test(ua), isIOS = /iPhone|iPad|iPod/i.test(ua);
    var isAndroidWV = isAndroid && /\bwv\b/i.test(ua);
    var isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    var isIOSWV = isIOS && (!isSafari || !!(window.webkit && window.webkit.messageHandlers));

    function isMobileLike(){
      try{
        var c = matchMedia("(pointer: coarse)").matches, h = matchMedia("(hover: none)").matches;
        return (isAndroid || isIOS || (c && h));
      }catch(_){ return (isAndroid || isIOS); }
    }
    function isDesktopLike(){
      try{
        return matchMedia("(pointer: fine) and (hover: hover)").matches && !(isAndroid || isIOS);
      }catch(_){ return !(isAndroid || isIOS); }
    }

    var lastSig = "";
    function applyFlagsCore(){
      var mobileLike = isMobileLike(), desktopLike = isDesktopLike(), looksDesktop = innerWidth >= 900;
      var need = [];
      if (isAndroidWV) need.push("ua-androidwv");
      if (isIOSWV) need.push("ua-ioswv");
      if (isAndroidWV || isIOSWV) need.push("ua-webview");
      if (mobileLike) need.push("ua-mobilelike");
      if (mobileLike && looksDesktop && !desktopLike) need.push("ua-desktopreq");
      var sig = need.join("|"); if (sig === lastSig) return;
      html.classList.remove("ua-androidwv","ua-ioswv","ua-mobilelike","ua-desktopreq","ua-webview");
      need.forEach(c=>html.classList.add(c)); lastSig = sig;
    }
    applyFlagsCore();
    function throttle(fn, ms){ let t=null, pend=false; return function(){ if(t){pend=true;return;}
      let a=arguments; t=setTimeout(()=>{t=null;fn.apply(null,a);if(pend){pend=false;fn.apply(null,a);}},ms);} }
    var onResize = throttle(applyFlagsCore,250);
    addEventListener("resize",onResize,{passive:true});
    addEventListener("orientationchange",applyFlagsCore);
  } catch(e) {}
})();

/* ---------- helpers ---------- */
async function postJSON(url, data){
  const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json().catch(()=>({}));
}
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));

/* ---------- tabs ---------- */
function initTabs(){
  const buttons=qsa('.tab'),panels=qsa('main .panel');
  function activate(id){
    if(!id)return;
    if(document.activeElement?.blur)document.activeElement.blur();
    panels.forEach(p=>{const on=p.id===id;p.hidden=!on;p.classList.toggle('active',on);
      on?p.removeAttribute('inert'):p.setAttribute('inert','');});
    buttons.forEach(b=>{const on=b.dataset.target===id;
      b.setAttribute('aria-pressed',on?'true':'false');b.classList.toggle('active',on);});
    if(id==='order')setTimeout(initBriefHelper,50);
    const active=panels.find(p=>p.id===id),h2=active?.querySelector('h2');
    if(h2){h2.setAttribute('tabindex','-1');h2.focus();}
    scrollTo({top:0,behavior:'smooth'});
  }
  const activePanel=panels.find(p=>p.classList.contains('active'))||panels[0];
  panels.forEach(p=>(p.hidden=p!==activePanel));
  buttons.forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();activate(btn.dataset.target);}));
}

/* ---------- packages ---------- */
function initPackages(){
  const cards=qsa('.card.package'),orderTabBtn=qs('.tab[data-target="order"]');
  cards.forEach(card=>{
    card.addEventListener('click',()=>{
      cards.forEach(c=>c.classList.remove('selected'));card.classList.add('selected');
      const pkg=card.getAttribute('data-package');orderTabBtn?.click();
      setTimeout(()=>{
        scrollTo({top:0,behavior:'smooth'});
        const sel=qs('#order select[name="package"]'); if(!sel)return;
        if(pkg==='mp3') sel.value='basic';
        else if(pkg==='mp4') sel.value='video';
        else if(pkg==='wav') sel.value='premium';
        sel.dispatchEvent(new Event('change',{bubbles:true}));
      },60);
    });
  });
}

/* ---------- HOWTO ---------- */
function initHowTo(){
  const howto=qs('#howto'); if(!howto)return;
  const orderTabSelector='.vinyl-tabs .tab[data-target="order"]';
  function gotoOrder(){
    const btn=qs(orderTabSelector); if(!btn)return; btn.click();
    setTimeout(()=>{scrollTo({top:0,behavior:'smooth'});
      const desc=qs('#order textarea[name="brief"]'); if(desc)try{desc.focus({preventScroll:true});}catch(_){};
    },60);
  }
  qs('#howto-open-order')?.addEventListener('click',e=>{e.preventDefault();gotoOrder();});
  howto.addEventListener('click',e=>{
    const chip=e.target.closest('[data-example], .example-chip, .chip.example, .brief-example, .chip');
    if(!chip)return; e.preventDefault(); e.stopPropagation();
    const text=chip.getAttribute('data-example')||chip.getAttribute('data-text')||(chip.textContent||'').trim();
    gotoOrder();
    setTimeout(()=>{
      const desc=qs('#order textarea[name="brief"]'); if(!desc)return;
      desc.placeholder=text; desc.dispatchEvent(new Event('input',{bubbles:true}));
      if(innerWidth<640){try{desc.focus({preventScroll:true});}catch(_){}
        desc.scrollIntoView({behavior:'smooth',block:'center'});}
      else qs('#order')?.scrollIntoView({behavior:'smooth',block:'start'});
    },400);
  });
}

/* ---------- Brief helper + validation ---------- */
function initBriefHelper(){
  const orderPanel=qs('#order'); if(!orderPanel)return;
  if(qs('#enz-quality',orderPanel))return;
  const desc=qs('textarea[name="brief"]',orderPanel); if(!desc)return;

  const info=document.createElement('div');
  info.id='enz-quality'; info.style.fontSize='12px'; info.style.marginTop='6px';
  info.classList.add('too-short');
  info.innerHTML='<span id="enz-count">0</span> / 120 <span id="enz-ok-label"></span>';
  desc.insertAdjacentElement('afterend',info);

  const countEl=qs('#enz-count',info),okLabel=qs('#enz-ok-label',info);
  function updateQuality(){
    const len=(desc.value||'').trim().length;
    countEl.textContent=String(len);
    const ok=len>=120;
    info.classList.toggle('ok',ok);
    info.classList.toggle('too-short',!ok);
    okLabel.textContent=ok?' — Elfogadható':'';
  }
  desc.addEventListener('input',updateQuality); updateQuality();

  const form=desc.closest('form');
  form?.addEventListener('submit',e=>{
    if((desc.value||'').trim().length<120){
      e.preventDefault();
      alert('A leírás túl rövid, kérlek írj legalább 120 karaktert.');
      desc.focus();
    }
  });
}

/* ---------- Contact form ---------- */
function initContactForm(){
  const f=qs('#contactForm'), s=qs('#contactStatus'), o=qs('#thanksOverlay'), c=qs('#overlayClose');
  if(!f)return;
  f.setAttribute('action','javascript:void(0)');
  f.addEventListener('submit',async e=>{
    e.preventDefault(); e.stopPropagation(); if(s)s.textContent='Küldés...';
    const data=Object.fromEntries(new FormData(f).entries());
    try{
      const j=await postJSON('/api/contact',data);
      if(s)s.textContent=j.message||'Köszönjük! Hamarosan válaszolunk.';
      f.reset(); o?.classList.remove('hidden');
    }catch(err){ if(s)s.textContent='Nem sikerült elküldeni.'; console.error(err);}
  });
  c?.addEventListener('click',()=>o?.classList.add('hidden'));
}

/* ---------- Consent ---------- */
function initConsent(){
  const bar=qs('#consent'),accept=qs('#consentAccept'); if(!bar||!accept)return;
  if(localStorage.getItem('enz-consent')==='1') bar.style.display='none';
  else bar.style.display='';
  accept.addEventListener('click',()=>{localStorage.setItem('enz-consent','1');bar.style.display='none';});
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  initTabs(); initPackages(); initHowTo(); initBriefHelper();
  initContactForm(); initConsent();
});

/* ---------- WebView patch + logo fixek ---------- */
(function(){
  const logo=document.querySelector('.topbar .brand > img.spinning-vinyl, .site-logo img');
  if(!logo)return;
  if(!logo.closest('.spin-wrap')){
    const w=document.createElement('span'); w.className='spin-wrap';
    logo.parentNode.insertBefore(w,logo); w.appendChild(logo);
  }
  const wrap=logo.closest('.spin-wrap');
  const tab=document.querySelector('.vinyl-tabs .tab');
  const baseW=tab?tab.getBoundingClientRect().width:logo.getBoundingClientRect().width;
  const size=Math.round(baseW);
  wrap.style.width=size+'px'; wrap.style.height=size+'px';
  logo.style.animation='none'; logo.style.transform='none';
  logo.style.width='100%'; logo.style.height='100%';
})();
