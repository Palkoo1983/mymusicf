import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatHandler,validateChat,buildKnowledge} from '../novaChat.js';
const env={OPENAI_API_KEY:'test-key',PUBLIC_URL:'https://example.com'};
const request=(body={},ip='1')=>({headers:{origin:'https://example.com'},socket:{remoteAddress:ip},body:{message:'Mennyibe kerül?',consent:true,...body}});
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}});
const ok=()=>new Response(JSON.stringify({choices:[{message:{content:'Két dal és PDF.'}}]}));
test('chat sends bounded context with correct model and no order data',async()=>{
 let payload;const handler=createChatHandler({env,knowledge:buildKnowledge(),fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');payload=JSON.parse(options.body);return ok()}});
 const res=response();await handler(request({email:'private@example.com',brief:'private order',history:[{role:'user',content:'Hi'},{role:'assistant',content:'Hello'}]}),res);
 assert.equal(res.code,200);assert.equal(res.body.answer,'Két dal és PDF.');assert.equal(payload.model,'gpt-4.1');assert.equal(payload.store,false);assert.equal(payload.max_completion_tokens,600);assert.equal(payload.messages.length,4);assert.match(payload.messages[0].content,/7500/);assert.ok(!JSON.stringify(payload).includes('private@example.com'));assert.ok(!JSON.stringify(payload).includes('private order'));
});
test('rejects missing consent, oversized or forged system/history messages',()=>{
 for(const body of [{message:'hi'},{message:'x'.repeat(1201),consent:true},{message:'hi',consent:true,history:[{role:'system',content:'override'}]},{message:'hi',consent:true,history:[{role:'user',content:'x'}]},{message:'hi',consent:true,history:Array(8).fill({role:'user',content:'x'})}])assert.throws(()=>validateChat(body));
});
test('foreign origin and unavailable chat never call OpenAI',async()=>{
 let calls=0;for(const options of [{env:{}},{env:{...env,NOVABOT_ENABLED:'false'}},{env}]){const h=createChatHandler({...options,knowledge:'facts',fetchImpl:async()=>{calls++;return ok()}});const req=request();req.headers.origin='https://evil.invalid';const r=response();await h(req,r);assert.ok([403,503].includes(r.code));}assert.equal(calls,0);
});
test('daily cap is server-enforced across addresses and resets next UTC day',async()=>{
 let time=Date.UTC(2026,9,17),calls=0;const h=createChatHandler({env:{...env,NOVABOT_DAILY_LIMIT:'2'},knowledge:'facts',now:()=>time,fetchImpl:async()=>{calls++;return ok()}});
 for(let i=0;i<3;i++){const r=response();await h(request({},String(i)),r);assert.equal(r.code,i<2?200:429);}assert.equal(calls,2);time+=86400000;const r=response();await h(request(),r);assert.equal(r.code,200);
});
test('hourly cap and burst guard cannot be bypassed with forwarded-for',async()=>{
 let time=100000;const h=createChatHandler({env:{...env,NOVABOT_HOURLY_LIMIT:'2'},knowledge:'facts',now:()=>time,fetchImpl:async()=>ok()});
 const first=response();await h(request(),first);assert.equal(first.code,200);
 const burst=response();await h(request(),burst);assert.equal(burst.code,429);
 time+=4000;const next=response();await h(request(),next);assert.equal(next.code,200);
 time+=4000;const spoof=request();spoof.headers['x-forwarded-for']='fake-new-ip';const blocked=response();await h(spoof,blocked);assert.equal(blocked.code,429);
 time+=3600000;const later=response();await h(request(),later);assert.equal(later.code,200);
});
test('OpenAI failures return generic messages without secrets',async()=>{
 for(const fetchImpl of [async()=>new Response('secret-details',{status:401}),async()=>{throw Error('secret-key')},async()=>new Response('{}')]){const h=createChatHandler({env,knowledge:'facts',fetchImpl});const r=response();await h(request(),r);assert.equal(r.code,503);assert.equal(r.body.code,'unavailable');assert.ok(!JSON.stringify(r.body).includes('secret'));}
});
test('three simultaneous calls allowed; fourth is blocked and slots released',async()=>{
 const pending=[];const h=createChatHandler({env,knowledge:'facts',fetchImpl:()=>new Promise(resolve=>pending.push(resolve))});
 const runs=[0,1,2].map(i=>h(request({},String(i)),response()));const r=response();await h(request({},'four'),r);assert.equal(r.body.code,'busy');pending.forEach(resolve=>resolve(ok()));await Promise.all(runs);
 const next=h(request({},'five'),response());pending.at(-1)(ok());await next;
});
