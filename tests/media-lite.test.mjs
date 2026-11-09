import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/media-lite.js',import.meta.url),'utf8');
function setup(id='Q1zIxLNhkKQ') {
 let listener, frame, replaced, prevented=false;
 const link={dataset:{videoId:id},getAttribute:()=> 'Video title',replaceWith:f=>replaced=f};
 const document={addEventListener:(type,fn)=>listener=fn,createElement:()=>frame={setAttribute(){},focus(){this.focused=true}}};
 vm.runInNewContext(source,{document});
 return {click:(extra={})=>listener({target:{closest:()=>link},button:0,preventDefault(){prevented=true},...extra}),state:()=>({frame,replaced,prevented})};
}
test('does not create players until clicked; click creates an inline, labelled player',()=>{
 const x=setup();assert.equal(x.state().frame,undefined);x.click();
 assert.equal(x.state().frame.src,'https://www.youtube-nocookie.com/embed/Q1zIxLNhkKQ?autoplay=1&playsinline=1&rel=0');
 assert.equal(x.state().frame.title,'Video title');assert(x.state().prevented);assert(x.state().frame.focused);
});
test('modified click keeps normal link behavior and invalid IDs cannot create players',()=>{
 for(const extra of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}]) {const x=setup();x.click(extra);assert.equal(x.state().frame,undefined);assert(!x.state().prevented);}
 const x=setup('invalid/url');x.click();assert.equal(x.state().frame,undefined);
});
test('HTML has no eager YouTube iframe; keeps all old references and supplied clip URLs',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.equal((html.match(/name="viewport"/g)||[]).length,1);
 assert(!/<iframe\b[^>]*\bsrc=/s.test(html));
 assert((html.match(/class="yt-preview"/g)||[]).length>=30);
 const clips=fs.readFileSync(new URL('../public/video-clips.js',import.meta.url),'utf8');
 assert(clips.includes('Q1zIxLNhkKQ'));assert(clips.includes('XmsZoEpqbw0'));
});
