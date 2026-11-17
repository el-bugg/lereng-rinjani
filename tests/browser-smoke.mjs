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
if(process.env.TEST_ORDER==='1') {
 const r=await fetch(url+'/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'QA TEST - bukan pelanggan',phone:'081234567890',address:'Alamat dummy untuk pengujian otomatis di Jakarta',notes:'Hanya pengujian, jangan diproses atau dikirim',consent:true,items:[{id:'arabika',quantity:1}]})});
 const data=await r.json();
 if(r.status!==201||!/^LR-/.test(data.order_code||'')||data.subtotal_idr!==45000||!data.whatsapp_url?.startsWith('https://wa.me/'))throw Error('Valid order failed: '+r.status+' '+JSON.stringify(data));
 console.log('PASS: saved a synthetic order to PostgreSQL, reference '+data.order_code);
}
const protectedReq=await fetch(url+'/api/admin/orders');
if(protectedReq.status!==401)throw Error('Admin access must return 401');
const browser=await chromium.launch({headless:true});
try{
 const desktop=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await desktop.newPage();const res=await page.goto(url,{waitUntil:'networkidle',timeout:90000});if(res.status()!==200)throw Error('Homepage HTTP '+res.status());
 await page.locator('h1').first().waitFor();if(!await page.locator('.links a').first().isVisible())throw Error('Desktop menu hidden');
 const photoLoaded=await page.locator('.hero-photo img').evaluate(img=>img.complete&&img.naturalWidth>0&&img.currentSrc.includes('/assets/img/foto2.jpg'));
 if(!photoLoaded)throw Error('Original hero image did not load');
 for(const img of await page.locator('.product-image img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode()).catch(()=>{});}
 const productsLoaded=await page.locator('.product-image img').evaluateAll(imgs=>imgs.length>=2&&imgs.every(img=>img.complete&&img.naturalWidth>0&&img.currentSrc.includes('/assets/img/')));
 if(!productsLoaded)throw Error('Original product images did not load');
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
