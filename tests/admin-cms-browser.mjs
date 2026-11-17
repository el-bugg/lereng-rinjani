import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const base=process.env.PREVIEW_URL||'http://127.0.0.1:10000'
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'})
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/admin.html',{waitUntil:'domcontentloaded',timeout:30000})
  await page.locator('input[type=password]').fill('ci-only-password')
  await page.getByRole('button',{name:/Masuk ke dashboard/}).click()
  await page.getByText('Dashboard', {exact:false}).first().waitFor({timeout:20000})
  await page.locator('.admin-tabs').getByRole('button',{name:/Konten & Foto/}).click()
  await page.getByLabel('Teks utama halaman depan').fill('Kopi Sembalun yang dirawat dengan penuh perhatian dan cerita.')
  await page.getByRole('button',{name:/Simpan konten website/}).click()
  await page.getByText(/Teks dan foto telah diperbarui/).waitFor({timeout:15000})
  const consumer=await context.newPage();await consumer.goto(base+'/#beranda')
  await consumer.getByText('Kopi Sembalun yang dirawat dengan penuh perhatian dan cerita.').waitFor({timeout:15000})
  await consumer.close()
  await page.locator('.admin-tabs').getByRole('button',{name:/Produk/}).click()
  await page.getByRole('button',{name:/Tambah produk baru/}).click()
  const form=page.locator('form').filter({has:page.getByRole('button',{name:/Simpan produk baru/})})
  await form.getByLabel('Nama produk').fill('Kopi Uji Admin '+width)
  await form.getByLabel('Deskripsi').fill('Kopi percobaan yang tidak dijual sungguhan.')
  await form.getByLabel('Harga (Rp)').fill('57000')
  await form.getByLabel('Stok (kosong = manual)').fill('6')
  const capture=await page.screenshot()
  await form.locator('input[type=file]').setInputFiles({name:'admin-test.png',mimeType:'image/png',buffer:capture})
  await page.waitForFunction(()=>{const src=document.querySelector('form input[type=file]')?.closest('label')?.parentElement?.querySelector('img')?.getAttribute('src');return !!src&&src.includes('/api/media/')},{timeout:25000}).catch(()=>{})
  await form.getByRole('button',{name:/Simpan produk baru/}).click()
  await page.getByText(/Produk tersimpan/).waitFor({timeout:15000})
  const data=await page.evaluate(async()=>await (await fetch('/api/products')).json())
  assert(data.products.some(p=>p.name==='Kopi Uji Admin '+width),'New product missing from catalog API')
  assert.equal(errors.length,0,'Browser errors: '+errors.join('; '))
  await context.close()
 }
 console.log('PASS: admin login, responsive CMS, editable text, product creation and photo upload')
}finally{await browser.close()}
