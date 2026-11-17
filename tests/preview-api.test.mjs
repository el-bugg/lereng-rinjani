import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
const port=11012;const base=`http://127.0.0.1:${port}`
const child=spawn(process.execPath,['preview-server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),PREVIEW_ADMIN_PASSWORD:'only-test-password'},stdio:'pipe'})
async function wait(){for(let n=0;n<80;n++){try{const r=await fetch(base+'/api/health');if(r.ok)return}catch{}await sleep(110)}throw Error('preview-server did not start')}
async function request(path,method='GET',payload,headers={}){const r=await fetch(base+path,{method,headers:{...(payload?{'Content-Type':'application/json'}:{}),...headers},body:payload?JSON.stringify(payload):undefined});return {status:r.status,headers:r.headers,body:await r.json()}}
try{
await wait()
await test('health is explicitly preview-only', async()=>{const r=await request('/api/health');assert.equal(r.status,200);assert.equal(r.body.mode,'preview-sqlite')})
await test('products come from API',async()=>{const r=await request('/api/products');assert.equal(r.status,200);assert.equal(r.body.products.length,2);assert.equal(r.body.products[0].price_idr,45000)})
await test('unauthorized admin blocked',async()=>{const r=await request('/api/admin/orders');assert.equal(r.status,401)})
await test('order input must be valid',async()=>{const r=await request('/api/orders','POST',{name:'A',phone:'080',address:'x',consent:true,items:[]});assert.equal(r.status,400)})
await test('server ignores submitted fake pricing',async()=>{const r=await request('/api/orders','POST',{name:'Penguji Demo',phone:'081234567890',address:'Jalan Raya Sembalun Lombok Timur',consent:true,notes:'uji otomatis',items:[{id:'arabika',quantity:2,price_idr:1}]});assert.equal(r.status,201);assert.equal(r.body.total_idr,90000);assert.ok(r.body.order_code.startsWith('DEMO-'))})
await test('duplicate item and insufficient stock rejected',async()=>{const a=await request('/api/orders','POST',{name:'Penguji Demo',phone:'081234567890',address:'Jalan Raya Sembalun Lombok Timur',consent:true,items:[{id:'arabika',quantity:1},{id:'arabika',quantity:1}]});assert.equal(a.status,400);const b=await request('/api/orders','POST',{name:'Penguji Demo',phone:'081234567890',address:'Jalan Raya Sembalun Lombok Timur',consent:true,items:[{id:'arabika',quantity:21}]});assert.equal(b.status,400)})
await test('admin login and isolated order listing',async()=>{const r=await request('/api/admin/login','POST',{password:'only-test-password'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];const o=await request('/api/admin/orders','GET',undefined,{cookie});assert.equal(o.status,200);assert.ok(o.body.orders.length>=1);const ps=await request('/api/admin/products','GET',undefined,{cookie});assert.equal(ps.status,200);const x=await request('/api/admin/products/arabika','PATCH',{price_idr:46000,stock:10},{cookie});assert.equal(x.status,200);const q=await request('/api/products');assert.equal(q.body.products.find(p=>p.id==='arabika').price_idr,46000)})
}finally{child.kill('SIGTERM')}
