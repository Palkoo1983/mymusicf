import {createHash} from 'node:crypto';
import {validateQuote,signTicket,readTicket,validSignature,quoteId,CLIP_LIMITS} from './clipValidation.js';
import {createDrive} from './clipDrive.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createClipHandlers({env=process.env,drive=createDrive({env}),fetchImpl=globalThis.fetch,now=Date.now}={}){
 const ready=()=>env.VIDEOCLIPS_ENABLED==='true'&&!!env.ONEDRIVE_CLIENT_ID&&!!env.ONEDRIVE_REFRESH_TOKEN&&!!env.ONEDRIVE_FOLDER_ID&&(env.CLIP_SIGNING_SECRET||'').length>=32&&!!env.RESEND_API_KEY&&!!(env.MAIL_FROM||env.SMTP_FROM)&&!!(env.TO_EMAIL||env.NOTIFY_TO);
 const origins=new Set(['https://enzenem.hu','https://www.enzenem.hu']);try{origins.add(new URL(env.PUBLIC_URL).origin);}catch{}
 const hits=new Map(),locks=new Set();let day='',daily=0,creating=0;
 const fail=(res,status,code)=>res.status(status).json({ok:false,code});
 function guard(req,res){res.setHeader('Cache-Control','no-store');if(!ready()){fail(res,503,'unavailable');return false;}if(!origins.has(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site'){fail(res,403,'forbidden');return false;}return true;}
 function allow(req,kind,max,windowMs){const time=now();for(const [k,v] of hits)if(time-v.start>windowMs)hits.delete(k);const key=kind+':'+createHash('sha256').update(env.CLIP_SIGNING_SECRET+(req.socket?.remoteAddress||'shared')).digest('hex');const rec=hits.get(key)||{start:time,n:0};if(rec.n>=max||hits.size>=2000)return false;rec.n++;hits.set(key,rec);return true;}
 async function state(req){const t=readTicket(req.body?.ticket,env.CLIP_SIGNING_SECRET,now());const record=await drive.read(t.folder,'request.json');if(record.id!==t.id||record.folder!==t.folder)throw Error('expired');return {ticket:t,record};}
 async function mail(record,customer){
  const en=record.language==='en',id=record.id;
  const subject=customer?(en?'EnZenem – Music video quote request received':'EnZenem – Videoklip-ajánlatkérés beérkezett'):'EnZenem – Új videoklip-ajánlatkérés – '+id;
  const html=customer?(en?`<h2>Thank you, ${escape(record.name)}!</h2><p>Your files and quote request have arrived. Reference: <b>${id}</b>.</p><p>We will respond within 24 hours with a personalised quote or a clarification question. This is not a paid order. You will receive the exact price and bank transfer instructions with our quote. Please do not transfer money before accepting the quote. Work starts after agreement and receipt of the transfer.</p><p>Contact: info@enzenem.hu</p>`:`<h2>Köszönjük, ${escape(record.name)}!</h2><p>A fájljaid és az ajánlatkérésed beérkeztek. Azonosító: <b>${id}</b>.</p><p>24 órán belül személyre szabott ajánlattal vagy pontosító kérdéssel jelentkezünk. Ez még nem fizetett megrendelés. A pontos árat és az átutalási adatokat az ajánlattal küldjük. Az ajánlat elfogadása előtt ne utalj. A munka egyeztetés és az átutalás beérkezése után kezdődik.</p><p>Kapcsolat: info@enzenem.hu</p>`):
   `<h2>Videoklip – ajánlatkérés</h2><p>Azonosító: ${id}</p><p>Név: ${escape(record.name)}<br>E-mail: ${escape(record.email)}<br>Csomag: ${escape(record.package)}<br>Hossz: ${record.duration} perc<br>Képarány: ${escape(record.ratio)}<br>Felirat: ${record.subtitles?'igen':'nem'}<br>Szájszinkron: ${record.lipsync?'igen':'nem'}<br>Tájékoztató induló ár: ${record.startingPrice} Ft<br>Felület nyelve: ${record.language}<br>Korábbi rendelés: ${escape(record.priorOrder)}</p><h3>Elképzelés</h3><p>${escape(record.concept||'Rátok bízom a történetet.').replace(/\n/g,'<br>')}</p><h3>Dalszöveg</h3><p>${escape(record.lyrics||'Nem adott meg dalszöveget.').replace(/\n/g,'<br>')}</p><p><a href="${escape(record.folderUrl)}">Privát rendelési mappa megnyitása (tulajdonosi bejelentkezés szükséges)</a></p><ul>${record.files.map(f=>`<li>${escape(f.originalName)} → ${escape(f.storedName)} (${f.size} bájt)</li>`).join('')}</ul><p>Minden feltöltött fájl méretét és fájlfejlécét ellenőriztük. Visszajelzés: 24 órán belül. A végleges árat és elkészítési határidőt személyesen kell visszaigazolni. Fizetés: banki átutalás az ajánlat elfogadása után. Számlaszám: 10918001-00000134-59510006. Közlemény: az ajánlatkérés azonosítója. A jóváírást és a számlázást kézzel kell kezelni; ez az ág nem használja a dalrendelés fizetési rendszerét.</p>`;
  const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'clip/'+id+'/'+(customer?'customer':'owner')},body:JSON.stringify({from:env.MAIL_FROM||env.SMTP_FROM,to:customer?record.email:(env.TO_EMAIL||env.NOTIFY_TO),subject,html,reply_to:customer?'info@enzenem.hu':record.email})});
  if(!r.ok)throw Error('notification');const j=await r.json();if(!j.id)throw Error('notification');
 }
 return {
  config(req,res){res.setHeader('Cache-Control','no-store');res.json({enabled:!!ready(),limits:CLIP_LIMITS});},
  async start(req,res){if(!guard(req,res))return;let record;try{record=validateQuote(req.body);}catch{return fail(res,400,'invalid');}
   const today=new Date(now()).toISOString().slice(0,10);if(today!==day){day=today;daily=0;}
   if(creating>=2||daily>=20||!allow(req,'start',3,3600000))return fail(res,429,'limit');creating++;daily++;
   try{
    const id=quoteId(),folder=await drive.createFolder(id);if(!folder.id||!/^https:\/\//.test(folder.webUrl||''))throw Error('storage');
    record={...record,id,folder:folder.id,folderUrl:folder.webUrl,created:new Date(now()).toISOString(),status:'uploading',ownerSent:false,customerSent:false};
    await drive.write(folder.id,'request.json',record);
    const ticket=signTicket({id,folder:folder.id,expires:now()+24*3600000},env.CLIP_SIGNING_SECRET);
    res.json({ok:true,id,ticket});
   }catch{return fail(res,503,'unavailable');}finally{creating--;}
  },
  async upload(req,res){if(!guard(req,res))return;if(!allow(req,'upload',80,3600000))return fail(res,429,'limit');
   try{const {record}=await state(req);const i=req.body.index;if(!Number.isInteger(i)||!record.files[i])return fail(res,400,'invalid');if(record.status==='received')return res.json({ok:true,complete:true});
    const entry=record.files[i];try{const existing=await drive.get(record.folder,entry.storedName);if(existing.size===entry.size&&existing.file)return res.json({ok:true,complete:true});return fail(res,400,'file');}catch(e){if(e.message!=='missing')throw e;}
    const session=await drive.upload(record.folder,entry);res.json({ok:true,...session,size:entry.size});
   }catch(e){return fail(res,e.message==='expired'?410:503,e.message==='expired'?'expired':'unavailable');}
  },
  async finish(req,res){if(!guard(req,res))return;if(!allow(req,'finish',40,3600000))return fail(res,429,'limit');let record,lock;
   try{
    ({record}=await state(req));if(locks.has(record.id))return fail(res,409,'busy');lock=record.id;locks.add(lock);
    if(record.status!=='received'){
     for(const f of record.files){const item=await drive.get(record.folder,f.storedName);if(!item.file||item.size!==f.size||!validSignature(f.ext,await drive.prefix(item.id)))return fail(res,400,'file');}
     record.status='received';record.received=new Date(now()).toISOString();await drive.write(record.folder,'request.json',record);
    }
    if(!record.ownerSent){await mail(record,false);record.ownerSent=true;await drive.write(record.folder,'request.json',record);}
    if(!record.customerSent){await mail(record,true);record.customerSent=true;await drive.write(record.folder,'request.json',record);}
    res.json({ok:true,id:record.id});
   }catch(e){return fail(res,e.message==='expired'?410:503,e.message==='expired'?'expired':e.message==='notification'?'notification':e.message==='missing'?'file':'unavailable');}
   finally{if(lock)locks.delete(lock);}
  }
 };
}
export function registerClipRoutes(app){const h=createClipHandlers();app.get('/api/clips/config',h.config);app.post('/api/clips/start',h.start);app.post('/api/clips/upload',h.upload);app.post('/api/clips/finish',h.finish);}
