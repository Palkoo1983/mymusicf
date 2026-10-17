// Private OneDrive integration. Owner credentials never leave the server.
import fs from 'node:fs';
import path from 'node:path';
export function createDrive({env=process.env,fetchImpl=globalThis.fetch}={}){
 const tenant=/^(consumers|organizations|common|[a-f0-9-]{36})$/i.test(env.ONEDRIVE_TENANT||'')?env.ONEDRIVE_TENANT:'consumers';
 let refresh=env.ONEDRIVE_REFRESH_TOKEN,access='',until=0,refreshing;
 const tokenFile=path.resolve(env.CLIP_DATA_DIR||'data/clips','onedrive-token.json');
 try{const saved=JSON.parse(fs.readFileSync(tokenFile,'utf8'));if(saved.client===env.ONEDRIVE_CLIENT_ID&&saved.seed===env.ONEDRIVE_REFRESH_TOKEN)refresh=saved.refresh;}catch{}
 async function token(){
  if(access&&Date.now()<until)return access;if(refreshing)return refreshing;
  refreshing=(async()=>{
   const r=await fetchImpl(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.ONEDRIVE_CLIENT_ID,grant_type:'refresh_token',refresh_token:refresh,scope:'offline_access Files.ReadWrite'})});
   const j=await r.json();if(!r.ok||!j.access_token)throw Error('storage');access=j.access_token;until=Date.now()+Math.max(30,Number(j.expires_in||3600)-120)*1000;
   if(j.refresh_token){refresh=j.refresh_token;try{fs.mkdirSync(path.dirname(tokenFile),{recursive:true});fs.writeFileSync(tokenFile+'.tmp',JSON.stringify({client:env.ONEDRIVE_CLIENT_ID,seed:env.ONEDRIVE_REFRESH_TOKEN,refresh}),{mode:0o600});fs.renameSync(tokenFile+'.tmp',tokenFile);}catch{console.warn('[CLIPS] Token persistence unavailable.');}}
   return access;
  })();try{return await refreshing;}finally{refreshing=null;}
 }
 async function graph(route,options={}){
  const r=await fetchImpl('https://graph.microsoft.com/v1.0/me/drive'+route,{...options,signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json',...options.headers}});
  if(!r.ok){const e=Error(r.status===404?'missing':'storage');e.status=r.status;throw e;}return r;
 }
 const item=id=>'/items/'+encodeURIComponent(id);
 const file=(folder,name)=>item(folder)+':/'+encodeURIComponent(name);
 return {
  async privateFolder(){
   const base=env.ONEDRIVE_FOLDER_ID;
   const folder=await (await graph(item(base))).json();
   if(!folder.folder||folder.shared)throw Error('storage');
   const permissions=await (await graph(item(base)+'/permissions')).json();
   // Personal OneDrive includes link:{webUrl} on its owner permission even
   // when the folder has no sharing links. Only accept this owner-only shape;
   // sharing scopes/types, invitations, other roles and unknown shapes fail closed.
   if(permissions['@odata.nextLink']||!Array.isArray(permissions.value)||!permissions.value.length||permissions.value.some(p=>
    p.invitation||p.roles?.length!==1||p.roles[0]!=='owner'||
    (p.link&&Object.keys(p.link).some(key=>key!=='webUrl'))
   ))throw Error('storage');
   return base;
  },
  async createFolder(name){const base=await this.privateFolder();return (await graph(item(base)+'/children',{method:'POST',body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'})})).json();},
  async write(folder,name,value){return (await graph(file(folder,name)+':/content',{method:'PUT',body:JSON.stringify(value)})).json();},
  async read(folder,name){return (await graph(file(folder,name)+':/content')).json();},
  async get(folder,name){return (await graph(file(folder,name))).json();},
  // Keep the session request minimal: this personal OneDrive rejects the optional
  // item.fileSize field with HTTP 400. Size limits are enforced by validation,
  // Content-Range during upload and the final stored-file size check.
  async upload(folder,entry){const j=await (await graph(file(folder,entry.storedName)+':/createUploadSession',{method:'POST',body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'fail',name:entry.storedName}})})).json();if(!j.uploadUrl||!j.uploadUrl.startsWith('https://'))throw Error('storage');return {uploadUrl:j.uploadUrl,expires:j.expirationDateTime};},
  async prefix(id){const r=await graph(item(id)+'/content',{headers:{Range:'bytes=0-511'}});const reader=r.body.getReader();let chunks=[],size=0;try{while(size<512){const {value,done}=await reader.read();if(done)break;const part=value.subarray(0,512-size);chunks.push(Buffer.from(part));size+=part.length;}}finally{await reader.cancel();}return Buffer.concat(chunks);}
 };
}
