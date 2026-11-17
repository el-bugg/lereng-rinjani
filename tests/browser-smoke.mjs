import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const url=process.env.TARGET_URL||'https://lereng-rinjani-fullstack-3r6n.onrender.com';
await mkdir('screenshots',{recursive:true});
async function checkHealth(){
 for(let i=0;i<18;i++){try{const r=await fetch(url+'/api/health');if(r.ok){const d=await r.json();if(d.ok===true&&d.mode==='postgres')return}}catch{}await new Promise(r=>setTimeout(r,4000))}
 throw Error('API health failed after retries');
}
await checkHealth();
const products=await fetch(url+'/api/products').then(r=>r.json());
if(products.products?.length!==2)throw Error('Expected two products');
const bad=await fetch(url+'/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})});
if(bad.status!==400)throw Error('Bad order must return 400 but got '+bad.status);
const protectedReq=await fetch(url+'/api/admin/orders');
if(protectedReq.status!==401)throw Error('Admin access must return 401');
const browser=await chromium.launch({headless:true});
try{
 const desktop=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await desktop.newPage();const res=await page.goto(url,{waitUntil:'networkidle',timeout:90000});if(res.status()!==200)throw Error('Homepage HTTP '+res.status());
 await page.locator('h1').first().waitFor();if(!await page.locator('.links a').first().isVisible())throw Error('Desktop menu hidden');
 await page.screenshot({path:'screenshots/desktop.png',fullPage:true});
 await page.locator('[data-add="arabika"]').first().click();
 if(await page.locator('#cart-count').textContent()!=='1')throw Error('Cart did not update');
 await page.reload({waitUntil:'networkidle'});
 if(await page.locator('#cart-count').textContent()!=='1')throw Error('Cart not persisted');
 await page.locator('#cart-button').click();
 await page.locator('#cart-close').click();
 await page.goto(url+'/#checkout',{waitUntil:'networkidle'});
 if(!await page.locator('#checkout-form').isVisible())throw Error('Checkout missing');
 const admin=await desktop.newPage();await admin.goto(url+'/admin.html',{waitUntil:'networkidle',timeout:90000});
 if(!await admin.getByText('Masuk admin').isVisible())throw Error('Admin login screen missing');
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const mp=await mobile.newPage();await mp.goto(url,{waitUntil:'networkidle',timeout:90000});
 await mp.screenshot({path:'screenshots/android.png',fullPage:true});
 await mp.locator('#mobile-toggle').click();
 if(!await mp.locator('#mobile-links').isVisible())throw Error('Mobile menu did not open');
 await mp.screenshot({path:'screenshots/android-menu.png',fullPage:false});
 const excess=await mp.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 if(excess>1)throw Error('Mobile horizontal overflow '+excess);
 console.log('PASS: health, products, validation, admin auth, desktop nav, cart, persistence, checkout, admin login page, mobile nav, overflow');
}finally{await browser.close()}
