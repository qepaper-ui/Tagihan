# Checkout bertahap Sistem Tagihan

Pembaruan UI untuk checkout bertahap dengan metode GoPay dan verifikasi manual. Tidak menghapus atau mengubah schema/tabel Supabase yang ada. `schema.sql` tetap dipertahankan tanpa perubahan.

## File yang diubah
- `index.html`: halaman checkout tiga langkah.
- `app.js`: pilih tagihan, ringkasan, instruksi GoPay, konfirmasi nominal dan nomor referensi.
- `style.css`: gaya checkout responsif untuk ponsel.

## Sebelum diunggah
1. Buka `app.js` dan pertahankan/masukkan nilai `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PAYMENT_DESTINATION` milik Anda. ZIP ini sengaja tidak menyertakan rahasia project.
2. Jangan mengubah `schema.sql` atau menjalankannya ulang. Database lama dipakai kembali.
3. Unggah/commit file `index.html`, `app.js`, dan `style.css` ke repository GitHub yang sama. File lain dan aset QR yang sudah Anda miliki jangan dihapus.
4. Pastikan `assets/qris.png` (jika Anda menggunakan gambar QR) tetap berada di repository. Walaupun metode utama di UI ditetapkan GoPay, QR yang ditampilkan harus benar-benar milik Anda dan cocok dengan metode yang dijelaskan.
5. Setelah GitHub Pages selesai deploy, muat ulang paksa dan uji dengan akun customer.

## Alur checkout
1. Customer klik **Bayar tagihan**.
2. Langkah ringkasan menunjukkan total dari tagihan database.
3. Langkah bayar menunjukkan instruksi tujuan GoPay yang diatur di `PAYMENT_DESTINATION` dan gambar QR jika ada.
4. Langkah konfirmasi meminta nominal yang dibayar dan nomor referensi.
5. Konfirmasi masuk ke `payment_submissions` dengan status default yang sudah ditentukan schema/database. Tagihan tidak otomatis lunas. Admin harus memeriksa transaksi sungguhan dan menyetujui melalui panel admin.

## Catatan keamanan
- Nominal dan nomor referensi adalah klaim customer, bukan bukti bahwa dana benar-benar diterima.
- Jangan mengubah status invoice menjadi lunas dari browser customer.
- Jangan memasukkan `service_role`/secret key ke `app.js`.
- Fitur ini memakai tabel dan RPC yang sudah ada; tidak ada migrasi SQL yang diperlukan untuk UI checkout ini.
