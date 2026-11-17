/**
 * Lereng Rinjani design preview server. ISOLATED test data; never connects to production.
 * SQLite is intentionally in-memory; free Render instances restart/sleep and lose demo data.
 * Production uses the existing server.mjs + PostgreSQL after explicit approval.
 */
import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root=resolve(fileURLToPath(new URL('.',import.meta.url)))
const webRoot=resolve(root,'dist')
const db=new DatabaseSync(':memory:')
const port=Number(process.env.PORT||10000)
const adminPassword=process.env.PREVIEW_ADMIN_PASSWORD||''
const activeSessions=new Map()
const limits=new Map()
const allowedStates=['MENUNGGU_KONFIRMASI','DIKONFIRMASI','DIPROSES','DIKIRIM','SELESAI','DIBATALKAN']
const transitions={MENUNGGU_KONFIRMASI:['DIKONFIRMASI','DIBATALKAN'],DIKONFIRMASI:['DIPROSES','DIBATALKAN'],DIPROSES:['DIKIRIM','DIBATALKAN'],DIKIRIM:['SELESAI'],SELESAI:[],DIBATALKAN:[]}

db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY,name TEXT NOT NULL,price_idr INTEGER NOT NULL,stock INTEGER,enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE orders (id TEXT PRIMARY KEY,order_code TEXT UNIQUE NOT NULL,customer_name TEXT NOT NULL,customer_phone TEXT NOT NULL,delivery_address TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',items TEXT NOT NULL,total_idr INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'MENUNGGU_KONFIRMASI',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
INSERT INTO products(id,name,price_idr,stock) VALUES('arabika','Lereng Rinjani Arabika',45000,20),('robusta','Lereng Rinjani Robusta',45000,20);`)
function send(res,code,data,headers={}){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow',...headers});res.end(JSON.stringify(data))}
function bad(message,code=400){const e=new Error(message);e.status=code;throw e}
function clean(v,min,max,label){if(typeof v!=='string')bad(`${label} harus berupa teks`);const s=v.trim().replace(/[\u0000-\u001F]/g,' ');if(s.length<min||s.length>max)bad(`${label} tidak valid`);return s}
async function getBody(req){let s='';for await(const c of req){s+=c;if(s.length>65000)bad('Payload terlalu besar',413)}try{return JSON.parse(s)}catch{bad('JSON tidak valid')}}
function throttle(key,limit=12,period=900000){const now=Date.now();const state=limits.get(key);if(!state||state.until<now){limits.set(key,{count:1,until:now+period});return true}state.count++;return state.count<=limit}
function session(req){const cookie=req.headers.cookie||'';const token=/(?:^|;\s*)lr_preview_session=([a-f0-9]{48})/.exec(cookie)?.[1];return !!(token&&activeSessions.get(token)>Date.now())}
function adminGuard(req){if(!session(req))bad('Akses admin diperlukan',401)}
function samePassword(value){if(typeof value!=='string'||!adminPassword)return false;const a=Buffer.from(value);const b=Buffer.from(adminPassword);return a.length===b.length&&timingSafeEqual(a,b)}
function products(){return db.prepare('SELECT id,name,price_idr,stock,enabled FROM products ORDER BY id').all().map(x=>({...x,enabled:!!x.enabled}))}
async function api(req,res,path){const method=req.method;
 if(path==='/api/health'&&method==='GET')return send(res,200,{ok:true,mode:'preview-sqlite',warning:'Data pesanan uji tidak permanen'})
 if(path==='/api/products'&&method==='GET')return send(res,200,{products:products()})
 if(path==='/api/orders'&&method==='POST'){
  if(!throttle('order:'+req.socket.remoteAddress))bad('Terlalu banyak permintaan',429)
  const d=await getBody(req);if(d.consent!==true)bad('Persetujuan penggunaan data diperlukan')
  const name=clean(d.name,3,80,'Nama');const phone=clean(d.phone,9,20,'Telepon').replace(/[\s-]/g,'');if(!/^(?:\+62|62|0)[0-9]{8,13}$/.test(phone))bad('Nomor WhatsApp tidak valid')
  const address=clean(d.address,12,500,'Alamat');const notes=typeof d.notes==='string'&&d.notes.trim()?clean(d.notes,1,300,'Catatan'):''
  if(!Array.isArray(d.items)||!d.items.length||d.items.length>2)bad('Produk pesanan tidak valid')
  let total=0;const items=[];const seen=new Set()
  for(const item of d.items){if(!item||!['arabika','robusta'].includes(item.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20||seen.has(item.id))bad('Produk atau jumlah tidak valid');seen.add(item.id)
   const prod=db.prepare('SELECT * FROM products WHERE id=?').get(item.id);if(!prod||!prod.enabled)bad('Produk tidak tersedia');if(prod.stock!==null&&item.quantity>prod.stock)bad('Stok tidak mencukupi',409)
   total+=prod.price_idr*item.quantity;items.push({product_id:prod.id,product_name:prod.name,quantity:item.quantity,unit_price_idr:prod.price_idr})
  }
  const id=randomUUID();const orderCode='DEMO-'+Date.now().toString(36).toUpperCase()+'-'+randomBytes(2).toString('hex').toUpperCase();const now=new Date().toISOString()
  db.prepare('INSERT INTO orders(id,order_code,customer_name,customer_phone,delivery_address,notes,items,total_idr,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,orderCode,name,phone,address,notes,JSON.stringify(items),total,'MENUNGGU_KONFIRMASI',now,now)
  return send(res,201,{order_code:orderCode,total_idr:total,whatsapp_url:'https://wa.me/6287753591699?text='+encodeURIComponent('[DEMO / TIDAK PERLU DIPROSES] '+orderCode)})
 }
 if(path==='/api/admin/login'&&method==='POST'){
  if(!throttle('login:'+req.socket.remoteAddress,8))bad('Terlalu banyak percobaan login',429)
  const d=await getBody(req);if(!samePassword(d.password))bad('Kata sandi tidak valid',401)
  const key=randomBytes(24).toString('hex');activeSessions.set(key,Date.now()+12*3600000)
  return send(res,200,{ok:true}, {'set-cookie':`lr_preview_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`})
 }
 if(path==='/api/admin/session'&&method==='GET')return send(res,200,{authenticated:session(req)})
 if(path==='/api/admin/logout'&&method==='POST'){
  const cookie=req.headers.cookie||'';const token=/(?:^|;\s*)lr_preview_session=([a-f0-9]{48})/.exec(cookie)?.[1];if(token)activeSessions.delete(token)
  return send(res,200,{ok:true},{'set-cookie':'lr_preview_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
 }
 if(path.startsWith('/api/admin/')){adminGuard(req)
  if(path==='/api/admin/orders'&&method==='GET')return send(res,200,{orders:db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 250').all().map(x=>({...x,customer_name:x.customer_name,customer_phone:x.customer_phone,delivery_address:x.delivery_address,items:JSON.parse(x.items)}))})
  if(path==='/api/admin/products'&&method==='GET')return send(res,200,{products:products()})
  const orderMatch=path.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})$/)
  if(orderMatch&&method==='PATCH'){
   const d=await getBody(req);if(!allowedStates.includes(d.status))bad('Status tidak valid');const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderMatch[1]);if(!order)bad('Pesanan tidak ditemukan',404);if(!(transitions[order.status]||[]).includes(d.status))bad('Perubahan status tidak diizinkan',409)
   db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(d.status,new Date().toISOString(),orderMatch[1]);return send(res,200,{ok:true,status:d.status})
  }
  const productMatch=path.match(/^\/api\/admin\/products\/(arabika|robusta)$/)
  if(productMatch&&method==='PATCH'){
   const d=await getBody(req);if(!Number.isInteger(d.price_idr)||d.price_idr<1000||d.price_idr>10000000||!(d.stock===null||(Number.isInteger(d.stock)&&d.stock>=0&&d.stock<=1000000)))bad('Harga atau stok tidak valid')
   db.prepare('UPDATE products SET price_idr=?,stock=? WHERE id=?').run(d.price_idr,d.stock,productMatch[1]);return send(res,200,{ok:true})
  }
 }
 return send(res,404,{error:'API tidak ditemukan'})
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))return await api(req,res,url.pathname);if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 const path=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);if(path.includes('..')||path.includes('\\')||path.includes('\u0000')){res.writeHead(403);return res.end('Forbidden')}
 const full=resolve(webRoot,'.'+path);if(full!==webRoot&&!full.startsWith(webRoot+sep)){res.writeHead(403);return res.end('Forbidden')}
 const f=await stat(full).catch(()=>null);if(!f?.isFile()){res.writeHead(404,{'x-robots-tag':'noindex, nofollow'});return res.end('Not found')}
 const data=await readFile(full);res.writeHead(200,{'content-type':mime[extname(full)]||'application/octet-stream','cache-control':extname(full)==='.html'?'no-store':'public, max-age=3600','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','x-robots-tag':'noindex, nofollow'});res.end(req.method==='HEAD'?undefined:data)
 }catch(e){const code=e.status||500;if(code===500)console.error('Preview error',e);send(res,code,{error:code===500?'Gangguan sistem demo':e.message})}})
server.listen(port,'0.0.0.0',()=>console.log('Lereng Rinjani ISOLATED PREVIEW listening on '+port))
