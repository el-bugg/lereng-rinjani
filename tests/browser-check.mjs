import {chromium,firefox,webkit} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'

const base=process.env.PREVIEW_URL||'http://127.0.0.1:10000'
const sizes=[
 {name:'tiny-280',width:280,height:700},
 {name:'small-320',width:320,height:720},
 {name:'android-360',width:360,height:800},
 {name:'android-390',width:390,height:844},
 {name:'phone-430',width:430,height:932},
 {name:'phone-landscape',width:844,height:390},
 {name:'tablet-600',width:600,height:900},
 {name:'tablet-740',width:740,height:1000},
 {name:'tablet-768',width:768,height:1024},
 {name:'tablet-820',width:820,height:1180},
 {name:'tablet-landscape',width:1024,height:768},
 {name:'laptop-1280',width:1280,height:800},
 {name:'desktop-1440',width:1440,height:900},
 {name:'desktop-1920',width:1920,height:1080},
 {name:'wide-2560',width:2560,height:1440}
]
const routes=['beranda','produk','cerita','artikel','bantuan','privasi','checkout']
const issues=[]
await mkdir('screenshots',{recursive:true})

function failWhere(label, e){issues.push(`${label}: ${e?.message||String(e)}`)}
async function layout(page,label){
 const result=await page.evaluate(()=>{
  const root=document.documentElement,body=document.body;
  const width=window.innerWidth;
  const bad=[...document.querySelectorAll('main h1,main h2,.product-card,.product-image-wrap,.checkout-form,.order-summary,.field-notes,.footer-top,.admin-order,.admin-product')].filter(x=>{
   if(!x.getClientRects().length)return false;
   const r=x.getBoundingClientRect();return r.width>width+2 || r.left< -3 || r.right>width+3;
  }).slice(0,8).map(x=>({element:x.tagName.toLowerCase(),cls:String(x.className).slice(0,70),width:Math.round(x.getBoundingClientRect().width),left:Math.round(x.getBoundingClientRect().left),right:Math.round(x.getBoundingClientRect().right)}));
  const imgs=[...document.querySelectorAll('img')].filter(x=>x.getClientRects().length&&x.complete&&x.naturalWidth===0).map(x=>x.getAttribute('src')).slice(0,6);
  return {scroll:Math.max(root.scrollWidth,body.scrollWidth)-width,bad,imgs};
 })
 if(result.scroll>2)issues.push(`${label}: page overflows viewport by ${result.scroll}px`)
 if(result.bad.length)issues.push(`${label}: element extends beyond viewport ${JSON.stringify(result.bad)}`)
 if(result.imgs.length)issues.push(`${label}: images failed ${JSON.stringify(result.imgs)}`)
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try{
 for (const vp of sizes){
  const context=await browser.newContext({viewport:{width:vp.width,height:vp.height},reducedMotion:'reduce',isMobile:vp.width<=430,hasTouch:vp.width<=430})
  const page=await context.newPage();const label=vp.name
  page.on('pageerror',e=>failWhere(label+' page error',e))
  page.on('console',m=>{if(m.type()==='error'&&!/net::ERR_/i.test(m.text()))issues.push(`${label}: console error ${m.text().slice(0,180)}`)})
  try{
   await page.goto(base+'/#beranda',{waitUntil:'domcontentloaded',timeout:90000})
   await page.locator('#hero-title').waitFor({timeout:20000})
   await page.locator('.product-card').first().waitFor({timeout:20000})
   await layout(page,label+'/beranda')
   if(['small-320','android-390','tablet-768','desktop-1440','desktop-1920','wide-2560'].includes(label)){
    await page.screenshot({path:`screenshots/${label}.png`,fullPage:true})
   }
   if(vp.width<=930){
    const trigger=page.getByRole('button',{name:'Buka menu'})
    assert(await trigger.isVisible(),`${label}: mobile menu trigger hidden`)
    await trigger.click();const nav=page.getByRole('navigation',{name:'Navigasi seluler'});await nav.waitFor();await page.waitForTimeout(380)
    const offsets=await page.evaluate(()=>({header:document.querySelector('.site-header')?.getBoundingClientRect().bottom,menu:document.querySelector('.mobile-navigation')?.getBoundingClientRect().top}))
    if(offsets.header!==undefined&&offsets.menu!==undefined&&Math.abs(offsets.header-offsets.menu)>5)issues.push(`${label}: mobile menu displaced ${JSON.stringify(offsets)}`)
    await nav.getByRole('link',{name:/Produk/}).click()
   }else await page.getByRole('navigation',{name:'Navigasi utama'}).getByRole('link',{name:'Produk'}).click()
   await page.locator('.product-card').first().waitFor()
   await layout(page,label+'/produk')
   if(['small-320','android-390','tablet-768','desktop-1440','desktop-1920'].includes(label)){
    await page.getByRole('button',{name:/Tambah ke keranjang/}).first().click()
    await page.locator('[role=dialog]').waitFor({timeout:8000})
    assert.equal(await page.locator('.cart-badge').textContent(),'1',`${label}: cart increment`)
    await layout(page,label+'/keranjang')
    await page.getByRole('button',{name:/Lanjut ke checkout/}).click()
    await page.getByLabel('Nama lengkap').fill('Pelanggan Uji')
    await page.getByLabel('Nomor WhatsApp').fill('081234567890')
    await page.getByLabel('Alamat pengiriman').fill('Jalan Raya Sembalun, Kecamatan Sembalun, Lombok Timur')
    await layout(page,label+'/checkout')
    await page.getByRole('button',{name:/Catat pesanan/}).click()
    await page.getByText(/Pesanan diterima/).waitFor({timeout:20000})
    if(label==='android-390')await page.screenshot({path:'screenshots/android-checkout-done.png',fullPage:true})
   }
   for(const route of routes.slice(2)){
    await page.goto(base+'/#'+route,{waitUntil:'domcontentloaded',timeout:30000})
    await page.locator('main h1').first().waitFor({timeout:15000})
    await layout(page,label+'/'+route)
   }
   await page.goto(base+'/admin.html',{waitUntil:'domcontentloaded',timeout:30000})
   await page.locator('.admin-login input[type=password]').waitFor({timeout:15000})
   await layout(page,label+'/admin')
   if(['android-390','desktop-1440'].includes(label))await page.screenshot({path:`screenshots/admin-${label}.png`,fullPage:true})
  }catch(e){failWhere(label,e)}finally{await context.close()}
 }
 // Check full motion path and responsive behavior in alternate engines.
 for(const [name,engine] of [['firefox',firefox],['webkit',webkit]]){
  const alt=await engine.launch({headless:true})
  try {for(const width of [320,390,768,1280]){
   const context=await alt.newContext({viewport:{width,height:900},reducedMotion:'no-preference'})
   const page=await context.newPage();page.on('pageerror',e=>failWhere(`${name}/${width}`,e))
   try{await page.goto(base+'/#produk',{waitUntil:'domcontentloaded',timeout:90000});await page.locator('.product-card').first().waitFor({timeout:18000});await layout(page,`${name}/${width}/produk`)}catch(e){failWhere(`${name}/${width}`,e)}finally{await context.close()}
  }}finally{await alt.close()}
 }
 if(issues.length)throw Error(issues.join('\n'))
 console.log(`PASS: ${sizes.length} viewport/orientation profiles, ${routes.length} page routes, mobile navigation, product/cart/checkout, admin, Chromium/Firefox/WebKit. Screenshots saved.`)
}finally{await browser.close()}
