// Konfigurasi ada di config.js (jangan isi kunci di file ini).
const CFG=window.APP_CONFIG||{}, PAY=CFG.PAYMENT||{};
const SUPABASE_URL=CFG.SUPABASE_URL||"PASTE_", SUPABASE_ANON_KEY=CFG.SUPABASE_ANON_KEY||"PASTE_";
const PAYMENT_DESTINATION=`Metode: ${PAY.method||"GoPay"}\nNama penerima: ${PAY.name||"-"}\nNomor: ${PAY.number||"-"}\nCatatan: ${PAY.note||""}`;
const IDLE_MS=(Number(CFG.IDLE_HOURS)||3)*3600000,ACT_KEY="alfabill_last_active";
const QR_IMAGE_PATH=PAY.qrImage||"assets/qris.png";

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
function statusPill(status){ const labels={pending:"Menunggu",approved:"Disetujui",rejected:"Ditolak",paid:"Lunas",unpaid:"Belum lunas",overdue:"Terlambat",active:"Aktif",suspended:"Ditangguhkan",cancelled:"Dibatalkan"}; return `<span class="pill ${safe(status)}">${safe(labels[status]||status)}</span>`; }
function effStatus(i){return i.status==="unpaid"&&i.due_date<new Date().toLocaleDateString("sv-SE")?"overdue":i.status;}
function waLink(phone,text){let d=String(phone||"").replace(/\D/g,"");if(d.startsWith("0"))d="62"+d.slice(1);return d.length>=9?`https://wa.me/${d}?text=${encodeURIComponent(text)}`:"";}
function bindCopy(id,get){const b=$(id),t=b.textContent;b.onclick=async()=>{try{await navigator.clipboard.writeText(String(get()));b.textContent="Tersalin ✓";}catch{b.textContent="Gagal, salin manual";}setTimeout(()=>b.textContent=t,1500);};}
function invActions(i){if(i.status!=="unpaid")return"";const w=waLink(i.profiles?.phone,`Halo ${i.profiles?.full_name||""}, mengingatkan tagihan "${i.title}" ${money(i.amount)}, jatuh tempo ${dateFmt(i.due_date)}. Terima kasih.`);return(w?`<a class="small-btn secondary" target="_blank" rel="noopener" href="${w}">Ingatkan via WhatsApp</a>`:"")+`<button class="small-btn danger" data-cancel-invoice="${i.id}">Batalkan tagihan</button>`;}
function toggle(id, on){ $(id).classList.toggle("hidden",!on); }
function markActive(){try{localStorage.setItem(ACT_KEY,String(Date.now()));}catch{}}
function lastActive(){try{return Number(localStorage.getItem(ACT_KEY))||Date.now();}catch{return Date.now();}}
async function idleCheck(){if(!currentUser||Date.now()-lastActive()<=IDLE_MS)return;try{await sb.auth.signOut();}catch{}setTimeout(()=>showNotice("Anda otomatis keluar karena tidak aktif beberapa jam. Silakan masuk lagi."),400);}
function watchIdle(){let t=0;const bump=()=>{const n=Date.now();if(n-t>15000){t=n;markActive();}};["click","keydown","touchstart","scroll","mousemove"].forEach(ev=>addEventListener(ev,bump,{passive:true}));setInterval(idleCheck,60000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)idleCheck();});}
function addMonths(d,n){const x=new Date(d+"T00:00:00"),day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+n);x.setDate(Math.min(day,new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));return x.toLocaleDateString("sv-SE");}
function planSplit(t,n){const b=Math.floor(t/n);return Array.from({length:n},(_,i)=>i===n-1?t-b*(n-1):b);}
function updatePlanUI(){const p=$("invoiceKind").value==="plan";document.querySelectorAll(".planOnly").forEach(e=>e.classList.toggle("hidden",!p));$("amtLbl").textContent=p?"Total yang dicicil (Rupiah)":"Nominal (Rupiah)";$("dueLbl").textContent=p?"Jatuh tempo cicilan pertama":"Jatuh tempo";const pv=$("planPreview"),t=Number($("invoiceAmount").value),n=Number($("planMonths").value);pv.classList.toggle("hidden",!p);if(!p)return;if(t>0&&n>=2){const a=planSplit(t,Math.floor(n));pv.textContent=`${a.length} cicilan × ${money(a[0])} per bulan`+(a[a.length-1]!==a[0]?` (cicilan terakhir ${money(a[a.length-1])})`:"")+` · total ${money(t)}`;}else pv.textContent="Isi total dan jumlah bulan untuk melihat rincian.";}
let curTab="ringkas";
function adminTab(t){curTab=t;document.querySelectorAll("[data-atab]").forEach(e=>e.classList.toggle("hidden",e.dataset.atab!==t));document.querySelectorAll("#adminTabs [data-go]").forEach(b=>b.classList.toggle("on",b.dataset.go===t));}
let methodsCache=[],selMethod=null;
async function loadMethods(){try{const {data,error}=await sb.from("payment_methods").select("*").order("sort_order").order("created_at");if(error)throw error;methodsCache=data||[];}catch{methodsCache=[];}}
function activeMethods(){const l=methodsCache.filter(m=>m.is_active);return l.length?l:(PAY.number?[{id:"cfg",name:PAY.method||"GoPay",account_name:PAY.name,account_number:PAY.number,instructions:PAY.note,qr_url:PAY.qrImage,is_active:true}]:[]);}
function badge(m){return /^https:\/\//.test(m.logo_url||"")?`<img class="mlogo" src="${safe(m.logo_url)}" alt="">`:`<span class="mlogo" style="background:hsl(${[...m.name].reduce((h,c)=>h+c.charCodeAt(0),0)*37%360} 55% 40%)">${safe(m.name.slice(0,2).toUpperCase())}</span>`;}
function renderMethods(){const l=activeMethods();$("methodGrid").innerHTML=l.length?l.map(m=>`<button type="button" class="method${selMethod?.id===m.id?" sel":""}" data-m="${safe(m.id)}">${badge(m)}<span>${safe(m.name)}</span></button>`).join(""):'<p class="empty">Belum ada metode pembayaran. Hubungi admin.</p>';$("methodGrid").querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{selMethod=l.find(m=>m.id===b.dataset.m);renderMethods();showMethod();});}
function showMethod(){const m=selMethod;toggle("methodDetail",!!m);toggle("checkoutToConfirm",!!m);if(!m)return;$("chosenMethod").textContent=m.name;$("paymentDestination").textContent=`Metode: ${m.name}\nNama penerima: ${m.account_name||"-"}\nNomor/rekening: ${m.account_number||"-"}${m.instructions?"\nCatatan: "+m.instructions:""}`;const img=$("qrisImage"),q=m.qr_url||"";if(/^(https:\/\/|assets\/)/.test(q)){img.onerror=()=>img.classList.add("hidden");img.src=q;img.classList.remove("hidden");}else img.classList.add("hidden");}
function renderDestination(){renderMethods();showMethod();}
function renderAdminMethods(){$("adminMethods").innerHTML=methodsCache.length?methodsCache.map(m=>`<article class="item method-item">${badge(m)}<div><h3>${safe(m.name)} ${m.is_active?'<span class="pill paid">Aktif</span>':'<span class="pill">Nonaktif</span>'}</h3><p>${safe(m.account_name||"-")} · ${safe(m.account_number||"-")}</p><button type="button" class="small-btn secondary" data-mtoggle="${m.id}">${m.is_active?"Nonaktifkan":"Aktifkan"}</button><button type="button" class="small-btn danger" data-mdel="${m.id}">Hapus</button></div></article>`).join(""):'<p class="empty">Belum ada metode. Selama kosong, customer melihat data dari config.js.</p>';
  const done=async(error)=>{if(error)return showNotice(error.message,true);await loadMethods();renderAdminMethods();};
  $("adminMethods").querySelectorAll("[data-mtoggle]").forEach(b=>b.onclick=async()=>{const m=methodsCache.find(x=>x.id===b.dataset.mtoggle);done((await sb.from("payment_methods").update({is_active:!m.is_active}).eq("id",m.id)).error);});
  $("adminMethods").querySelectorAll("[data-mdel]").forEach(b=>b.onclick=async()=>{if(confirm("Hapus metode ini? Riwayat konfirmasi lama tidak terpengaruh."))done((await sb.from("payment_methods").delete().eq("id",b.dataset.mdel)).error);});}
async function addMethod(e){e.preventDefault();const f=id=>$(id).value.trim()||null,logo=f("mLogo"),qr=f("mQr");if((logo&&!/^https:\/\//.test(logo))||(qr&&!/^https:\/\//.test(qr)))return showNotice("URL logo/QR harus diawali https://",true);const {error}=await sb.from("payment_methods").insert({name:f("mName"),account_name:f("mAccName"),account_number:f("mAccNum"),instructions:f("mNote"),logo_url:logo,qr_url:qr,sort_order:methodsCache.length+1});if(error)return showNotice(error.message,true);$("methodForm").reset();showNotice("Metode ditambahkan.");await loadMethods();renderAdminMethods();}
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
  $("welcomeTitle").textContent=data.role==="admin"?"Panel admin":"Halo, "+(data.full_name||"pelanggan").split(" ")[0];
  $("welcomeText").textContent=`Masuk sebagai ${data.full_name||currentUser.email}`;
  toggle("adminArea",data.role==="admin");toggle("customerArea",data.role!=="admin");
  renderDestination();
  if(data.role==="admin") await loadAdmin(); else await loadCustomer();
}
let submissionsCache=[];
async function loadCustomer(){
  const [r1,r2]=await Promise.all([
    sb.from("invoices").select("*").order("due_date",{ascending:true}),
    sb.from("payment_submissions").select("id,invoice_id,claimed_amount,method,reference,note,status,created_at,admin_note").order("created_at",{ascending:false})]);
  if(r1.error) throw r1.error; if(r2.error) throw r2.error;
  invoicesCache=(r1.data||[]).sort((a,b)=>(a.status==="unpaid"?0:1)-(b.status==="unpaid"?0:1));
  submissionsCache=r2.data||[];
  const pending=new Set(submissionsCache.filter(s=>s.status==="pending").map(s=>s.invoice_id));
  const unpaid=invoicesCache.filter(i=>i.status==="unpaid");
  const sum=s=>invoicesCache.filter(i=>i.status===s).reduce((t,i)=>t+Number(i.amount),0);$("stTotal").textContent=money(sum("unpaid"));$("stPaid").textContent=money(sum("paid"));$("stPend").textContent=pending.size;
  $("customerSummary").innerHTML=unpaid.length?`Total belum dibayar: <b>${money(unpaid.reduce((t,i)=>t+Number(i.amount),0))}</b> dari ${unpaid.length} tagihan.`:"Tidak ada tagihan yang perlu dibayar.";
  const plans={};invoicesCache.filter(i=>i.plan_id&&i.status!=="cancelled").forEach(i=>(plans[i.plan_id]=plans[i.plan_id]||[]).push(i));
  $("customerPlans").innerHTML=Object.values(plans).map(l=>{const n=l[0].installment_total,paid=l.filter(i=>i.status==="paid").length,rest=l.filter(i=>i.status!=="paid").reduce((t,i)=>t+Number(i.amount),0),nxt=l.filter(i=>i.status==="unpaid").sort((a,b)=>a.due_date>b.due_date?1:-1)[0];return `<section class="panel plan"><h2>${safe(l[0].title.replace(/ \(\d+\/\d+\)$/,""))}</h2><p class="muted">Total ${money(l[0].plan_total)} · ${n} cicilan</p><div class="bar"><i style="width:${Math.round(paid/n*100)}%"></i></div><p><b>${paid}/${n}</b> cicilan lunas · sisa <b>${money(rest)}</b></p>${nxt?`<p class="muted">Berikutnya: ${money(nxt.amount)} · jatuh tempo ${dateFmt(nxt.due_date)}</p>`:"<p>🎉 Cicilan lunas</p>"}</section>`}).join("");
  $("customerInvoices").innerHTML=invoicesCache.length?invoicesCache.map(i=>`
    <article class="item invoice-card"><div class="invoice-card-top"><span class="invoice-icon">▤</span>${statusPill(effStatus(i))}</div><h3>${safe(i.title)}</h3><p class="invoice-amount">${money(i.amount)}</p><p>Jatuh tempo: ${dateFmt(i.due_date)}</p>${i.note?`<p class="muted">${safe(i.note)}</p>`:""}${i.status==="unpaid"?(pending.has(i.id)?'<p class="muted">⏳ Menunggu verifikasi admin</p>':`<button type="button" class="checkout-primary" data-checkout="${i.id}">Bayar tagihan</button>`):""}</article>`).join(""):'<p class="empty">Belum ada tagihan.</p>';
  $("customerInvoices").querySelectorAll("[data-checkout]").forEach(b=>b.onclick=()=>startCheckout(b.dataset.checkout));
  $("customerSubmissions").innerHTML=submissionsCache.length?submissionsCache.map(s=>{const inv=invoicesCache.find(i=>i.id===s.invoice_id);return `<article class="item"><h3>${safe(inv?.title||"Tagihan")}</h3><p>${money(s.claimed_amount)} · ${safe(s.method)}</p><p>Status: ${statusPill(s.status)}</p><p>Referensi: ${safe(s.reference||"—")}</p><p>Dikirim: ${new Date(s.created_at).toLocaleString("id-ID")}</p>${s.admin_note?`<p>Catatan admin: ${safe(s.admin_note)}</p>`:""}</article>`}).join(""):'<p class="empty">Belum ada konfirmasi pembayaran.</p>';
}
function startCheckout(invoiceId){
  const invoice=invoicesCache.find(i=>i.id===invoiceId);
  if(!invoice||invoice.status!=="unpaid"){showNotice("Tagihan tidak tersedia atau sudah lunas.",true);return;}
  checkoutInvoice=invoice;
  $("checkoutSummary").innerHTML=`<div class="summary-row"><span>Tagihan</span><strong>${safe(invoice.title)}</strong></div><div class="summary-row"><span>Jatuh tempo</span><strong>${dateFmt(invoice.due_date)}</strong></div><div class="summary-total"><span>Total pembayaran</span><strong>${money(invoice.amount)}</strong></div>`;
  $("checkoutAmount").value=Number(invoice.amount);$("checkoutReference").value="";
  showCheckoutPage(true);setCheckoutStep(1);
    selMethod=null;renderDestination();loadMethods().then(renderDestination);
}
function showCheckoutPage(on){["customerHome","customerHistory"].forEach(id=>toggle(id,!on));document.querySelector(".welcome").classList.toggle("hidden",on);toggle("checkoutPanel",on);window.scrollTo(0,0);}
let checkoutStep=1;
function setCheckoutStep(step){checkoutStep=step;
  toggle("checkoutSummary",step===1);toggle("checkoutContinue",step===1);toggle("checkoutPaymentStep",step===2);toggle("checkoutConfirmForm",step===3);
  $("stepSummary").className=step>1?"done": "current";$("stepPay").className=step===2?"current":(step>2?"done":"");$("stepConfirm").className=step===3?"current":"";
  const chip=document.querySelector(".step-chip");if(chip)chip.textContent=`LANGKAH ${step} DARI 3`;
}
async function submitCheckoutConfirmation(e){
  e.preventDefault();if(!checkoutInvoice||!currentUser)return;
  const amount=Number($("checkoutAmount").value),reference=$("checkoutReference").value.trim();
  if(!Number.isSafeInteger(amount)||amount<1){showNotice("Nominal pembayaran tidak valid.",true);return;}
  if(!selMethod){showNotice("Pilih metode pembayaran.",true);return;}
  if(!reference){showNotice("Masukkan nomor referensi transaksi.",true);return;}
  if(checkoutInvoice.status==="paid"){showNotice("Tagihan sudah lunas.",true);return;}
  const btn=$("checkoutConfirmForm").querySelector('button[type="submit"]');btn.disabled=true;
  try{
    const {error}=await sb.from("payment_submissions").insert({invoice_id:checkoutInvoice.id,customer_id:currentUser.id,claimed_amount:amount,method:selMethod?.name||"Lainnya",reference,note:null});
    if(error)throw error;
    showCheckoutPage(false);checkoutInvoice=null;showNotice("Konfirmasi pembayaran terkirim. Tagihan tetap menunggu pemeriksaan admin.");await loadCustomer();
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
  const ok=customersCache.filter(c=>c.account_status==="approved");$("invoiceCustomer").innerHTML=(ok.length>1?`<option value="all">Semua customer aktif (${ok.length})</option>`:"")+ok.map(c=>`<option value="${c.id}">${safe(c.full_name||c.id)}</option>`).join("");
  const {data:inv,error:iErr}=await sb.from("invoices").select("*,profiles:profiles!invoices_customer_id_fkey(full_name,phone)").order("created_at",{ascending:false});
  if(iErr) throw iErr;
  invoicesCache=(inv||[]).sort((a,b)=>(a.status==="unpaid"?0:1)-(b.status==="unpaid"?0:1));
  $("adminInvoices").innerHTML=invoicesCache.length?invoicesCache.map(i=>`<article class="item"><h3>${safe(i.title)}</h3><p>Customer: ${safe(i.profiles?.full_name||i.customer_id)}</p><p>${money(i.amount)} · jatuh tempo ${dateFmt(i.due_date)}</p><p>${statusPill(effStatus(i))}</p>${invActions(i)}</article>`).join(""):'<p class="empty">Belum ada tagihan.</p>';
  $("adminInvoices").querySelectorAll("[data-cancel-invoice]").forEach(b=>b.onclick=()=>cancelInvoice(b.dataset.cancelInvoice));
  const {data:subs,error:sErr}=await sb.from("payment_submissions").select("*,invoices:invoices!payment_submissions_invoice_id_fkey(title,amount,due_date),profiles:profiles!payment_submissions_customer_id_fkey(full_name)").eq("status","pending").order("created_at",{ascending:true});
  if(sErr) throw sErr;
  $("adminSubmissions").innerHTML=(subs||[]).length?(subs||[]).map(s=>`<article class="item"><h3>${safe(s.invoices?.title||"Tagihan")}</h3><p>Customer: ${safe(s.profiles?.full_name||s.customer_id)}</p>${Number(s.claimed_amount)!==Number(s.invoices?.amount)?'<p class="warn">⚠ Nominal yang diklaim berbeda dari tagihan</p>':""}<p>Nominal tagihan: ${money(s.invoices?.amount)} · nominal diklaim dibayar: <b>${money(s.claimed_amount)}</b></p><p>Metode: ${safe(s.method)} · referensi: ${safe(s.reference||"—")}</p><p>Catatan customer: ${safe(s.note||"—")}</p><p>Dikirim: ${new Date(s.created_at).toLocaleString("id-ID")}</p><label>Catatan admin<input id="review-note-${s.id}" maxlength="500" placeholder="Opsional"></label><div class="row-actions"><button class="small-btn" data-review="${s.id}" data-decision="approved">Setujui & tandai lunas</button><button class="small-btn danger" data-review="${s.id}" data-decision="rejected">Tolak</button></div></article>`).join(""):'<p class="empty">Tidak ada konfirmasi yang menunggu.</p>';
  $("adminSubmissions").querySelectorAll("[data-review]").forEach(b=>b.onclick=()=>reviewPayment(b.dataset.review,b.dataset.decision));
  await loadMethods();renderAdminMethods();
  const unpaidSum=invoicesCache.filter(i=>i.status==="unpaid").reduce((t,i)=>t+Number(i.amount),0);
  $("adminStats").innerHTML=`<div class="stat"><span class="ic c3">💳</span><div><small>Konfirmasi menunggu</small><b>${(subs||[]).length}</b></div></div><div class="stat"><span class="ic c1">👥</span><div><small>Akun menunggu</small><b>${waiting.length}</b></div></div><div class="stat"><span class="ic c2">💰</span><div><small>Belum dibayar</small><b>${money(unpaidSum)}</b></div></div>`;
  const nS=(subs||[]).length,nW=waiting.length;$("bdBayar").textContent=nS||"";$("bdCust").textContent=nW||"";
  $("adminQuick").innerHTML=`<button type="button" data-go="bayar">💳 ${nS} konfirmasi perlu diperiksa</button><button type="button" data-go="cust">👥 ${nW} akun menunggu</button><button type="button" data-go="tagihan">🧾 Buat tagihan</button><button type="button" data-go="metode">⚙️ Atur metode pembayaran</button>`;
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>adminTab(b.dataset.go));adminTab(curTab);
  updatePlanUI();
  if(!$("invoiceTitle").value)$("invoiceTitle").value="Tagihan "+new Date().toLocaleDateString("id-ID",{month:"long",year:"numeric"});
  if(!$("invoiceDue").value){const d=new Date();d.setDate(d.getDate()+7);$("invoiceDue").value=d.toLocaleDateString("sv-SE");}
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
  const base={title:$("invoiceTitle").value.trim(),amount,due_date:$("invoiceDue").value,note:$("invoiceNote").value.trim()||null},sel=$("invoiceCustomer").value;
  const ids=sel==="all"?customersCache.filter(c=>c.account_status==="approved").map(c=>c.id):[sel];
  if(sel==="all"&&$("invoiceKind").value!=="plan"&&!confirm(`Buat tagihan ${money(amount)} untuk ${ids.length} customer?`))return;
  let payload;
  if($("invoiceKind").value==="plan"){const n=Number($("planMonths").value);if(sel==="all"){showNotice("Pilih satu customer untuk cicilan.",true);return;}if(!Number.isInteger(n)||n<2||n>60){showNotice("Jumlah cicilan harus 2–60 bulan.",true);return;}if(amount<n){showNotice("Total terlalu kecil untuk jumlah cicilan itu.",true);return;}const pid=crypto.randomUUID();payload=planSplit(amount,n).map((a,k)=>({...base,customer_id:sel,amount:a,title:`${base.title} (${k+1}/${n})`,due_date:addMonths(base.due_date,k),plan_id:pid,installment_no:k+1,installment_total:n,plan_total:amount}));}
  else payload=ids.map(id=>({...base,customer_id:id}));
  try{const {error}=await sb.from("invoices").insert(payload);if(error)throw error;$("invoiceForm").reset();showNotice(`${payload.length} tagihan berhasil dibuat.`);await loadAdmin();}
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
  $("checkoutCancel").onclick=()=>{if(checkoutStep>1)setCheckoutStep(checkoutStep-1);else{showCheckoutPage(false);checkoutInvoice=null;}};
  $("checkoutContinue").onclick=()=>setCheckoutStep(2);
  $("checkoutToConfirm").onclick=()=>setCheckoutStep(3);
  $("checkoutConfirmForm").onsubmit=submitCheckoutConfirmation;bindCopy("copyNumber",()=>selMethod?.account_number||"");$("methodForm").onsubmit=addMethod;["invoiceKind","invoiceAmount","planMonths"].forEach(id=>$(id).oninput=updatePlanUI);bindCopy("copyAmount",()=>checkoutInvoice?.amount||"");
  (async()=>{let had=false,idle=Date.now()-lastActive()>IDLE_MS;if(idle){try{had=!!(await sb.auth.getSession()).data.session;await sb.auth.signOut();}catch{}}else markActive();watchIdle();await refreshSession();if(idle&&had)showNotice("Sesi berakhir karena tidak aktif beberapa jam. Silakan masuk lagi.");})().catch(e=>showNotice(e.message||"Tidak dapat memuat akun.",true));
}
init();
