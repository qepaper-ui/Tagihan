# Sistem Tagihan QR/Transfer — tanpa Midtrans

Paket ini adalah contoh awal website tagihan berbasis Supabase. Pembayaran **tidak diverifikasi otomatis**. Customer hanya mengirim klaim pembayaran; invoice menjadi `paid/lunas` hanya setelah admin meninjau transaksi dan menyetujui melalui website.

## Fitur
- Daftar customer; akun baru berstatus menunggu persetujuan admin.
- Customer yang disetujui hanya dapat melihat invoice miliknya.
- Admin membuat tagihan dan melihat semua tagihan/customer.
- Customer mengirim konfirmasi dengan metode, nominal yang diklaim dibayar, referensi, dan catatan.
- Admin menyetujui atau menolak konfirmasi. Persetujuan mengubah invoice menjadi lunas melalui RPC database yang memeriksa role admin.
- Tidak ada Midtrans, webhook, atau payment gateway dalam paket ini.

## Penting tentang QR pribadi
Anda memilih QR pribadi GoPay/transfer bank non-QRIS dan nominal dimasukkan manual. QR pribadi atau nomor transfer dapat ditampilkan sebagai petunjuk pembayaran, tetapi **jangan menganggapnya QRIS universal**. Aplikasi bank/e-wallet lain mungkin tidak dapat memindai QR pribadi GoPay. Jika ingin banyak aplikasi bisa membayar melalui satu QR, gunakan QRIS resmi yang diterbitkan bank/penyedia QRIS. Dana akan masuk ke akun penerima yang terkait dengan QR tersebut.
- Ganti `PAYMENT_DESTINATION` di `app.js` dengan nama penerima dan nomor tujuan yang benar.
- Jika ingin menampilkan QR, ganti `assets/qris.png` dengan gambar QR milik Anda. Jangan unggah QR milik orang lain. Uji dengan nominal kecil terlebih dahulu.
- Untuk QR pribadi GoPay, beri tahu customer bahwa mereka harus memakai aplikasi/metode yang didukung QR tersebut.
- Nominal dalam form konfirmasi hanya klaim customer, bukan bukti uang telah masuk. Admin wajib memeriksa aplikasi merchant/bank secara mandiri.

## Instalasi

### 1. Buat project Supabase
1. Masuk ke Supabase dan buat project.
2. Buka **SQL Editor**.
3. Jalankan seluruh isi `schema.sql`.
4. Buka **Project Settings → API** (atau API Keys) lalu salin Project URL dan anon/publishable key.
5. Edit `app.js`: ganti `SUPABASE_URL` dan `SUPABASE_ANON_KEY`.
   - Jangan pernah menaruh `service_role` key di HTML/JavaScript.
6. Edit `PAYMENT_DESTINATION` pada `app.js` sesuai rekening/GoPay Anda.
7. Opsional: ganti `assets/qris.png` dengan gambar QR pembayaran Anda. Folder berisi petunjuk placeholder; tambahkan gambar Anda sendiri bernama `qris.png`.

### 2. Buat admin
1. Buka website, pilih **Daftar customer**, daftarkan akun email milik Anda sendiri.
2. Jika Supabase meminta verifikasi email, buka email dan verifikasi.
3. Di Supabase → SQL Editor, jalankan query berikut dengan email admin Anda:
   ```sql
   update public.profiles p
   set role='admin', account_status='approved'
   from auth.users u
   where p.id=u.id and lower(u.email)=lower('EMAIL_ADMIN_ANDA');
   ```
4. Keluar lalu masuk kembali ke website. Akun admin sekarang akan menampilkan panel admin.

### 3. Host frontend
Untuk uji coba, jalankan dari server lokal atau deploy folder ini ke static hosting yang Anda gunakan. Jika memakai GitHub Pages, periksa ketentuan penggunaan terbaru dan jangan menganggapnya sebagai rekomendasi untuk portal komersial. Simpan kode di GitHub; jangan pernah commit password atau service-role key. File `app.js` memakai public anon/publishable key yang memang dirancang untuk frontend; keamanan data bergantung pada RLS dan RPC di `schema.sql`.

### 4. Customer dan tagihan
1. Customer daftar melalui halaman.
2. Admin menyetujui akun dari panel admin.
3. Admin membuat tagihan dengan nominal Rupiah dan tanggal jatuh tempo.
4. Customer login, membaca instruksi pembayaran, membayar ke tujuan yang ditampilkan, lalu mengirim konfirmasi.
5. Admin mencocokkan dana masuk di aplikasi GoPay/bank. Hanya setelah cocok, klik **Setujui & tandai lunas**.

## Tagihan bulanan
Paket ini belum membuat tagihan berulang otomatis. Untuk versi awal, admin membuat invoice setiap bulan melalui panel. Jangan menyebut tagihan otomatis sebelum scheduler/fitur recurring diuji dan diimplementasikan.

## Pengujian wajib sebelum dipakai sungguhan
- Buat dua akun customer dan pastikan masing-masing hanya melihat invoice sendiri.
- Coba akses invoice customer lain; harus ditolak RLS.
- Pastikan customer tidak bisa mengubah profil/role/status invoice melalui API.
- Pastikan hanya admin yang bisa menyetujui pembayaran.
- Uji skenario nominal salah, referensi kosong, konfirmasi ganda, invoice lunas, dan customer ditangguhkan.
- Uji di Supabase staging terlebih dahulu. Ini starter project, bukan audit keamanan atau jaminan production-ready.

## Catatan keamanan
- Jangan berikan akses admin kepada customer.
- Jangan izinkan customer mengubah status invoice menjadi lunas.
- Jangan percaya screenshot/nomor referensi saja; cocokkan transaksi di aplikasi penerima.
- Jika akun Supabase menggunakan pengaturan email-confirmation, customer mungkin perlu verifikasi email sebelum bisa login.
- Fungsi SQL memakai pemeriksaan `is_admin()` di server/database; jangan hapus pemeriksaan tersebut.


## Pemulihan kata sandi di GitHub Pages
- Versi ini menambahkan tombol **Lupa kata sandi?** dan formulir kata sandi baru.
- Di Supabase → Authentication → URL Configuration, pastikan Site URL dan Redirect URLs memuat `https://qepaper-ui.github.io/Tagihan/`.
- Setelah batas email pulih, masukkan email pada form login lalu tekan **Lupa kata sandi?** satu kali. Periksa Inbox/Spam. Tautan harus kembali ke situs GitHub Pages, bukan `localhost`.
- Kata sandi baru minimal 8 karakter. Setelah berhasil, masuk lagi menggunakan kata sandi baru.
- Jangan membagikan tautan pemulihan, password, atau service_role key.
