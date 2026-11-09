const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{
const browser=await (process.env.QA_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
try {
for(const {width,samsung} of [...[360,390,768,1024,1440].map(width=>({width,samsung:false})),{width:390,samsung:true}]){
 const page=await browser.newPage({viewport:{width,height:900},...(samsung?{userAgent:'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36'}:{})});const errors=[];
 page.setDefaultTimeout(10000);
 console.log('Checking viewport',width,'Samsung UA:',samsung);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='localhost')return route.fulfill({status:200,body:'',contentType:'text/plain'});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:{enabled:false,ok:true}});
  const file=path.resolve('public','.'+(u.pathname==='/'?'/index.html':u.pathname));
  if(!file.startsWith(path.resolve('public')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const ext=path.extname(file),types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
  return route.fulfill({body:fs.readFileSync(file),contentType:types[ext]||'application/octet-stream'});
 });
 await page.goto('http://localhost/');await page.waitForTimeout(200);
 const hint=page.locator('#novabot .nb-hint button');if(await hint.count())await hint.click();
 if(await page.locator('#consentAccept').isVisible())await page.locator('#consentAccept').click();
 assert.equal(await page.locator('iframe[src*="youtube"]').count(),0);
 if(width===390 || width===1440) { await page.locator('.topbar').screenshot({path:'qa-header-'+width+'.png'}); console.log('HEADER_IMAGE_'+width+'='+ (await page.locator('.topbar').screenshot({type:'jpeg',quality:35})).toString('base64')); }
 await page.locator('.bundle-cta').click();
 assert((await page.locator('#order').boundingBox()).y<100,'marketing link must remain at order');
 await page.locator('.christmas-campaign-link[data-jump]').click();
 assert((await page.locator('#pricing').boundingBox()).y<100,'marketing link must remain at pricing');
 const vinyl = await page.locator('.vinyl-tabs .tab').evaluateAll(els=>els.map(el=>{
  const b=el.getBoundingClientRect(),s=el.querySelector('span').getBoundingClientRect();
  return {round:Math.abs(b.width-b.height)<2,center:Math.abs((b.top+b.bottom-s.top-s.bottom)/2)<2,
    fits:s.left>=b.left&&s.right<=b.right,grooves:getComputedStyle(el).backgroundImage.includes('repeating-radial-gradient'),visible:getComputedStyle(el.querySelector('span.gold-text')).opacity==='1'&&!el.querySelector('.samsung-disc-art')};
 }));
 assert(vinyl.every(x=>x.round&&x.center&&x.fits&&x.grooves&&x.visible),JSON.stringify(vinyl));
 for(const target of ['intro','pricing','howto','order','videoclips','refs','contact']){
  await page.locator('.tab[data-target="'+target+'"]').click();
  assert(await page.locator('#'+target).isVisible(),target);
  const rect=await page.locator('#'+target).boundingBox();
  assert(rect.y>=-1 && rect.y<100,'scroll target '+target+' '+rect.y);
  const over=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert(!over,'horizontal overflow '+width+' '+target);
 }
 await page.locator('.tab[data-target="refs"]').click();
 await page.locator('#refs .yt-preview').first().click();
 assert.equal(await page.locator('#refs iframe[src*="youtube-nocookie"]').count(),1);
 await page.locator('.play-btn').click();assert(await page.locator('#videoFrame').isVisible());
 await page.locator('.stop-btn').click();assert(!(await page.locator('#videoFrame').isVisible()));
 await page.locator('.tab[data-target="videoclips"]').click();
 assert.equal(await page.locator('.clip-ref').count(),12);
 await page.screenshot({path:'qa-'+width+'.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS',width,'7 tabs, no overflow, lazy player, play/stop, 12 clips, no JS errors');
 await page.close();
}
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
