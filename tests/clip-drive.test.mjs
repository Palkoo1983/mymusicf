import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrive} from '../clipDrive.js';

test('upload session works with personal OneDrive rejecting optional fileSize',async()=>{
 const d=createDrive({env:{ONEDRIVE_CLIENT_ID:'test',ONEDRIVE_REFRESH_TOKEN:'test'},fetchImpl:async(url,options)=>{
  if(url.includes('/token'))return Response.json({access_token:'test',expires_in:3600});
  assert.ok(url.endsWith('/items/parent:/audio.wav:/createUploadSession'));
  const body=JSON.parse(options.body);
  if(Object.hasOwn(body.item,'fileSize'))return Response.json({error:{code:'invalidRequest'}},{status:400});
  assert.equal(body.item.name,'audio.wav');
  assert.equal(body.item['@microsoft.graph.conflictBehavior'],'fail');
  return Response.json({uploadUrl:'https://upload.example.test/session',expirationDateTime:'later'});
 }});
 assert.equal((await d.upload('parent',{storedName:'audio.wav',size:43206352})).uploadUrl,'https://upload.example.test/session');
});

function drive(permissions,folder={folder:{}}){
 return createDrive({env:{ONEDRIVE_CLIENT_ID:'test',ONEDRIVE_REFRESH_TOKEN:'test',ONEDRIVE_FOLDER_ID:'parent'},fetchImpl:async url=>new Response(JSON.stringify(
  url.includes('/token')?{access_token:'test',expires_in:3600}:url.endsWith('/permissions')?permissions:folder
 ))});
}
test('personal OneDrive owner URL is not treated as a sharing grant',async()=>{
 for(const owner of [{roles:['owner']},{roles:['owner'],link:{webUrl:'https://onedrive.live.com/owner-only'}}]){
  assert.equal(await drive({value:[owner]}).privateFolder(),'parent');
 }
});
test('public links, invitees, other roles, shared folders and incomplete permission lists remain blocked',async()=>{
 const owner={roles:['owner']};
 for(const permissions of [
  {value:[owner,{roles:['read'],link:{scope:'anonymous',type:'view'}}]},
  {value:[{roles:['owner'],link:{scope:'anonymous',webUrl:'https://example.test'}}]},
  {value:[{roles:['owner'],link:{type:'edit'}}]},
  {value:[{roles:['owner'],invitation:{}}]},
  {value:[owner,{roles:['write']}]},
  {value:[{roles:['owner','write']}]},
  {value:[]},{},
  {value:[owner],'@odata.nextLink':'https://example.test/next'}
 ])await assert.rejects(drive(permissions).privateFolder(),/storage/);
 await assert.rejects(drive({value:[owner]},{folder:{},shared:{scope:'users'}}).privateFolder(),/storage/);
});
