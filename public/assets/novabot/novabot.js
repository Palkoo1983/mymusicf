(() => {
  const strings={
    hu:{open:'Kérdezz NovaBottól',close:'Bezárás',intro:'Szia! Kérdezhetsz a csomagokról, a rendelésről vagy más témáról is. Miben segíthetek?',notice:'AI-segítő, válaszai tévedhetnek. Egyedi rendelés ügyében: info@enzenem.hu. Ne adj meg érzékeny adatot!',consent:'Hozzájárulok, hogy a chatüzeneteimet és az utolsó 3 beszélgetési kört az OpenAI feldolgozza a válaszadáshoz.',privacy:'Adatkezelés',placeholder:'Írd ide a kérdésed…',send:'Küldés',clear:'Beszélgetés törlése',voice:'Válasz felolvasása',stop:'Felolvasás leállítása',waiting:'NovaBot válaszol…',unavailable:'A chat most nem elérhető. Próbáld később, vagy írj az info@enzenem.hu címre.',limit:'Elértük a használati limitet. Kérjük, próbáld később, vagy írj az info@enzenem.hu címre.',busy:'NovaBot most több kérdésre válaszol. Próbáld kicsit később.',invalid:'Legfeljebb 1200 karakteres kérdést írj, és fogadd el a chat adatkezelését.',voiceError:'A felolvasás ebben a böngészőben nem elérhető.',me:'Te',bot:'NovaBot',success:'A rendelésedet fogadtuk. Két dalváltozatot és PDF-dalszöveget kapsz a választott kézbesítési időn belül.',failed:'A rendelés nem sikerült. Kérlek, próbáld újra.'},
    en:{open:'Ask NovaBot',close:'Close',intro:'Hi! Ask me about packages, ordering or other topics. How can I help?',notice:'AI assistant: answers can be mistaken. Individual orders: info@enzenem.hu. Do not share sensitive information!',consent:'I consent to OpenAI processing my chat messages and the last 3 conversation turns to answer my questions.',privacy:'Privacy notice',placeholder:'Type your question…',send:'Send',clear:'Clear conversation',voice:'Read answer aloud',stop:'Stop reading',waiting:'NovaBot is replying…',unavailable:'Chat is currently unavailable. Please try later or email info@enzenem.hu.',limit:'The usage limit has been reached. Please try later or email info@enzenem.hu.',busy:'NovaBot is answering other questions. Please try again shortly.',invalid:'Enter a question of up to 1200 characters and accept chat data processing.',voiceError:'Read-aloud is unavailable in this browser.',me:'You',bot:'NovaBot',success:'Your order has been received. You will receive two song versions and PDF lyrics within your selected delivery time.',failed:'The order was unsuccessful. Please try again.'}
  };
  let root,panel,input,log,status,send,consent,launcher,history=[],busy=false,latest='',language;
  const lang=()=>document.documentElement.lang==='en'?'en':'hu';
  const t=key=>strings[lang()][key];
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}
  const stop=()=>{window.speechSynthesis?.cancel();root?.classList.remove('novabot-speaking');};
  function show(open){panel.hidden=!open;launcher.setAttribute('aria-expanded',String(open));if(open)input.focus();else{stop();launcher.focus();}}
  function append(role,text){const item=el('div','nb-message nb-'+role);item.append(el('strong','',t(role==='user'?'me':'bot')),el('p','',text));log.append(item);while(log.children.length>30)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;}
  function refresh(){language=lang();root.lang=language;root.querySelectorAll('[data-nb-copy]').forEach(n=>n.textContent=t(n.dataset.nbCopy));launcher.setAttribute('aria-label',t('open'));input.placeholder=t('placeholder');input.setAttribute('aria-label',t('placeholder'));root.querySelector('.nb-privacy').href='/adatkezeles.html'+(language==='en'?'#english':'');}
  function clear(){stop();history=[];latest='';log.replaceChildren();status.textContent='';append('assistant',t('intro'));}
  function button(key,fn){const b=el('button','',t(key));b.type='button';b.dataset.nbCopy=key;b.addEventListener('click',fn);return b;}
  function init(){
    if(document.getElementById('novabot'))return;
    root=el('div');root.id='novabot';
    panel=el('section','nb-chat');panel.id='nb-chat';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','NovaBot');
    const head=el('header','nb-head');head.append(el('strong','','NovaBot'),button('close',()=>show(false)));panel.append(head);
    const notice=el('p','nb-notice');notice.dataset.nbCopy='notice';panel.append(notice);
    log=el('div','nb-log');log.setAttribute('role','log');log.setAttribute('aria-live','polite');panel.append(log);
    const label=el('label','nb-consent');consent=el('input');consent.type='checkbox';const ct=el('span');ct.dataset.nbCopy='consent';label.append(consent,ct);
    const privacy=el('a','nb-privacy');privacy.dataset.nbCopy='privacy';privacy.target='_blank';privacy.rel='noopener';panel.append(label,privacy);
    const form=el('form','nb-form');input=el('textarea');input.maxLength=1200;input.rows=2;input.required=true;send=el('button','nb-send');send.type='submit';send.dataset.nbCopy='send';form.append(input,send);panel.append(form);
    status=el('p','nb-status');status.setAttribute('role','status');panel.append(status);
    const actions=el('div','nb-actions');const clearBtn=button('clear',()=>{clear();consent.checked=false;});
    actions.append(clearBtn,button('voice',()=>{
      if(!latest)return;
      if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){status.textContent=t('voiceError');return;}
      stop();const u=new SpeechSynthesisUtterance(latest);u.lang=lang()==='en'?'en-US':'hu-HU';const v=window.speechSynthesis.getVoices().find(v=>v.lang.startsWith(lang()));if(v)u.voice=v;
      u.onstart=()=>root.classList.add('novabot-speaking');u.onend=()=>root.classList.remove('novabot-speaking');u.onerror=()=>{root.classList.remove('novabot-speaking');status.textContent=t('voiceError');};
      try{window.speechSynthesis.speak(u);}catch{status.textContent=t('voiceError');}
    }),button('stop',stop));panel.append(actions);
    launcher=el('button','novabot-avatar');launcher.type='button';launcher.setAttribute('aria-controls','nb-chat');launcher.setAttribute('aria-expanded','false');const img=el('img');img.src='/assets/novabot/novabot.png';img.alt='';launcher.append(img);launcher.addEventListener('click',()=>show(panel.hidden));
    root.append(panel,launcher);document.body.append(root);refresh();clear();
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();show(false);}});
    new MutationObserver(()=>{if(language!==lang()){refresh();if(!history.length&&!busy)clear();}}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;const message=input.value.trim();if(!message||message.length>1200||!consent.checked){status.textContent=t('invalid');return;}
      busy=true;send.disabled=clearBtn.disabled=input.disabled=consent.disabled=true;stop();status.textContent=t('waiting');append('user',message);input.value='';
      let recent=history.slice(-6);while(recent.reduce((n,m)=>n+m.content.length,message.length)>9000)recent=recent.slice(2);
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
      try{
        const response=await fetch('/api/novabot/chat',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',signal:controller.signal,body:JSON.stringify({message,history:recent,consent:true})});
        const data=await response.json();if(!response.ok||!data.ok||typeof data.answer!=='string')throw new Error(data.code||'unavailable');
        latest=data.answer;append('assistant',latest);history=[...recent,{role:'user',content:message},{role:'assistant',content:latest}].slice(-6);status.textContent='';
      }catch(err){status.textContent=strings[lang()][err.message]||t('unavailable');input.value=message;}
      finally{clearTimeout(timer);busy=false;send.disabled=clearBtn.disabled=input.disabled=consent.disabled=false;if(!panel.hidden)input.focus();}
    });
  }
  window.novaBotSay=text=>{if(!root)init();append('assistant',window.EnzI18n?.t(text)||text);show(true);};
  window.novaOrderSuccess=()=>window.novaBotSay(t('success'));
  window.novaOrderFail=()=>window.novaBotSay(t('failed'));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
