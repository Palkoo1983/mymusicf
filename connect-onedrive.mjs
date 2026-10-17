// Run locally as the owner. Never publish the generated credential file.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createDrive} from './clipDrive.js';
const client=process.env.ONEDRIVE_CLIENT_ID;
if(!client){console.error('Előbb add meg az ONEDRIVE_CLIENT_ID környezeti változót. Útmutató: VIDEOKLIP-TELEPITES.md');process.exit(1);}
const tenant='consumers',base=`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/`;
async function post(route,body){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(20000)});return {ok:r.ok,...await r.json()};}
const d=await post('devicecode',{client_id:client,scope:'offline_access Files.ReadWrite'});
if(!d.device_code){console.error('Nem sikerült a bejelentkezés indítása:',d.error||'ismeretlen hiba');process.exit(1);}
console.log('Nyisd meg saját böngésződben:',d.verification_uri,'\nBejelentkezési kód:',d.user_code,'\nCsak a saját alkalmazásodnak add meg a fájlhozzáférést.');
let tokens,interval=(d.interval||5)*1000;const deadline=Date.now()+d.expires_in*1000;
while(Date.now()<deadline){await new Promise(r=>setTimeout(r,interval));const t=await post('token',{client_id:client,grant_type:'urn:ietf:params:oauth:grant-type:device_code',device_code:d.device_code});if(t.access_token){tokens=t;break;}if(t.error==='slow_down'){interval+=5000;continue;}if(t.error==='authorization_pending')continue;console.error('Bejelentkezés nem sikerült:',t.error);process.exit(1);}
if(!tokens?.refresh_token)throw Error('A bejelentkezés lejárt vagy nincs offline hozzáférés.');
const folderPath=process.env.ONEDRIVE_FOLDER_PATH||'Videoklip készítés';
const lookup=process.env.ONEDRIVE_FOLDER_ID?'/items/'+encodeURIComponent(process.env.ONEDRIVE_FOLDER_ID):'/root:/'+folderPath.split('/').map(encodeURIComponent).join('/');
const r=await fetch('https://graph.microsoft.com/v1.0/me/drive'+lookup,{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(20000)});
if(!r.ok)throw Error('A mappa nem található. Hozd létre, vagy add meg az ONEDRIVE_FOLDER_PATH változóban a saját tárhelyeden belüli útvonalát.');
const folder=await r.json();if(!folder.folder)throw Error('A kiválasztott elem nem mappa.');
const env={ONEDRIVE_CLIENT_ID:client,ONEDRIVE_TENANT:tenant,ONEDRIVE_REFRESH_TOKEN:tokens.refresh_token,ONEDRIVE_FOLDER_ID:folder.id,CLIP_SIGNING_SECRET:crypto.randomBytes(48).toString('hex'),VIDEOCLIPS_ENABLED:'false',CLIP_DATA_DIR:'data/clips'};
const out='onedrive-private.env';fs.writeFileSync(out,Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
console.log('A titkos beállítások elkészültek: '+out+'. Ne küldd el chatben, és ne töltsd fel a forráskódhoz.');
try{await createDrive({env}).privateFolder();console.log('A mappa privát. Következő lépés: Render környezeti változók és próba.');}
catch{console.error('A mappa privát hozzáférését nem sikerült igazolni. A OneDrive Hozzáférés kezelése menüben távolítsd el a megosztási linkeket és mások hozzáférését. Aktiválás előtt ellenőrizd újra.');process.exitCode=2;}
