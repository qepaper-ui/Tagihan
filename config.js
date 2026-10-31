// SATU-SATUNYA file yang perlu Anda isi. Memperbarui app.js/index.html/style.css tidak akan menghapus isi ini.
window.APP_CONFIG = {
  SUPABASE_URL: "https://pjeitduvvvigznkwtbjb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Vl2HHitV1fXg0OXN7lH7Fg_9VG0O5fb", // hanya anon/publishable key, JANGAN service_role
  IDLE_HOURS: 3, // otomatis keluar jika tidak ada aktivitas selama sekian jam
  PAYMENT: {
    method: "GoPay",
    name: "ISI NAMA PENERIMA",
    number: "ISI NOMOR TUJUAN",
    note: "Masukkan nominal yang sama persis dengan tagihan.",
    qrImage: "assets/qris.png" // boleh dibiarkan jika tidak ada gambar QR
  }
};
