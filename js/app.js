
/* =====================================================
   Higher-Ed CMS Frontend Prototype (Vanilla JS)
   - LocalStorage persistence
   - Leads CRUD, stages, temperature
   - Reports table with sort/filter/search
   - Dashboard KPIs + Charts (Chart.js)
   - Forms builder (embed snippet)
   - SMS & Email mock workspaces
   - Profile + Tracking pixel generator
   ===================================================== */

const STAGES = ["Lead","Interested","Applied","Accepted","Deposited","Matriculated","Declined"];
const TEMPS  = ["Hot","Warm","Cold","Nonresponsive"];

const PROGRAMS = [
  "RN to BSN (Online)",
  "MS in Health Informatics",
  "Hybrid DPT",
  "MSW Online",
  "MBA Online",
  "MS in Data Science"
];

// ---------- Utilities
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function uid(){ return Math.random().toString(36).slice(2,10) }
function fmtDate(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toISOString().slice(0,10);
}
function saveLS(key, val){ localStorage.setItem(key, JSON.stringify(val)) }
function loadLS(key, def){ try{ return JSON.parse(localStorage.getItem(key)) ?? def }catch(e){ return def } }

// ---------- App State
const state = {
  leads: loadLS("hecms_leads", []),
  profile: loadLS("hecms_profile", {}),
  forms: loadLS("hecms_forms", []),
  sms: loadLS("hecms_sms", {threads:[],active:null}),
  email: loadLS("hecms_email", {templates:[], automations:[]}),
  reports: loadLS("hecms_reports", []),
  events: loadLS("hecms_events", []),
  sort: {key:"createdAt", dir:"desc"}
};

// Seed if empty
if(state.leads.length === 0){
  const seed = [
    {firstName:"Alex", lastName:"Rivera", email:"alex@example.com", phone:"412-555-0101", address:"123 Forbes Ave, Pittsburgh, PA",
     program:"MS in Health Informatics", birthdate:"1998-04-12", stage:"Lead", temperature:"Warm", createdAt:fmtDate(new Date()), notes:"Requested brochure. Source: Paid Social (Meta)."},
    {firstName:"Brianna", lastName:"Ng", email:"bri.ng@example.com", phone:"412-555-0112", address:"77 Fifth Ave, Pittsburgh, PA",
     program:"RN to BSN (Online)", birthdate:"1995-09-20", stage:"Applied", temperature:"Hot", createdAt:fmtDate(new Date(Date.now()-86400000*3)), notes:"Nurse, 4 yrs exp. UTM: google/cpc/brand."},
    {firstName:"Chris", lastName:"O'Neil", email:"chris.oneil@example.com", phone:"412-555-0123", address:"9 Grant St, Pittsburgh, PA",
     program:"Hybrid DPT", birthdate:"1999-01-03", stage:"Interested", temperature:"Cold", createdAt:fmtDate(new Date(Date.now()-86400000*8)), notes:"Came from referral. Opened 2 emails."},
    {firstName:"Dana", lastName:"Khan", email:"dana.khan@example.com", phone:"412-555-0140", address:"45 Walnut St, Pittsburgh, PA",
     program:"MBA Online", birthdate:"1993-07-30", stage:"Accepted", temperature:"Warm", createdAt:fmtDate(new Date(Date.now()-86400000*15)), notes:"Scholarship pending."},
    {firstName:"Evan", lastName:"Lee", email:"evan.lee@example.com", phone:"412-555-0199", address:"5 Liberty Ave, Pittsburgh, PA",
     program:"MS in Data Science", birthdate:"2000-11-05", stage:"Matriculated", temperature:"Hot", createdAt:fmtDate(new Date(Date.now()-86400000*30)), notes:"Orientation complete."},
  ];
  state.leads = seed.map(l => ({ id: uid(), ...l }));
  saveLS("hecms_leads", state.leads);
}
PROGRAMS.forEach(p => {
  const opt = document.createElement("option");
  opt.value = p;
  $("#programList").appendChild(opt);
});

// ---------- Navigation
$$(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".nav-link").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    $$(".view").forEach(v=>v.classList.remove("active"));
    $("#view-"+view).classList.add("active");
    // refresh on view switch
    if(view==="dashboard") renderDashboard();
    if(view==="reports") renderReports();
    if(view==="analytics") renderAnalytics();
    if(view==="forms") renderForms();
    if(view==="sms") renderSMS();
    if(view==="email") renderEmail();
    if(view==="profile") renderProfile();
    if(view==="tracking") renderTracking();
  });
});

// ---------- Dashboard
let funnelChart, tempChart;
function renderDashboard(){
  // KPIs
  $("#kpi-total").textContent = state.leads.length;
  $("#kpi-hot").textContent = state.leads.filter(l=>l.temperature==="Hot").length;
  $("#kpi-applied").textContent = state.leads.filter(l=>l.stage==="Applied").length;
  $("#kpi-matriculated").textContent = state.leads.filter(l=>l.stage==="Matriculated").length;

  // Funnel data
  const counts = STAGES.map(s => state.leads.filter(l=>l.stage===s).length);
  const ctx1 = $("#funnelChart");
  if(funnelChart){ funnelChart.destroy(); }
  funnelChart = new Chart(ctx1, {
    type:"bar",
    data:{
      labels: STAGES,
      datasets:[{label:"Leads", data:counts}]
    },
    options:{responsive:true, plugins:{legend:{display:false}}}
  });

  // Temp pie
  const temps = TEMPS.map(t => state.leads.filter(l=>l.temperature===t).length);
  const ctx2 = $("#tempChart");
  if(tempChart){ tempChart.destroy(); }
  tempChart = new Chart(ctx2, {
    type:"doughnut",
    data:{
      labels: TEMPS,
      datasets:[{data:temps}]
    },
    options:{responsive:true}
  });

  // Recent
  const sorted = [...state.leads].sort((a,b)=> (a.createdAt<b.createdAt?1:-1)).slice(0,8);
  const box = $("#recentLeads");
  box.innerHTML = "";
  sorted.forEach(l => {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `<div style="flex:1">${l.lastName}, ${l.firstName} • <span class="muted">${l.program}</span></div>
                     <div class="muted">${l.stage} • ${l.temperature} • ${l.createdAt}</div>`;
    box.appendChild(div);
  });
}
$("#addLeadBtn").addEventListener("click", ()=>toggleDrawer(true));

// ---------- Reports / Table
const tableBody = $("#leadsTable tbody");
$("#filterProgram").innerHTML = `<option value="">All Programs</option>` + PROGRAMS.map(p=>`<option>${p}</option>`).join("");

function renderReports(){
  buildTable();
  populateSavedReports();
}
function buildTable(){
  const q = $("#searchInput").value.toLowerCase();
  const stage = $("#filterStage").value;
  const temp  = $("#filterTemp").value;
  const program = $("#filterProgram").value;
  let rows = state.leads.filter(l => {
    const matchesQ = (l.firstName+l.lastName+l.email+l.phone+l.address+l.program).toLowerCase().includes(q);
    const matchesS = stage ? l.stage===stage : true;
    const matchesT = temp ? l.temperature===temp : true;
    const matchesP = program ? l.program===program : true;
    return matchesQ && matchesS && matchesT && matchesP;
  });
  const {key, dir} = state.sort;
  rows.sort((a,b)=>{
    const A = (a[key]||"").toString().toLowerCase();
    const B = (b[key]||"").toString().toLowerCase();
    if(A<B) return dir==="asc" ? -1 : 1;
    if(A>B) return dir==="asc" ? 1 : -1;
    return 0;
  });
  tableBody.innerHTML = rows.map(l => `
    <tr>
      <td>${l.lastName}</td>
      <td>${l.firstName}</td>
      <td>${l.email}</td>
      <td>${l.phone}</td>
      <td>${l.address}</td>
      <td>${l.program}</td>
      <td>${l.birthdate||""}</td>
      <td>${l.stage}</td>
      <td>${l.temperature}</td>
      <td>${l.createdAt}</td>
      <td><button class="btn sm" data-edit="${l.id}">Edit</button></td>
    </tr>
  `).join("");
}
$("#searchInput").addEventListener("input", buildTable);
$("#filterStage").addEventListener("change", buildTable);
$("#filterTemp").addEventListener("change", buildTable);
$("#filterProgram").addEventListener("change", buildTable);
$("#leadsTable thead").addEventListener("click", e=>{
  const th = e.target.closest("th");
  if(!th || !th.dataset.sort) return;
  const key = th.dataset.sort;
  if(state.sort.key===key){ state.sort.dir = state.sort.dir==="asc"?"desc":"asc"; }
  else { state.sort.key = key; state.sort.dir = "asc"; }
  buildTable();
});
tableBody.addEventListener("click", e=>{
  const btn = e.target.closest("button[data-edit]");
  if(!btn) return;
  const id = btn.dataset.edit;
  openLeadModal(id);
});

// Saved reports
$("#saveReportBtn").addEventListener("click", ()=>{
  const report = {
    id: uid(),
    name: prompt("Name this report:", "My Report") || "Untitled",
    filters: {
      q: $("#searchInput").value,
      stage: $("#filterStage").value,
      temp: $("#filterTemp").value,
      program: $("#filterProgram").value,
      sort: state.sort
    }
  };
  state.reports.push(report);
  saveLS("hecms_reports", state.reports);
  populateSavedReports();
});
function populateSavedReports(){
  const sel = $("#savedReports");
  sel.innerHTML = `<option value="">Load saved...</option>` + state.reports.map(r=>`<option value="${r.id}">${r.name}</option>`).join("");
  sel.onchange = () => {
    const r = state.reports.find(x=>x.id===sel.value);
    if(!r) return;
    $("#searchInput").value = r.filters.q;
    $("#filterStage").value = r.filters.stage;
    $("#filterTemp").value = r.filters.temp;
    $("#filterProgram").value = r.filters.program;
    state.sort = r.filters.sort || state.sort;
    buildTable();
  };
}

// ---------- Lead Modal / CRUD
let editingLeadId = null;
function openLeadModal(id){
  const l = state.leads.find(x=>x.id===id);
  if(!l) return;
  editingLeadId = id;
  $("#mFirstName").value = l.firstName||"";
  $("#mLastName").value = l.lastName||"";
  $("#mEmail").value = l.email||"";
  $("#mPhone").value = l.phone||"";
  $("#mAddress").value = l.address||"";
  $("#mProgram").value = l.program||"";
  $("#mBirthdate").valueAsDate = l.birthdate? new Date(l.birthdate) : null;
  $("#mStage").value = l.stage||"Lead";
  $("#mTemp").value = l.temperature||"Warm";
  $("#mNotes").value = l.notes||"";
  toggleModal(true);
}
function toggleModal(show){ $("#leadModal").style.display = show?"flex":"none"; $("#leadModal").setAttribute("aria-hidden", show?"false":"true"); }
function toggleDrawer(show){ $("#addLeadDrawer").style.display = show?"block":"none"; $("#addLeadDrawer").setAttribute("aria-hidden", show?"false":"true"); }

$("#closeLeadModal").addEventListener("click", ()=>toggleModal(false));
$("#closeAddLead").addEventListener("click", ()=>toggleDrawer(false));
$("#saveLeadBtn").addEventListener("click", ()=>{
  const l = state.leads.find(x=>x.id===editingLeadId);
  if(!l) return;
  const prevStage = l.stage;
  l.firstName = $("#mFirstName").value.trim();
  l.lastName  = $("#mLastName").value.trim();
  l.email     = $("#mEmail").value.trim();
  l.phone     = $("#mPhone").value.trim();
  l.address   = $("#mAddress").value.trim();
  l.program   = $("#mProgram").value.trim();
  l.birthdate = $("#mBirthdate").value || "";
  l.stage     = $("#mStage").value;
  l.temperature = $("#mTemp").value;
  l.notes     = $("#mNotes").value;
  saveLS("hecms_leads", state.leads);
  toggleModal(false);
  renderDashboard(); buildTable();
  // Demo automation: email on stage change
  if(prevStage !== l.stage){
    const rule = state.email.automations.find(a=>a.type==="stage-change");
    if(rule){
      logEvent(`Automation: Sent template "${rule.template}" to ${l.email} (stage changed to ${l.stage}).`);
    }
  }
});
$("#deleteLeadBtn").addEventListener("click", ()=>{
  if(!confirm("Delete this lead?")) return;
  state.leads = state.leads.filter(x=>x.id!==editingLeadId);
  saveLS("hecms_leads", state.leads);
  toggleModal(false);
  renderDashboard(); buildTable();
});

$("#createLeadBtn").addEventListener("click", ()=>{
  const l = {
    id: uid(),
    firstName: $("#aFirstName").value.trim(),
    lastName: $("#aLastName").value.trim(),
    email: $("#aEmail").value.trim(),
    phone: $("#aPhone").value.trim(),
    address: $("#aAddress").value.trim(),
    program: $("#aProgram").value.trim(),
    birthdate: $("#aBirthdate").value || "",
    stage: "Lead",
    temperature: $("#aTemp").value,
    createdAt: fmtDate(new Date()),
    notes: ""
  };
  state.leads.push(l);
  saveLS("hecms_leads", state.leads);
  toggleDrawer(false);
  renderDashboard(); buildTable();
});

// ---------- Export / Import CSV
$("#exportDataBtn").addEventListener("click", ()=>{
  const headers = ["id","firstName","lastName","email","phone","address","program","birthdate","stage","temperature","createdAt","notes"];
  const rows = state.leads.map(l => headers.map(h => (l[h]??"").toString().replace(/"/g,'""')));
  const csv = [headers.join(","), ...rows.map(r=>r.map(v=>`"${v}"`).join(","))].join("\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="leads_export.csv"; a.click();
  URL.revokeObjectURL(url);
});
$("#importDataBtn").addEventListener("click", ()=>$("#importFile").click());
$("#importFile").addEventListener("change", (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines.shift().split(",");
    const items = lines.map(line => {
      const cols = line.match(/("([^"]|"")*"|[^,]+)/g) || [];
      const obj = {};
      headers.forEach((h,i)=>{
        let v = cols[i]||"";
        v = v.replace(/^"|"$/g,"").replace(/""/g,'"');
        obj[h] = v;
      });
      return obj;
    });
    // merge by id or email
    items.forEach(it=>{
      const existing = state.leads.find(l=>l.id===it.id || (it.email && l.email===it.email));
      if(existing){ Object.assign(existing, it); }
      else { state.leads.push({ id: it.id||uid(), ...it }); }
    });
    saveLS("hecms_leads", state.leads);
    renderDashboard(); buildTable();
    alert("Import complete.");
  };
  reader.readAsText(file);
});

// ---------- Analytics
let stagesChart, dropoffChart, attributionChart;
function renderAnalytics(){
  // Stages over time (mock by createdAt month)
  const byStageMonth = {};
  state.leads.forEach(l=>{
    const month = (l.createdAt||fmtDate(new Date())).slice(0,7);
    byStageMonth[month] = byStageMonth[month] || {month, ...Object.fromEntries(STAGES.map(s=>[s,0]))};
    byStageMonth[month][l.stage]++;
  });
  const months = Object.keys(byStageMonth).sort();
  const ctxA = $("#stagesOverTime");
  if(stagesChart) stagesChart.destroy();
  stagesChart = new Chart(ctxA, {
    type:"line",
    data:{
      labels: months,
      datasets: STAGES.map(s => ({
        label:s,
        data: months.map(m=>byStageMonth[m]?.[s]||0)
      }))
    },
    options:{responsive:true}
  });

  // Dropoff Rates: compute % that did not progress to next stage (rough proxy)
  const stageCounts = STAGES.map(s => state.leads.filter(l=>l.stage===s).length);
  const dropRates = stageCounts.map((count, i)=>{
    if(i===stageCounts.length-1) return 0;
    const next = stageCounts[i+1] || 0;
    const denom = count || 1;
    return Math.max(0, Math.round((1 - (next/denom))*100));
  });
  const ctxB = $("#dropoffChart");
  if(dropoffChart) dropoffChart.destroy();
  dropoffChart = new Chart(ctxB, {
    type:"bar",
    data:{ labels: STAGES, datasets:[{label:"Dropoff % (approx)", data:dropRates}] },
    options:{responsive:true, plugins:{legend:{display:false}}}
  });

  // Attribution (mock)
  const sources = ["paid_social","paid_search","organic","direct","referral"];
  const sourceCounts = [18, 22, 14, 9, 6];
  const ctxC = $("#attributionChart");
  if(attributionChart) attributionChart.destroy();
  attributionChart = new Chart(ctxC, {
    type:"pie",
    data:{ labels:sources, datasets:[{data:sourceCounts}] },
    options:{responsive:true}
  });
}

// ---------- Forms
function renderForms(){
  // clear canvas
  $("#formCanvas").innerHTML = `<div class="muted">Click fields to add them here</div>`;
  // list
  const list = $("#formsList");
  list.innerHTML = state.forms.map(f=>`
    <div class="row" style="justify-content:space-between">
      <div><strong>${f.name}</strong> • ${f.fields.map(x=>x.label).join(", ")}</div>
      <div class="row">
        <button class="btn sm" data-preview="${f.id}">Preview</button>
        <button class="btn sm secondary" data-delete-form="${f.id}">Delete</button>
      </div>
    </div>
  `).join("") || `<div class="muted">No forms saved yet.</div>`;
  list.onclick = (e)=>{
    const p = e.target.closest("button[data-preview]");
    const d = e.target.closest("button[data-delete-form]");
    if(p){
      const f = state.forms.find(x=>x.id===p.dataset.preview);
      if(f) generateEmbed(f);
    }else if(d){
      state.forms = state.forms.filter(x=>x.id!==d.dataset.deleteForm);
      saveLS("hecms_forms", state.forms);
      renderForms();
    }
  };
}
function addFieldToCanvas(type){
  const map = {
    firstName: {label:"First Name", html:`<input name="firstName" placeholder="First Name" required>`},
    lastName:  {label:"Last Name",  html:`<input name="lastName" placeholder="Last Name" required>`},
    email:     {label:"Email",      html:`<input type="email" name="email" placeholder="Email" required>`},
    phone:     {label:"Phone",      html:`<input name="phone" placeholder="Phone">`},
    address:   {label:"Home Address", html:`<input name="address" placeholder="Home Address">`},
    program:   {label:"Program of Interest", html:`<select name="program"><option value="">Select a Program</option>${PROGRAMS.map(p=>`<option>${p}</option>`).join("")}</select>`},
    birthdate: {label:"Birth Date", html:`<input type="date" name="birthdate">`},
    consent:   {label:"SMS/Email Consent", html:`<label><input type="checkbox" name="consent"> I agree to receive communications.</label>`},
    custom:    {label:"Custom Field", html:`<input name="custom_${uid()}" placeholder="Custom Field">`},
  };
  const def = map[type];
  if(!def) return;
  if($("#formCanvas").firstElementChild?.classList.contains("muted")) $("#formCanvas").innerHTML = "";
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<label style="min-width:160px">${def.label}</label>${def.html}`;
  row.dataset.label = def.label;
  $("#formCanvas").appendChild(row);
  updateEmbedPreview();
}
$$(".chip").forEach(ch => ch.addEventListener("click", ()=>addFieldToCanvas(ch.dataset.field)));
$("#createFormBtn").addEventListener("click", ()=>{
  const name = $("#formName").value.trim() || "Untitled Form";
  const fields = [...$("#formCanvas").children].map(row => ({
    label: row.dataset.label,
    html: row.querySelector("input,select,label").outerHTML
  }));
  const form = { id: uid(), name, fields };
  state.forms.push(form);
  saveLS("hecms_forms", state.forms);
  generateEmbed(form);
  renderForms();
});
function updateEmbedPreview(){
  const inner = [...$("#formCanvas").children].map(c=>c.innerHTML).join("");
  const formHtml = `<form action="https://example.edu/cms/lead" method="POST" onsubmit="alert('Demo submit. Connect backend to save lead.'); return false;">
    ${inner}
    <button type="submit" class="btn">Submit</button>
  </form>`;
  $("#formPreview").innerHTML = formHtml;
}
function generateEmbed(form){
  const inner = form.fields.map(f=>`<div class="row"><label style="min-width:160px">${f.label}</label>${f.html}</div>`).join("\n");
  const code = `<!-- Paste this form into your website -->\n<div id="hecms-form-${form.id}">\n<form action="https://example.edu/cms/lead" method="POST">\n${inner}\n<button type="submit">Submit</button>\n</form>\n</div>`;
  $("#embedCode").value = code;
  $("#formPreview").innerHTML = `<div class="muted">Preview of: <strong>${form.name}</strong></div>` + code.replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ---------- SMS (mock)
function renderSMS(){
  const list = $("#smsThreads");
  if(state.sms.threads.length===0){
    // seed demo threads from leads
    state.sms.threads = state.leads.slice(0,5).map(l=>({
      id: uid(), leadId: l.id, name: `${l.firstName} ${l.lastName}`, phone: l.phone,
      messages:[
        {who:"them", text:"Hi, is the program fully online?", at:new Date(Date.now()-3600e3).toISOString()},
        {who:"you", text:"Hi! Yes, it's 100% online with flexible pacing.", at:new Date(Date.now()-3500e3).toISOString()}
      ]
    }));
    saveLS("hecms_sms", state.sms);
  }
  list.innerHTML = state.sms.threads.map(t=>`
    <div class="thread ${state.sms.active===t.id?'active':''}" data-id="${t.id}">
      <div><strong>${t.name}</strong></div>
      <div class="muted">${t.phone}</div>
    </div>
  `).join("");
  list.onclick = (e)=>{
    const item = e.target.closest(".thread"); if(!item) return;
    state.sms.active = item.dataset.id; saveLS("hecms_sms", state.sms); renderSMS();
  };
  // conversation
  const active = state.sms.threads.find(t=>t.id===state.sms.active) || state.sms.threads[0];
  if(active) state.sms.active = active.id;
  const convo = $("#smsConversation");
  convo.innerHTML = active? active.messages.map(m=>`<div class="msg ${m.who==='you'?'you':'them'}">${m.text}</div>`).join("") : `<div class="muted">Select a thread</div>`;
  $("#smsSendBtn").onclick = ()=>{
    const val = $("#smsInput").value.trim(); if(!val || !active) return;
    active.messages.push({who:"you", text:val, at:new Date().toISOString()});
    saveLS("hecms_sms", state.sms);
    $("#smsInput").value="";
    renderSMS();
  };
  $("#smsSettingsBtn").onclick = ()=> alert("Connect your SMS provider here (Twilio, Sinch, etc.). Demo only.");
}

// ---------- Email (mock + automations)
function renderEmail(){
  const box = $("#emailTemplates");
  const items = state.email.templates;
  box.innerHTML = items.map(t=>`
    <div class="row" style="justify-content:space-between">
      <div><strong>${t.subject}</strong></div>
      <button class="btn sm secondary" data-del="${t.id}">Delete</button>
    </div>
  `).join("") || `<div class="muted">No templates saved.</div>`;
  box.onclick = (e)=>{
    const d = e.target.closest("button[data-del]");
    if(d){
      state.email.templates = state.email.templates.filter(x=>x.id!==d.dataset.del);
      saveLS("hecms_email", state.email); renderEmail();
    }
  };
}
$("#emailSaveTemplate").addEventListener("click", ()=>{
  const subject = $("#emailSubject").value.trim() || "Untitled";
  const body = $("#emailBody").value.trim() || "";
  state.email.templates.push({id:uid(), subject, body});
  saveLS("hecms_email", state.email);
  renderEmail();
});
$("#saveEmailAutomation").addEventListener("click", ()=>{
  const type = $("#emailAutomationRule").value;
  const template = $("#emailAutomationTemplate").value.trim();
  if(!type || !template) return alert("Select a rule and specify a template name.");
  const existing = state.email.automations.find(a=>a.type===type);
  if(existing) existing.template = template;
  else state.email.automations.push({type, template});
  saveLS("hecms_email", state.email);
  alert("Automation saved.");
});

// ---------- Profile
function renderProfile(){
  $("#profileName").value = state.profile.name || "";
  $("#profileEmail").value = state.profile.email || "";
  $("#profilePrograms").value = state.profile.programs || "";
  $("#notifEmail").checked = !!state.profile.notifEmail;
  $("#notifSMS").checked = !!state.profile.notifSMS;
  $("#profileSignature").value = state.profile.signature || "";
}
$("#saveProfile").addEventListener("click", ()=>{
  state.profile = {
    name: $("#profileName").value.trim(),
    email: $("#profileEmail").value.trim(),
    programs: $("#profilePrograms").value.trim(),
    notifEmail: $("#notifEmail").checked,
    notifSMS: $("#notifSMS").checked,
    signature: $("#profileSignature").value
  };
  saveLS("hecms_profile", state.profile);
  alert("Profile saved.");
});

// ---------- Tracking
function renderTracking(){
  const pixel = `<!-- Higher-Ed CMS Tracking Pixel (Demo) -->
<script>
(function(){
  function getParam(name){ const m = new URLSearchParams(location.search).get(name); return m || ""; }
  function setCookie(n,v){ document.cookie = n+"="+encodeURIComponent(v)+";path=/;max-age="+60*60*24*365; }
  var src = getParam("utm_source") || (document.referrer? "ref_"+new URL(document.referrer).hostname : "direct");
  var med = getParam("utm_medium") || "unknown";
  var cam = getParam("utm_campaign") || "unknown";
  setCookie("first_source", src); setCookie("first_medium", med); setCookie("first_campaign", cam);
  window.hecms_track = function(eventName, payload){
    console.log("HECMS Event", eventName, payload);
    // TODO: POST to your backend endpoint
  };
  // Example auto-fire
  window.hecms_track("page_view", {path: location.pathname, ts: Date.now()});
})();
</script>`;
  $("#pixelCode").value = pixel;
}
$("#copyPixel").addEventListener("click", ()=>{
  navigator.clipboard.writeText($("#pixelCode").value);
  alert("Pixel code copied.");
});
$("#fireTestEvent").addEventListener("click", ()=>{
  const name = $("#testEventName").value.trim() || "lead_submit";
  const payload = { ts: Date.now(), sample:true };
  logEvent(`Fired ${name} with payload ${JSON.stringify(payload)}`);
});

function logEvent(line){
  state.events.push({line, at: new Date().toISOString()});
  saveLS("hecms_events", state.events);
  const box = $("#eventLog");
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleString()} — ${line}`;
  box.prepend(row);
}

// ---------- Add Lead Drawer defaults
// none

// ---------- Table initial render
renderDashboard();
renderReports();
renderAnalytics();
renderForms();
renderSMS();
renderEmail();
renderProfile();
renderTracking();

