import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const root=dirname(fileURLToPath(import.meta.url));
const db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:8000});
const port=Number(process.env.PORT||10000);
const adminPassword=process.env.ADMIN_PASSWORD||'';
const sessionSecret=process.env.SESSION_SECRET||'';
const statuses=['MENUNGGU_KONFIRMASI','DIKONFIRMASI','DIPROSES','DIKIRIM','SELESAI','DIBATALKAN'];
const transitions={MENUNGGU_KONFIRMASI:['DIKONFIRMASI','DIBATALKAN'],DIKONFIRMASI:['DIPROSES','DIBATALKAN'],DIPROSES:['DIKIRIM','DIBATALKAN'],DIKIRIM:['SELESAI'],SELESAI:[],DIBATALKAN:[]};
const rates=new Map();
const setup=async()=>{
 await db.query(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY,name TEXT NOT NULL,price_idr INTEGER NOT NULL CHECK(price_idr>0),stock INTEGER CHECK(stock IS NULL OR stock>=0),enabled BOOLEAN NOT NULL DEFAULT TRUE,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query(`CREATE TABLE IF NOT EXISTS orders (id UUID PRIMARY KEY,order_code TEXT UNIQUE NOT NULL,customer_name TEXT NOT NULL,customer_phone TEXT NOT NULL,delivery_address TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',subtotal_idr INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'MENUNGGU_KONFIRMASI',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query(`CREATE TABLE IF NOT EXISTS order_items (id BIGSERIAL PRIMARY KEY,order_id UUID REFERENCES orders(id) ON DELETE CASCADE,product_id TEXT NOT NULL,product_name TEXT NOT NULL,unit_price_idr INTEGER NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),reserved_stock BOOLEAN NOT NULL DEFAULT FALSE)`);
 await db.query(`INSERT INTO products(id,name,price_idr,stock) VALUES('arabika','Lereng Rinjani Arabika',45000,NULL),('robusta','Lereng Rinjani Robusta',45000,NULL) ON CONFLICT(id) DO NOTHING`);
};
const send=(res,status,payload,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(JSON.stringify(payload))};
const body=async req=>{let s='';for await(const b of req){s+=b;if(s.length>16000)throw new Error('Ukuran data terlalu besar')}try{return JSON.parse(s)}catch{throw new Error('Format JSON tidak valid')}};
const clean=(v,min,max,label)=>{if(typeof v!=='string')throw new Error(label+' wajib diisi');const s=v.trim().replace(/\s+/g,' ');if(s.length<min||s.length>max)throw new Error(label+' harus '+min+'–'+max+' karakter');return s};
const safeEq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
const sign=t=>createHmac('sha256',sessionSecret).update(t).digest('hex');
const adminOk=req=>{if(!sessionSecret||!adminPassword)return false;const c=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('lr_admin='));if(!c)return false;const t=c.slice(9);const a=t.split('.');return a.length===3&&/^\d{13}$/.test(a[0])&&Number(a[0])>Date.now()&&/^[a-f0-9]{32}$/.test(a[1])&&safeEq(a[2],sign(a[0]+'.'+a[1]))};
const cookie=(v,ttl=0)=>'lr_admin='+v+'; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age='+ttl;
const throttle=(key,max,period)=>{const x=rates.get(key)||{count:0,start:Date.now()};if(Date.now()-x.start>period){x.count=0;x.start=Date.now()}x.count++;rates.set(key,x);if(rates.size>8000){for(const [k,v] of rates)if(Date.now()-v.start>period)rates.delete(k)}return x.count<=max};
const currency=n=>new Intl.NumberFormat('id-ID').format(n);
const wa=(o,items)=>{const t=['Halo CS Lereng Rinjani, saya ingin mengonfirmasi pesanan '+o.order_code,'',...items.map(i=>'- '+i.product_name+' 100g × '+i.quantity+' = Rp'+currency(i.quantity*i.unit_price_idr)),'','Subtotal Rp'+currency(o.subtotal_idr)+' (belum ongkir)','Nama: '+o.customer_name,'WhatsApp: '+o.customer_phone,'Alamat: '+o.delivery_address,'Catatan: '+(o.notes||'-'),'','Mohon konfirmasi stok, ongkir, dan pembayaran.'];return 'https://wa.me/6287753591699?text='+encodeURIComponent(t.join('\n'))};
const productQuery=()=>db.query('SELECT id,name,price_idr,stock,enabled FROM products WHERE enabled=true ORDER BY id');
async function api(req,res,path){
 const method=req.method||'GET';
 if(method!=='GET'){const origin=req.headers.origin;const expected='https://'+req.headers.host;const local='http://'+req.headers.host;if(origin&&origin!==expected&&origin!==local)return send(res,403,{error:'Origin tidak diizinkan'})}
 if(path==='/api/health'&&method==='GET'){await db.query('SELECT 1');return send(res,200,{ok:true,mode:'postgres'})}
 if(path==='/api/products'&&method==='GET'){const p=await productQuery();return send(res,200,{products:p.rows})}
 if(path==='/api/orders'&&method==='POST'){
  if(!throttle('order:'+(req.headers['x-forwarded-for']||req.socket.remoteAddress),20,900000))return send(res,429,{error:'Terlalu banyak permintaan'});
  const d=await body(req);if(d.consent!==true)throw new Error('Persetujuan penggunaan data diperlukan');
  const name=clean(d.name,3,80,'Nama'),phone=clean(d.phone,9,20,'Telepon').replace(/[\s-]/g,''),address=clean(d.address,12,500,'Alamat'),notes=d.notes?clean(d.notes,0,300,'Catatan'):'';
  if(!/^(\+62|62|0)8\d{8,12}$/.test(phone))throw new Error('Nomor WhatsApp tidak valid');
  if(!Array.isArray(d.items)||d.items.length<1||d.items.length>2)throw new Error('Keranjang tidak valid');
  const seen=new Set();const input=[];
  for(const i of d.items){if(!i||!['arabika','robusta'].includes(i.id)||seen.has(i.id)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>20)throw new Error('Produk atau jumlah tidak valid');seen.add(i.id);input.push({id:i.id,quantity:i.quantity})}
  const client=await db.connect();
  try{await client.query('BEGIN');const ids=input.map(i=>i.id);const p=await client.query('SELECT id,name,price_idr,stock FROM products WHERE enabled=true AND id=ANY($1::text[]) FOR SHARE',[ids]);if(p.rows.length!==ids.length)throw new Error('Produk tidak tersedia');const ps=new Map(p.rows.map(i=>[i.id,i]));let subtotal=0;const items=[];
  for(const i of input){const v=ps.get(i.id);if(v.stock!==null&&i.quantity>v.stock){await client.query('ROLLBACK');return send(res,409,{error:'Stok '+v.name+' tidak mencukupi'})}subtotal+=v.price_idr*i.quantity;items.push({product_id:i.id,product_name:v.name,unit_price_idr:v.price_idr,quantity:i.quantity})}
  const id=crypto.randomUUID();const code='LR-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomBytes(4).toString('hex').toUpperCase();
  await client.query('INSERT INTO orders(id,order_code,customer_name,customer_phone,delivery_address,notes,subtotal_idr) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,code,name,phone,address,notes,subtotal]);
  for(const i of items)await client.query('INSERT INTO order_items(order_id,product_id,product_name,unit_price_idr,quantity) VALUES($1,$2,$3,$4,$5)',[id,i.product_id,i.product_name,i.unit_price_idr,i.quantity]);
  await client.query('COMMIT');return send(res,201,{ok:true,order_code:code,subtotal_idr:subtotal,status:'MENUNGGU_KONFIRMASI',whatsapp_url:wa({order_code:code,customer_name:name,customer_phone:phone,delivery_address:address,notes,subtotal_idr:subtotal},items)})
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
 }
 if(path==='/api/admin/login'&&method==='POST'){
  if(!throttle('login:'+(req.headers['x-forwarded-for']||req.socket.remoteAddress),8,900000))return send(res,429,{error:'Terlalu banyak percobaan login'});
  const d=await body(req);if(typeof d.password!=='string'||!adminPassword||!safeEq(d.password,adminPassword))return send(res,401,{error:'Kata sandi tidak valid'});
  const payload=String(Date.now()+12*3600000)+'.'+randomBytes(16).toString('hex');const token=payload+'.'+sign(payload);return send(res,200,{authenticated:true},{'set-cookie':cookie(token,43200)})
 }
 if(path==='/api/admin/session'&&method==='GET')return send(res,200,{authenticated:adminOk(req)});
 if(path==='/api/admin/logout'&&method==='POST')return send(res,200,{ok:true},{'set-cookie':cookie('',0)});
 if(path.startsWith('/api/admin/')){
  if(!adminOk(req))return send(res,401,{error:'Akses admin diperlukan'});
  if(path==='/api/admin/orders'&&method==='GET'){const q=await db.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 250');for(const row of q.rows){const x=await db.query('SELECT product_name,unit_price_idr,quantity,product_id FROM order_items WHERE order_id=$1',[row.id]);row.items=x.rows}return send(res,200,{orders:q.rows})}
  if(path==='/api/admin/products'&&method==='GET'){const q=await db.query('SELECT * FROM products ORDER BY id');return send(res,200,{products:q.rows})}
  const m=path.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})$/);
  if(m&&method==='PATCH'){
   const d=await body(req);if(!statuses.includes(d.status))throw new Error('Status tidak valid');
   const client=await db.connect();try{await client.query('BEGIN');const q=await client.query('SELECT id,status FROM orders WHERE id=$1 FOR UPDATE',[m[1]]);if(!q.rows.length){await client.query('ROLLBACK');return send(res,404,{error:'Pesanan tidak ditemukan'})}const before=q.rows[0].status;
   if(!transitions[before]?.includes(d.status)){await client.query('ROLLBACK');return send(res,409,{error:'Perubahan status tidak diizinkan'})}
   const its=await client.query('SELECT id,product_id,quantity,reserved_stock FROM order_items WHERE order_id=$1',[m[1]]);
   if(d.status==='DIKONFIRMASI'){for(const i of its.rows){const p=await client.query('SELECT stock FROM products WHERE id=$1 FOR UPDATE',[i.product_id]);if(p.rows[0].stock!==null){if(p.rows[0].stock<i.quantity){await client.query('ROLLBACK');return send(res,409,{error:'Stok tidak mencukupi'})}await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2',[i.quantity,i.product_id]);await client.query('UPDATE order_items SET reserved_stock=true WHERE id=$1',[i.id])}}}
   if(d.status==='DIBATALKAN'&&['DIKONFIRMASI','DIPROSES'].includes(before)){for(const i of its.rows)if(i.reserved_stock){await client.query('UPDATE products SET stock=stock+$1 WHERE id=$2 AND stock IS NOT NULL',[i.quantity,i.product_id]);await client.query('UPDATE order_items SET reserved_stock=false WHERE id=$1',[i.id])}}
   await client.query('UPDATE orders SET status=$1,updated_at=now() WHERE id=$2',[d.status,m[1]]);await client.query('COMMIT');return send(res,200,{ok:true,status:d.status})
   }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
  }
  const p=path.match(/^\/api\/admin\/products\/(arabika|robusta)$/);
  if(p&&method==='PATCH'){const d=await body(req);if(!Number.isInteger(d.price_idr)||d.price_idr<1000||d.price_idr>10000000||!(d.stock===null||Number.isInteger(d.stock)&&d.stock>=0&&d.stock<=1000000))throw new Error('Harga atau stok tidak valid');await db.query('UPDATE products SET price_idr=$1,stock=$2,updated_at=now() WHERE id=$3',[d.price_idr,d.stock,p[1]]);return send(res,200,{ok:true})}
 }
 return send(res,404,{error:'API tidak ditemukan'});
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))return await api(req,res,url.pathname);if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 const path=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);if(path.includes('..')||path.startsWith('.')||path.includes('\\')){res.writeHead(403);return res.end()}
 const full=resolve(root,'public',path);if(!full.startsWith(join(root,'public')+'/')){res.writeHead(403);return res.end()}
 const st=await stat(full).catch(()=>null);if(!st||!st.isFile()){res.writeHead(404);return res.end('Not found')}
 const data=await readFile(full);res.writeHead(200,{'content-type':mime[extname(full)]||'application/octet-stream','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','cache-control':extname(full)==='.html'?'no-store':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){if(/wajib|tidak valid|harus|tidak tersedia|terlalu|Persetujuan|besar/i.test(e.message))return send(res,400,{error:e.message});console.error('Lereng API',e.message);send(res,500,{error:'Gangguan layanan. Coba kembali nanti.'})}});
if(!process.env.DATABASE_URL){console.error('DATABASE_URL required');process.exit(1)}
if(!adminPassword||!sessionSecret){console.error('ADMIN_PASSWORD and SESSION_SECRET must be configured');process.exit(1)}
setup().then(()=>server.listen(port,'0.0.0.0',()=>console.log('Lereng Rinjani server listening on '+port))).catch(e=>{console.error('DB setup failed',e.message);process.exit(1)});
