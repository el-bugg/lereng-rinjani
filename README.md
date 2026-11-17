# Lereng Rinjani — ANJANI CORP

Website produk kopi Arabika dan Robusta dari Sembalun, Lombok Timur.

## URL
- Website fullstack: https://lereng-rinjani-fullstack-3r6n.onrender.com
- Dashboard admin: https://lereng-rinjani-fullstack-3r6n.onrender.com/admin.html
- API status: https://lereng-rinjani-fullstack-3r6n.onrender.com/api/health
- Preview statis lama: https://lereng-rinjani-preview.onrender.com (bukan website transaksi, jangan digunakan untuk order)

## Backend
Node.js + `pg` + PostgreSQL di Render, dengan API:
- `GET /api/health`
- `GET /api/products`
- `POST /api/orders` — server menghitung ulang harga dan membuat kode pesanan
- `POST /api/admin/login`
- `GET /api/admin/session`
- `POST /api/admin/logout`
- `GET /api/admin/orders`
- `GET /api/admin/products`
- `PATCH /api/admin/orders/:id`
- `PATCH /api/admin/products/:id`

Kata sandi dan kunci sesi admin hanya disimpan pada environment variables Render. Tidak pernah commit kredensial ke GitHub. Admin harus segera mengganti kata sandi awal sebelum menerima pesanan nyata.

## Jalankan secara lokal
```sh
npm install
export DATABASE_URL="postgresql://..."
export ADMIN_PASSWORD="ganti-dengan-sandi-kuat"
export SESSION_SECRET="ganti-dengan-random-secret-panjang"
npm start
```
Jangan menyimpan kredensial di repository.

## Status bisnis / batasan
- Ini masih **versi uji coba**, bukan sistem pembayaran tersertifikasi.
- Harga awal yang dimigrasikan: Rp45.000 per 100 gram untuk masing-masing produk. Harga dan stok akhir perlu diverifikasi admin.
- Pesanan dicatat pada PostgreSQL dan kemudian diarahkan ke WhatsApp untuk konfirmasi. Pembayaran dan pengiriman dilakukan manual setelah persetujuan admin.
- Database PostgreSQL gratis Render akan **kedaluwarsa 17 Desember 2026**, sehingga **tidak layak menjadi penyimpanan order produksi permanen**. Migrasikan ke paket database persisten dan siapkan backup sebelum menerima transaksi nyata.
- URL utama dapat melambat saat Render Free instance tertidur.
- Foto yang sekarang tampil dari Unsplash adalah ilustrasi sementara, **belum foto asli yang disertakan di arsip website**. Foto merek asli harus diunggah sebelum situs digunakan resmi.
- Profil lengkap perusahaan, mitra, dan klaim ekspor belum semuanya diunggah karena perlu verifikasi pemilik.
- Rencana React, shadcn/ui, Motion belum diterapkan. Frontend sekarang berupa HTML/CSS/JavaScript agar demo online tidak bergantung pada build kompleks.
- Pelanggan hanya boleh menganggap pesanan diterima sesudah memperoleh nomor order dan konfirmasi admin.
- Jangan gunakan situs untuk pembayaran otomatis atau data sensitif tanpa pengujian keamanan independen dan kebijakan privasi final.

## Pengujian
GitHub Actions `.github/workflows/qa.yml` menjalankan pemeriksaan API, proteksi admin, browser desktop/Android, keranjang, navigasi, dan screenshot. Lihat tab Actions untuk hasil aktual; adanya file pengujian tidak berarti semua pengujian sudah berhasil.

## Pengoperasian
Admin login di `/admin.html`, kemudian kelola harga, stok, status pesanan. Stok kosong berarti ketersediaan belum ditentukan; konfirmasi stok secara manual. Jangan menjanjikan pengiriman sebelum stok, ongkos kirim, dan pembayaran diverifikasi.
