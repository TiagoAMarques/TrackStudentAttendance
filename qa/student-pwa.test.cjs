const {chromium}=require('C:/Users/tiago/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:3000/student');
  await page.getByRole('heading',{name:'Your first course starts here'}).waitFor();
  await page.route('**/student/course?*',route=>route.fulfill({json:{id:'synthetic-pwa',code:'TEST101',name:'Synthetic test course'}}));
  await page.getByLabel('Course code or league link').fill('TEST101');await page.getByRole('button',{name:'Add course',exact:true}).click();
  await page.getByRole('heading',{name:'Synthetic test course'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Synthetic test course'}).waitFor();
  await page.getByLabel('Course code or league link').fill('TEST101');await page.getByRole('button',{name:'Add course',exact:true}).click();
  await page.getByRole('status').filter({hasText:'saved'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Synthetic test course'}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'outputs/student-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Remove TEST101 from this device'}).click();await page.getByRole('heading',{name:'Your first course starts here'}).waitFor();
  await page.getByLabel('Course code or league link').fill('https://example.com/league/foreign');await page.getByRole('button',{name:'Add course',exact:true}).click();await page.getByRole('alert').filter({hasText:'Use a course code'}).waitFor();
  const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');const manifest=await cdp.send('Page.getAppManifest');assert.equal(manifest.errors.length,0);assert.equal(JSON.parse(manifest.data).start_url,'/student');
  const install=await cdp.send('Page.getInstallabilityErrors');console.log('Installability:',JSON.stringify(install));
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.getByRole('heading',{name:'Your first course starts here'}).waitFor();assert.deepEqual(errors,[]);
  await context.setOffline(true);await page.goto('http://localhost:3000/league/synthetic-pwa');await page.getByRole('heading',{name:'You’re offline'}).waitFor();
  console.log('PASS: mobile layout, save/reload/deduplicate/remove, foreign link rejection, manifest, offline fallback. Synthetic data only.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
