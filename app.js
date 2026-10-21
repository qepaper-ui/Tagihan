// 1) Ganti dengan URL dan anon/publishable key dari Supabase > Project Settings > API.
const SUPABASE_URL = "PASTE_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_SUPABASE_ANON_OR_PUBLISHABLE_KEY_HERE";

// 2) Atur tujuan pembayaran. Gunakan QR yang memang milik Anda dan sudah diuji.
const PAYMENT_DESTINATION = `Metode: GoPay / transfer bank
Nama penerima: ISI NAMA PENERIMA
Nomor GoPay/rekening: ISI NOMOR TUJUAN
Catatan: Masukkan nominal yang sama persis dengan tagihan.`;
const QR_IMAGE_PATH = "assets/qris.png"; // Ganti file assets/qris.png dengan gambar QR Anda. Boleh dibiarkan tanpa gambar.

const $ = (id) => document.getElementById(id);
const configured = !SUPABASE_URL.includes("PASTE_") && !SUPABASE_ANON_KEY.includes("PASTE_");
let sb = null, currentUser = null, currentProfile = null, invoicesCache = [], customersCache = [], recoveryMode = false, checkoutInvoice = null;

function showNotice(message, error=false) {
  $("notice").textContent = message;
  $("notice").classList.remove("hidden", "error");
  if (error) $("notice").classList.add("error");
  window.scrollTo({top:0,behavior:"smooth"});
}
function clearNotice(){ $("notice").classList.add("hidden"); }
function money(n){ return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0)); }
function dateFmt(s){ if(!s) return "—"; return new Date(s+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}); }
function safe(s){ return String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function statusPill(status){ const labels={pending:"Menunggu",approved:"Disetujui",rejected:"Ditolak",paid:"Lunas",unpaid:"Belum lunas",overdue:"Terlambat",active:"Aktif",suspended:"Ditangguhkan"}; return `<span class="pill ${safe(status)}">${safe(labels[status]||status)}</span>`; }
function toggle(id, on){ $(id).classList.toggle("hidden",!on); }
function renderDestination(){
  $("paymentDestination").textContent=PAYMENT_DESTINATION;
  $("adminDestinationPreview").textContent=PAYMENT_DESTINATION;
  const img=$("qrisImage"), missing=$("qrisMissing");
  img.onload=()=>{img.classList.remove("hidden");missing.classList.add("hidden");};
  img.onerror=()=>{img.classList.add("hidden");missing.classList.remove("hidden");};
  img.src=QR_IMAGE_PATH;
}
function showAuth(tab="login"){toggle("authPanel",true);toggle("appPanel",false);toggle("pendingPanel",false);toggle("recoveryPanel",false);toggle("loginForm",tab==="login");toggle("registerForm",tab==="register");$("loginTab").classList.toggle("active",tab==="login");$("registerTab").classList.toggle("active",tab==="register");toggle("logoutBtn",false);}
function signedOut(){currentUser=null;currentProfile=null;if(!recoveryMode)showAuth();clearNotice();}
function showRecoveryPanel(){
  // Reset-password screen must be isolated from the signed-in application/admin dashboard.
  recoveryMode=true;
  toggle("authPanel",false);
  toggle("appPanel",false);
  toggle("adminArea",false);
  toggle("customerArea",false);
  toggle("pendingPanel",false);
  toggle("recoveryPanel",true);
  toggle("logoutBtn",false);
  clearNotice();
  showNotice("Tautan pemulihan dikenali. Silakan buat kata sandi baru.");
}
async function refreshSession(){
  const {data:{session},error}=await sb.auth.getSession();
  if(error) throw error;
  // Do not let the normal session/profile loader reopen the dashboard during recovery.
  if(recoveryMode) { showRecoveryPanel(); return; }
  if(!session){signedOut();return;}
  currentUser=session.user;
  await loadProfile();
}
async function loadProfile(){
  if(recoveryMode) { showRecoveryPanel(); return; }
  const {data,error}=await sb.from("profiles").select("id,full_name,phone,role,account_status").eq("id",currentUser.id).maybeSingle();
  if(error) throw error;
  currentProfile=data;
  if(recoveryMode) { showRecoveryPanel(); return; }
  toggle("authPanel",false);toggle("logoutBtn",true);
  if(!data){showNotice("Profil belum tersedia. Hubungi admin.",true);return;}
  if(data.role!=="admin" && data.account_status!=="approved"){toggle("appPanel",false);toggle("pendingPanel",true);return;}
  toggle("pendingPanel",false);toggle("appPanel",true);
  $("welcomeTitle").textContent=data.role==="admin"?"Panel admin":"Tagihan saya";
  $("welcomeText").textContent=`Masuk sebagai ${data.full_name||currentUser.email}`;
  toggle("adminArea",data.role==="admin");toggle("customerArea",data.role!=="admin");
  renderDestination();
  if(data.role==="admin") await loadAdmin(); else await loadCustomer();
}
async function loadCustomer(){
  const {data:inv,error}=await sb.from("invoices").select("*").order("due_date",{ascending:true});
  if(error) throw error;
  invoicesCache=inv||[];
  $("customerInvoices").innerHTML=invoicesCache.length?invoicesCache.map(i=>`
    <article class="item invoice-card"><div class="invoice-card-top"><span class="invoice-icon">▤</span>${statusPill(i.status)}</div><h3>${safe(i.title)}</h3><p class="invoice-amount">${money(i.amount)}</p><p>Jatuh tempo: ${dateFmt(i.due_date)}</p>${i.note?`<p class="muted">${safe(i.note)}</p>`:""}${i.status!=="paid"?`<button type="button" class="checkout-primary" data-checkout="${i.id}">Bayar tagihan</button>`:""}</article>`).join(""):'<p class="empty">Belum ada tagihan.</p>';
  $("customerInvoices").querySelectorAll("[data-checkout]").forEach(b=>b.onclick=()=>startCheckout(b.dataset.checkout));
  const {data:subs,error:subErr}=await sb.from("payment_submissions").select("id,invoice_id,claimed_amount,method,reference,note,status,created_at,admin_note").order("created_at",{ascending:false});
  if(subErr) throw subErr;
  $("customerSubmissions").innerHTML=(subs||[]).length?(subs||[]).map(s=>{const inv=invoicesCache.find(i=>i.id===s.invoice_id);return `<article class="item"><h3>${safe(inv?.title||"Tagihan")}</h3><p>${money(s.claimed_amount)} · ${safe(s.method)}</p><p>Status: ${statusPill(s.status)}</p><p>Referensi: ${safe(s.reference||"—")}</p><p>Dikirim: ${new Date(s.created_at).toLocaleString("id-ID")}</p>${s.admin_note?`<p>Catatan admin: ${safe(s.admin_note)}</p>`:""}</article>`}).join(""):'<p class="empty">Belum ada konfirmasi pembayaran.</p>';
}
function startCheckout(invoiceId){
  const invoice=invoicesCache.find(i=>i.id===invoiceId);
  if(!invoice||invoice.status==="paid"){showNotice("Tagihan tidak tersedia atau sudah lunas.",true);return;}
  checkoutInvoice=invoice;
  $("checkoutSummary").innerHTML=`<div class="summary-row"><span>Tagihan</span><strong>${safe(invoice.title)}</strong></div><div class="summary-row"><span>Jatuh tempo</span><strong>${dateFmt(invoice.due_date)}</strong></div><div class="summary-total"><span>Total pembayaran</span><strong>${money(invoice.amount)}</strong></div>`;
  $("checkoutAmount").value=Number(invoice.amount);$("checkoutReference").value="";
  toggle("checkoutPanel",true);toggle("checkoutPaymentStep",false);toggle("checkoutConfirmForm",false);toggle("checkoutContinue",true);
  $("stepSummary").className="current";$("stepPay").className="";$("stepConfirm").className="";
  renderDestination();$("checkoutPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
function setCheckoutStep(step){
  toggle("checkoutSummary",step===1);toggle("checkoutContinue",step===1);toggle("checkoutPaymentStep",step===2);toggle("checkoutConfirmForm",step===3);
  $("stepSummary").className=step>1?"done": "current";$("stepPay").className=step===2?"current":(step>2?"done":"");$("stepConfirm").className=step===3?"current":"";
  const chip=document.querySelector(".step-chip");if(chip)chip.textContent=`LANGKAH ${step} DARI 3`;
}
async function submitCheckoutConfirmation(e){
  e.preventDefault();if(!checkoutInvoice||!currentUser)return;
  const amount=Number($("checkoutAmount").value),reference=$("checkoutReference").value.trim();
  if(!Number.isSafeInteger(amount)||amount<1){showNotice("Nominal pembayaran tidak valid.",true);return;}
  if(!reference){showNotice("Masukkan nomor referensi transaksi.",true);return;}
  if(checkoutInvoice.status==="paid"){showNotice("Tagihan sudah lunas.",true);return;}
  const btn=$("checkoutConfirmForm").querySelector('button[type="submit"]');btn.disabled=true;
  try{
    const {error}=await sb.from("payment_submissions").insert({invoice_id:checkoutInvoice.id,customer_id:currentUser.id,claimed_amount:amount,method:"GoPay",reference,note:null});
    if(error)throw error;
    toggle("checkoutPanel",false);checkoutInvoice=null;showNotice("Konfirmasi pembayaran terkirim. Tagihan tetap menunggu pemeriksaan admin.");await loadCustomer();
  }catch(err){showNotice(err.message||"Gagal mengirim konfirmasi.",true);}finally{btn.disabled=false;}
}
async function loadAdmin(){
  const {data:customers,error:cErr}=await sb.from("profiles").select("id,full_name,phone,role,account_status,created_at").eq("role","customer").order("created_at",{ascending:false});
  if(cErr) throw cErr;
  customersCache=customers||[];
  const waiting=customersCache.filter(c=>c.account_status==="pending");
  $("adminCustomers").innerHTML=customersCache.length?customersCache.map(c=>`<article class="item"><h3>${safe(c.full_name||"Tanpa nama")}</h3><p>${safe(c.phone||"")}</p><p>ID: <code>${safe(c.id)}</code></p><p>${statusPill(c.account_status)}</p>${c.account_status!=="approved"?`<button class="small-btn" data-approve-customer="${c.id}">Setujui akun</button>`:""}${c.account_status==="approved"?`<button class="small-btn secondary" data-suspend-customer="${c.id}">Tangguhkan</button>`:""}</article>`).join(""):'<p class="empty">Belum ada customer.</p>';
  $("adminCustomers").querySelectorAll("[data-approve-customer]").forEach(b=>b.onclick=()=>reviewCustomer(b.dataset.approveCustomer,"approved"));
  $("adminCustomers").querySelectorAll("[data-suspend-customer]").forEach(b=>b.onclick=()=>reviewCustomer(b.dataset.suspendCustomer,"suspended"));
  $("invoiceCustomer").innerHTML=customersCache.filter(c=>c.account_status==="approved").map(c=>`<option value="${c.id}">${safe(c.full_name||c.id)}</option>`).join("");
  const {data:inv,error:iErr}=await sb.from("invoices").select("*,profiles:profiles!invoices_customer_id_fkey(full_name)").order("created_at",{ascending:false});
  if(iErr) throw iErr;
  invoicesCache=inv||[];
  $("adminInvoices").innerHTML=invoicesCache.length?invoicesCache.map(i=>`<article class="item"><h3>${safe(i.title)}</h3><p>Customer: ${safe(i.profiles?.full_name||i.customer_id)}</p><p>${money(i.amount)} · jatuh tempo ${dateFmt(i.due_date)}</p><p>${statusPill(i.status)}</p>${i.status!=="paid"?`<button class="small-btn danger" data-cancel-invoice="${i.id}">Batalkan tagihan</button>`:""}</article>`).join(""):'<p class="empty">Belum ada tagihan.</p>';
  $("adminInvoices").querySelectorAll("[data-cancel-invoice]").forEach(b=>b.onclick=()=>cancelInvoice(b.dataset.cancelInvoice));
  const {data:subs,error:sErr}=await sb.from("payment_submissions").select("*,invoices:invoices!payment_submissions_invoice_id_fkey(title,amount,due_date),profiles:profiles!payment_submissions_customer_id_fkey(full_name)").eq("status","pending").order("created_at",{ascending:true});
  if(sErr) throw sErr;
  $("adminSubmissions").innerHTML=(subs||[]).length?(subs||[]).map(s=>`<article class="item"><h3>${safe(s.invoices?.title||"Tagihan")}</h3><p>Customer: ${safe(s.profiles?.full_name||s.customer_id)}</p><p>Nominal tagihan: ${money(s.invoices?.amount)} · nominal diklaim dibayar: <b>${money(s.claimed_amount)}</b></p><p>Metode: ${safe(s.method)} · referensi: ${safe(s.reference||"—")}</p><p>Catatan customer: ${safe(s.note||"—")}</p><p>Dikirim: ${new Date(s.created_at).toLocaleString("id-ID")}</p><label>Catatan admin<input id="review-note-${s.id}" maxlength="500" placeholder="Opsional"></label><div class="row-actions"><button class="small-btn" data-review="${s.id}" data-decision="approved">Setujui & tandai lunas</button><button class="small-btn danger" data-review="${s.id}" data-decision="rejected">Tolak</button></div></article>`).join(""):'<p class="empty">Tidak ada konfirmasi yang menunggu.</p>';
  $("adminSubmissions").querySelectorAll("[data-review]").forEach(b=>b.onclick=()=>reviewPayment(b.dataset.review,b.dataset.decision));
}
async function reviewCustomer(id,status){
  try{const {error}=await sb.rpc("admin_review_customer",{p_customer_id:id,p_status:status});if(error)throw error;showNotice("Status akun customer diperbarui.");await loadAdmin();}
  catch(e){showNotice(e.message||"Gagal memperbarui akun.",true);}
}
async function reviewPayment(id,decision){
  const note=$(`review-note-${id}`)?.value?.trim()||null;
  if(decision==="approved"&&!confirm("Pastikan dana benar-benar masuk dan nominal sesuai. Setujui dan tandai invoice lunas?"))return;
  try{const {error}=await sb.rpc("admin_review_payment",{p_submission_id:id,p_decision:decision,p_admin_note:note});if(error)throw error;showNotice(decision==="approved"?"Pembayaran disetujui; invoice ditandai lunas.":"Konfirmasi pembayaran ditolak.");await loadAdmin();}
  catch(e){showNotice(e.message||"Gagal memproses konfirmasi.",true);}
}
async function cancelInvoice(id){
  if(!confirm("Batalkan tagihan ini?"))return;
  try{const {error}=await sb.rpc("admin_cancel_invoice",{p_invoice_id:id});if(error)throw error;showNotice("Tagihan dibatalkan.");await loadAdmin();}
  catch(e){showNotice(e.message||"Gagal membatalkan tagihan.",true);}
}
async function createInvoice(e){
  e.preventDefault();const amount=Number($("invoiceAmount").value);
  if(!Number.isSafeInteger(amount)||amount<1){showNotice("Nominal harus berupa bilangan Rupiah positif.",true);return;}
  const payload={customer_id:$("invoiceCustomer").value,title:$("invoiceTitle").value.trim(),amount,due_date:$("invoiceDue").value,note:$("invoiceNote").value.trim()||null};
  try{const {error}=await sb.from("invoices").insert(payload);if(error)throw error;$("invoiceForm").reset();showNotice("Tagihan berhasil dibuat.");await loadAdmin();}
  catch(e){showNotice(e.message||"Gagal membuat tagihan.",true);}
}
function init(){
  if(!configured){toggle("setupPanel",true);return;}
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  // Password recovery links return to this GitHub Pages URL; Supabase JS processes the URL session.
  sb.auth.onAuthStateChange((event,session)=>{
    if(event==="PASSWORD_RECOVERY"){
      showRecoveryPanel();
    } else if(event==="SIGNED_OUT" && !recoveryMode){ signedOut(); }
  });
  $("forgotPasswordBtn").onclick=async()=>{
    const email=$("loginEmail").value.trim();
    if(!email){showNotice("Masukkan email akun terlebih dahulu, lalu klik Lupa kata sandi.",true);$("loginEmail").focus();return;}
    const btn=$("forgotPasswordBtn");btn.disabled=true;
    try{
      const redirectTo=window.location.origin+window.location.pathname;
      const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
      if(error)throw error;
      showNotice("Jika email terdaftar, instruksi pemulihan akan dikirim. Periksa Inbox/Spam. Jangan meminta email berulang kali jika terkena rate limit.");
    }catch(err){showNotice(err.message||"Permintaan pemulihan gagal.",true);}finally{btn.disabled=false;}
  };
  $("recoveryForm").onsubmit=async e=>{
    e.preventDefault();
    const password=$("newPassword").value, confirmPassword=$("confirmNewPassword").value;
    if(password.length<8){showNotice("Kata sandi minimal 8 karakter.",true);return;}
    if(password!==confirmPassword){showNotice("Kedua kata sandi tidak sama.",true);return;}
    const btn=$("recoveryForm").querySelector('button[type="submit"]');btn.disabled=true;
    try{
      const {error}=await sb.auth.updateUser({password});if(error)throw error;
      recoveryMode=false;$("recoveryForm").reset();await sb.auth.signOut();showAuth("login");showNotice("Kata sandi berhasil diperbarui. Silakan masuk menggunakan kata sandi baru.");
    }catch(err){showNotice(err.message||"Gagal menyimpan kata sandi. Minta tautan baru setelah batas email pulih.",true);}finally{btn.disabled=false;}
  };
  $("loginTab").onclick=()=>showAuth("login");$("registerTab").onclick=()=>showAuth("register");
  $("loginForm").onsubmit=async e=>{e.preventDefault();try{const {error}=await sb.auth.signInWithPassword({email:$("loginEmail").value,password:$("loginPassword").value});if(error)throw error;await refreshSession();}catch(err){showNotice(err.message||"Gagal masuk.",true);}};
  $("registerForm").onsubmit=async e=>{e.preventDefault();try{const {data,error}=await sb.auth.signUp({email:$("regEmail").value,password:$("regPassword").value,options:{data:{full_name:$("regName").value.trim(),phone:$("regPhone").value.trim()}}});if(error)throw error;if(data.session){currentUser=data.user;await loadProfile();}else{showNotice("Pendaftaran dikirim. Jika verifikasi email aktif, buka email Anda. Setelah itu admin akan menyetujui akun.");showAuth("login");}}catch(err){showNotice(err.message||"Pendaftaran gagal.",true);}};
  $("logoutBtn").onclick=async()=>{await sb.auth.signOut();signedOut();};
  $("pendingRefresh").onclick=async()=>{try{await refreshSession();}catch(e){showNotice(e.message,true);}};
  $("invoiceForm").onsubmit=createInvoice;
  $("checkoutCancel").onclick=()=>{toggle("checkoutPanel",false);checkoutInvoice=null;};
  $("checkoutContinue").onclick=()=>setCheckoutStep(2);
  $("checkoutToConfirm").onclick=()=>setCheckoutStep(3);
  $("checkoutConfirmForm").onsubmit=submitCheckoutConfirmation;
  refreshSession().catch(e=>showNotice(e.message||"Tidak dapat memuat akun.",true));
}
init();
