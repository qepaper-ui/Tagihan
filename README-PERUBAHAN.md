# Perubahan v2 (lebih mudah dipakai)

Tidak ada perubahan database. `schema.sql` tidak perlu dijalankan ulang.

## Langkah pasang (sekali saja)
1. Buka `config.js`, isi `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan data `PAYMENT` (nama + nomor GoPay).
2. Unggah `config.js`, `index.html`, `app.js`, `style.css` ke repository. Folder `assets/` (qris.png) jangan dihapus.
3. Update berikutnya cukup mengganti `app.js`/`index.html`/`style.css`; kunci di `config.js` tidak ikut tertimpa.

## Customer
- Ringkasan total yang belum dibayar di bagian atas.
- Tagihan belum lunas tampil paling atas; status Terlambat dan Dibatalkan ditampilkan.
- Tombol Bayar tidak muncul untuk tagihan batal, dan diganti "Menunggu verifikasi admin" jika konfirmasi sudah dikirim (mencegah kiriman ganda).
- Tombol Salin nomor dan Salin nominal di langkah bayar.
- Tombol Kembali kini mundur satu langkah. Perbaikan bug: checkout kedua tidak lagi kosong.

## Admin
- Ringkasan: konfirmasi menunggu, akun menunggu, total belum dibayar. Konfirmasi pembayaran dipindah ke paling atas.
- Peringatan jika nominal yang diklaim berbeda dari tagihan.
- Buat tagihan: judul bulan ini dan jatuh tempo +7 hari terisi otomatis; opsi "Semua customer aktif" untuk tagihan bulanan sekaligus.
- Tombol Ingatkan via WhatsApp (jika customer mengisi nomor HP).

## v3 — tampilan GoBill
- Header putih, banner ruang pelanggan, tiga kartu ringkasan (Total tagihan, Sudah dibayar, Menunggu verifikasi), sapaan "Halo, nama".
- Semua fitur v2 tetap ada. Tidak ada perubahan database.

## v4 — halaman pembayaran khusus
- Klik "Bayar tagihan" membuka halaman pembayaran penuh (ringkasan, bayar, konfirmasi); dashboard disembunyikan. Tombol "← Kembali" mundur satu langkah, lalu kembali ke daftar tagihan.

## v5 — metode pembayaran dinamis
- Jalankan `schema-metode-pembayaran.sql` SEKALI di Supabase SQL Editor (wajib; juga melonggarkan batas kolom method).
- Customer memilih metode dari kartu; admin menambah/nonaktifkan/hapus metode di panel admin. Jika tabel kosong, dipakai data PAYMENT di config.js.

## v6 — admin bertab + tema ceria
- Panel admin dibagi tab: Ringkasan, Pembayaran, Tagihan, Customer, Metode (badge merah = jumlah yang menunggu).
- Warna gradasi cerah di seluruh aplikasi. Tidak ada perubahan database tambahan.

## v7 — Alfabill
- Logo/ikon Alfabill (header, login, favicon, ikon layar utama ponsel), palet biru, layar ponsel, dan auto-logout setelah tidak aktif (atur `IDLE_HOURS` di config.js, default 3 jam).

## v8 — cicilan
- Jalankan `schema-cicilan.sql` SEKALI di Supabase SQL Editor (wajib).
- Admin: tab Tagihan > Jenis "Cicilan": isi total, jumlah bulan, jatuh tempo pertama. Sistem membuat tagihan bulanan otomatis (sisa pembulatan masuk cicilan terakhir). Customer melihat progres dan sisa cicilan.

## v9
- Logo kini tertanam di index.html (tidak perlu folder assets agar logo tampil). Penanda ?v=9 memaksa browser memuat style.css/app.js terbaru. Pastikan style.css, app.js, config.js, index.html semua ikut diunggah.

## v10
- Logo dibuat opaque (latar putih) agar tidak jadi kotak hitam di mode gelap otomatis Android/Chrome; halaman dikunci ke mode terang; penyesuaian layout ponsel, tablet, dan laptop.
