import { chromium, firefox, webkit } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const base=process.env.PREVIEW_URL||'http://127.0.0.1:10000'
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
const sizes=[{name:'small-320',width:320,height:720},{name:'android-390',width:390,height:844},{name:'tablet-768',width:768,height:1024},{name:'laptop-1280',width:1280,height:800},{name:'desktop-1920',width:1920,height:1080}]
const problems=[]
try{
 await mkdir('screenshots',{recursive:true})
 for(const size of sizes){const context=await browser.newContext({viewport:{width:size.width,height:size.height},reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',e=>problems.push(`${size.name}: pageerror ${e.message}`))
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});await page.locator('.product-card').first().waitFor({timeout:15000});await page.locator('#hero-title').waitFor()
  const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);if(over>2)problems.push(`${size.name}: horizontal overflow ${over}px`)
  if(['android-390','desktop-1920'].includes(size.name))await page.screenshot({path:`screenshots/${size.name}.png`,fullPage:true})
  if(size.width<930){await page.getByRole('button',{name:'Buka menu'}).click();await page.getByRole('navigation',{name:'Navigasi seluler'}).getByRole('link',{name:/Produk/}).click()}
  else await page.getByRole('navigation',{name:'Navigasi utama'}).getByRole('link',{name:'Produk'}).click()
  await page.locator('.product-card').first().waitFor()
  await page.getByRole('button',{name:/Tambah ke keranjang/}).first().click();await page.locator('[role=dialog]').waitFor()
  const count=await page.locator('.cart-badge').textContent();assert.equal(count,'1',`Cart count ${size.name}`)
  await page.getByRole('button',{name:/Lanjut ke checkout/}).click();await page.getByRole('button',{name:/Catat pesanan/}).waitFor()
  await page.getByLabel('Nama lengkap').fill('Pelanggan Uji')
  await page.getByLabel('Nomor WhatsApp').fill('081234567890')
  await page.getByLabel('Alamat pengiriman').fill('Jalan Raya Sembalun, Kecamatan Sembalun, Lombok Timur')
  await page.getByRole('button',{name:/Catat pesanan/}).click();await page.getByText(/Pesanan diterima/).waitFor({timeout:15000})
  if(size.name==='android-390')await page.screenshot({path:'screenshots/android-checkout-done.png',fullPage:true})
  for(const route of ['cerita','artikel','bantuan','privasi']){
   await page.goto(base+'/#'+route,{waitUntil:'domcontentloaded'});await page.locator('main h1').first().waitFor();
   const extra=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
   if(extra>2)problems.push(`${size.name}: route ${route} overflow ${extra}px`)
  }
  await page.goto(base+'/admin.html',{waitUntil:'domcontentloaded'});await page.getByText(/Selamat datang kembali/).waitFor({timeout:15000})
  const admOver=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
  if(admOver>2)problems.push(`${size.name}: admin login overflow ${admOver}px`)
  await context.close()
 }
 for(const [name,type] of [['firefox',firefox],['webkit',webkit]]){
  const alt=await type.launch({headless:true})
  try {for(const width of [390,1280]){
    const ctx=await alt.newContext({viewport:{width,height:850},reducedMotion:'reduce'})
    const page=await ctx.newPage()
    page.on('pageerror',e=>problems.push(`${name}-${width}: ${e.message}`))
    await page.goto(base+'/#produk',{waitUntil:'domcontentloaded',timeout:90000})
    await page.locator('.product-card').first().waitFor({timeout:15000})
    const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
    if(over>2)problems.push(`${name}-${width}: overflow ${over}px`)
    await ctx.close()
  }} finally{await alt.close()}
 }
 if(problems.length)throw Error(problems.join('\n'))
 console.log('Browser tests passed: Chromium responsive 320,390,768,1280,1920 + page routes, admin, checkout; Firefox and WebKit 390/1280')
}finally{await browser.close()}
