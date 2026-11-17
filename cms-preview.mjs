// Isolated demo-only CMS. The production database is intentionally untouched.
import {randomUUID,randomBytes} from 'node:crypto';
const defaults={hero_description:'Arabika dan Robusta pilihan dari kaki Gunung Rinjani. Sederhana dalam cerita, berkarakter dalam rasa.',hero_image:'/assets/img/foto8.jpg',story_intro:'ANJANI CORP menghadirkan produk kopi petani Sembalun melalui merek Lereng Rinjani.',story_image:'/assets/img/foto7.jpg',product_intro:'Kopi pilihan Sembalun. Harga dan stok terbaru dari pengelola.',help_intro:'Butuh bantuan memilih kopi, menanyakan stok, atau konfirmasi pesanan? Hubungi kami.'};
const textFields={hero_description:420,story_intro:500,product_intro:300,help_intro:300};
const validImage=v=>typeof v==='string'&&(/^\/assets\/img\/foto[1-8]\.jpg$/.test(v)||/^\/api\/media\/[0-9a-f-]{36}$/.test(v));
const invalid=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const clean=(v,min,max,label)=>{if(typeof v!=='string')invalid(label+' harus berupa teks');const s=v.trim().replace(/[\u0000-\u001f]/g,' ');if(s.length<min||s.length>max)invalid(label+' tidak valid');return s};
const fields=d=>{const name=clean(d.name,3,100,'Nama'),description=clean(d.description||'Kopi pilihan dari Sembalun.',3,500,'Deskripsi'),image=d.image||'/assets/img/foto4.jpg';if(!validImage(image))invalid('Foto tidak diizinkan');const price=Number(d.price_idr),stock=d.stock===null||d.stock===''?null:Number(d.stock);if(!Number.isSafeInteger(price)||price<1000||price>10000000||stock!==null&&(!Number.isSafeInteger(stock)||stock<0||stock>1000000))invalid('Harga atau stok tidak valid');return {name,description,image,price,stock,enabled:d.enabled!==false}};
const data=db=>db.prepare('SELECT id,name,description,image,price_idr,stock,enabled FROM products ORDER BY rowid').all().map(x=>({...x,enabled:!!x.enabled}));
const contents=db=>Object.fromEntries(db.prepare('SELECT key,value FROM site_content').all().map(x=>[x.key,x.value]));
export function installCMS(db){db.exec("ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT 'Kopi pilihan dari Sembalun';ALTER TABLE products ADD COLUMN image TEXT NOT NULL DEFAULT '/assets/img/foto4.jpg';ALTER TABLE orders ADD COLUMN rejection_reason TEXT NOT NULL DEFAULT '';CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE site_images(id TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes BLOB NOT NULL)");db.prepare('UPDATE products SET image=? WHERE id=?').run('/assets/img/foto5.jpg','robusta');for(const [k,v] of Object.entries(defaults))db.prepare('INSERT INTO site_content VALUES (?,?)').run(k,v)}
export async function cms(req,res,path,{db,send,body,adminGuard}) {
 const method=req.method;
 const respond=(code,value,headers={})=>send(res,code,value,headers);
 if(path==='/api/products'&&method==='GET')return respond(200,{products:data(db)}),true;
 if(path==='/api/content'&&method==='GET')return respond(200,{content:contents(db)}),true;
 const media=path.match(/^\/api\/media\/([0-9a-f-]{36})$/);
 if(media&&method==='GET'){const f=db.prepare('SELECT mime,bytes FROM site_images WHERE id=?').get(media[1]);if(!f)return respond(404,{error:'Foto tidak ditemukan'}),true;res.writeHead(200,{'content-type':f.mime,'cache-control':'public,max-age=300','x-content-type-options':'nosniff','x-robots-tag':'noindex'});res.end(f.bytes);return true}
 if(!path.startsWith('/api/admin/'))return false;
 if(!['/api/admin/products','/api/admin/content','/api/admin/media'].includes(path)&&!/^\/api\/admin\/products\/[a-z0-9-]{2,40}$/.test(path)&&!/^\/api\/admin\/orders\/[0-9a-f-]{36}$/.test(path))return false;
 if(method==='GET'&&path==='/api/admin/products')return false;
 if(!(['POST','PATCH'].includes(method)||method==='GET'&&path==='/api/admin/content'))return false;
 adminGuard(req);
 if(method==='GET'&&path==='/api/admin/content')return respond(200,{content:contents(db)}),true;
 if(path==='/api/admin/media'&&method==='POST'){
  const d=await body(req,420000);if(typeof d.image!=='string'||d.image.length>380000)invalid('Foto terlalu besar',413);
  const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(d.image);if(!m)invalid('Gunakan JPG, PNG atau WebP');
  const bytes=Buffer.from(m[2],'base64');if(bytes.length<100||bytes.length>270000)invalid('Foto harus kurang dari 270 KB');
  const ok=m[1]==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||m[1]==='jpeg'&&bytes[0]===255&&bytes[1]===216||m[1]==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!ok)invalid('Berkas foto tidak valid');const id=randomUUID();db.prepare('INSERT INTO site_images VALUES(?,?,?)').run(id,'image/'+m[1],bytes);return respond(201,{url:'/api/media/'+id}),true
 }
 if(path==='/api/admin/content'&&method==='PATCH'){
  const d=await body(req);if(!d||typeof d!=='object'||Array.isArray(d))invalid('Konten tidak valid');
  const entries=Object.entries(d);if(!entries.length||entries.length>6)invalid('Field tidak valid');
  for(const [k,v] of entries){if(k.endsWith('_image')){if(!(k in defaults)||!validImage(v))invalid('Gambar tidak valid')}else{if(!(k in textFields))invalid('Field tidak diizinkan');clean(v,8,textFields[k],'Konten')}}
  for(const [k,v] of entries)db.prepare('UPDATE site_content SET value=? WHERE key=?').run(v.trim(),k);
  return respond(200,{ok:true,content:contents(db)}),true
 }
 if(path==='/api/admin/products'&&method==='POST'){
  if(data(db).length>=32)invalid('Maksimal 32 produk',409);const d=await body(req),p=fields(d);let id=p.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28);
  if(id.length<2)id='kopi';if(db.prepare('SELECT id FROM products WHERE id=?').get(id))id=id.slice(0,22)+'-'+randomBytes(3).toString('hex');
  db.prepare('INSERT INTO products(id,name,description,image,price_idr,stock,enabled) VALUES(?,?,?,?,?,?,?)').run(id,p.name,p.description,p.image,p.price,p.stock,p.enabled?1:0);return respond(201,{ok:true,id}),true
 }
 const product=path.match(/^\/api\/admin\/products\/([a-z0-9-]{2,40})$/);
 if(product&&method==='PATCH'){
  const d=await body(req);const p=fields(d);if(!db.prepare('SELECT id FROM products WHERE id=?').get(product[1]))invalid('Produk tidak ada',404);
  db.prepare('UPDATE products SET name=?,description=?,image=?,price_idr=?,stock=?,enabled=? WHERE id=?').run(p.name,p.description,p.image,p.price,p.stock,p.enabled?1:0,product[1]);
  return respond(200,{ok:true}),true
 }
 const order=path.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})$/);
 if(order&&method==='PATCH'){
  const d=await body(req);const row=db.prepare('SELECT * FROM orders WHERE id=?').get(order[1]);if(!row)invalid('Pesanan tidak ada',404);
  const next=d.status,allowed={MENUNGGU_KONFIRMASI:['DIKONFIRMASI','DIBATALKAN'],DIKONFIRMASI:['DIPROSES','DIBATALKAN'],DIPROSES:['DIKIRIM','DIBATALKAN'],DIKIRIM:['SELESAI'],SELESAI:[],DIBATALKAN:[]};
  if(!allowed[row.status]?.includes(next))invalid('Transisi status tidak diizinkan',409);
  if(next==='DIKONFIRMASI'&&d.verified_contact!==true)invalid('Periksa kontak pelanggan sebelum menerima pesanan');
  const reason=next==='DIBATALKAN'?clean(d.reason,8,250,'Alasan penolakan'):'';
  db.prepare('UPDATE orders SET status=?,rejection_reason=?,updated_at=? WHERE id=?').run(next,reason,new Date().toISOString(),row.id);
  const phone=row.customer_phone.replace(/\D/g,'').replace(/^0/,'62');
  const msg=next==='DIBATALKAN'?'tidak dapat diproses. Alasan: '+reason:next==='DIKONFIRMASI'?'telah diterima dan menunggu konfirmasi pembayaran/pengiriman.':'berstatus '+next;
  const notification_url='https://wa.me/'+phone+'?text='+encodeURIComponent('Halo '+row.customer_name+', pesanan '+row.order_code+' '+msg+' (Lereng Rinjani)');
  return respond(200,{ok:true,status:next,notification_url,notice:'Pesan WhatsApp harus dikirim admin secara manual.'}),true
 }
 return false;
}
