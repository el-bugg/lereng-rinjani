import assert from 'node:assert/strict'
const base=process.env.PREVIEW_URL
if(!base||!base.startsWith('https://'))throw Error('PREVIEW_URL HTTPS required')
async function read(path){
 let last
 for(let i=0;i<12;i++){
  try{const r=await fetch(base+path,{signal:AbortSignal.timeout(20000),redirect:'follow',headers:{'User-Agent':'LerengRinjani-QA/1.0'}});if(r.ok)return r;last=new Error(`${path}: HTTP ${r.status}`)}catch(e){last=e}
  await new Promise(resolve=>setTimeout(resolve,5000))
 }
 throw last
}
const health=await(await read('/api/health')).json()
assert.equal(health.ok,true)
assert.equal(health.mode,'preview-sqlite','preview must not connect to real orders')
const products=await(await read('/api/products')).json()
assert.deepEqual(products.products.map(x=>x.id).sort(),['arabika','robusta'])
assert.ok(products.products.every(x=>Number.isFinite(x.price_idr)&&x.price_idr>0))
const home=await(await read('/')).text()
assert.ok(home.includes('Lereng Rinjani')&&home.includes('/assets/'))
const admin=await(await read('/admin.html')).text()
assert.ok(admin.includes('admin-root')&&admin.includes('/assets/'))
const session=await(await read('/api/admin/session')).json()
assert.equal(session.authenticated,false)
const blocked=await fetch(base+'/api/admin/orders',{signal:AbortSignal.timeout(20000)})
assert.equal(blocked.status,401)
const missing=await fetch(base+'/missing-should-be-404.html',{signal:AbortSignal.timeout(20000)})
assert.equal(missing.status,404)
console.log('LIVE PREVIEW VERIFIED:',base,'GET /, /admin.html, /api/health, /api/products, unauth admin, 404')
