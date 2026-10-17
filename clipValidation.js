import {createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
export const CLIP_PACKAGES=Object.freeze({fullhd:39900,premium:49900,uhd:59900});
export const CLIP_LIMITS=Object.freeze({audio:200*1024*1024,image:10*1024*1024,images:4});
export function validateQuote(input={}){
 const text=(key,max,required=false)=>{const v=typeof input[key]==='string'?input[key].trim():'';if(v.length>max||(required&&!v))throw Error('invalid');return v;};
 const name=text('name',120,true),email=text('email',254,true);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Object.hasOwn(CLIP_PACKAGES,input.package)||input.consent!==true||input.rights!==true||input._hp)throw Error('invalid');
 const duration=Number(input.duration);if(!Number.isFinite(duration)||duration<=0||duration>20)throw Error('invalid');
 if(!['landscape','portrait'].includes(input.ratio))throw Error('invalid');
 if(!Array.isArray(input.files)||input.files.length<1||input.files.length>5)throw Error('invalid');
 const files=input.files.map((file,i)=>{
  const name=typeof file.name==='string'?file.name:'';
  const ext=name.split('.').at(-1)?.toLowerCase();const audio=i===0;
  if(name.length>200||/[\x00-\x1f]/.test(name)||!(audio?['mp3','wav']:['jpg','jpeg','png','webp']).includes(ext)||!Number.isSafeInteger(file.size)||file.size<12||file.size>(audio?CLIP_LIMITS.audio:CLIP_LIMITS.image))throw Error('invalid');
  return {originalName:name,storedName:(audio?'audio':'image-'+i)+'.'+ext,size:file.size,kind:audio?'audio':'image',ext};
 });
 const subtitles=input.subtitles===true,lipsync=input.lipsync===true;
 if(subtitles&&lipsync)throw Error('invalid');
 return {name,email,package:input.package,duration,ratio:input.ratio,subtitles,lipsync,concept:text('concept',4000),lyrics:text('lyrics',12000),priorOrder:text('priorOrder',100),language:input.language==='en'?'en':'hu',consent:true,rights:true,files,startingPrice:CLIP_PACKAGES[input.package]+(subtitles?4900:0)+(lipsync?9900:0)};
}
export function signTicket(value,secret){const body=Buffer.from(JSON.stringify(value)).toString('base64url');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
export function readTicket(token,secret,now=Date.now()){
 if(typeof token!=='string'||token.length>3000)throw Error('expired');const [body,signature,...rest]=token.split('.');
 const expected=createHmac('sha256',secret).update(body||'').digest();const actual=Buffer.from(signature||'','base64url');
 if(rest.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('expired');
 const value=JSON.parse(Buffer.from(body,'base64url'));if(!value.id||!value.folder||!Number.isFinite(value.expires)||value.expires<now)throw Error('expired');return value;
}
export function validSignature(ext,b){
 if(ext==='wav')return b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WAVE';
 if(ext==='mp3')return b.subarray(0,3).toString()==='ID3'||(b[0]===255&&(b[1]&0xe0)===0xe0&&(b[1]&6)!==0);
 if(ext==='png')return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(ext==='jpg'||ext==='jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
 if(ext==='webp')return b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';return false;
}
export const quoteId=()=> 'KLIP-'+new Date().toISOString().slice(0,10)+'-'+randomUUID();
