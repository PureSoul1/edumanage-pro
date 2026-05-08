'use strict';
// ═══════════════════════════════════════════════════════
// EDUMANAGE PRO v8 — MERGED EDITION
// Supabase Backend + All Firebase Features
// Roles: admin | teacher (class-filtered) | viewer (read-only)
// ═══════════════════════════════════════════════════════

let sb = null;
function initSupabase() {
  if (!window.ENV?.SUPABASE_URL || !window.ENV?.SUPABASE_ANON_KEY) {
    document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif"><div style="text-align:center;padding:40px"><h2>⚙️ Setup Required</h2><p style="margin-top:12px;color:#666">Fill your Supabase keys in <b>env.js</b> and reload.</p></div></div>`;
    return false;
  }
  sb = window.supabase.createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);
  return true;
}

// ══ FEE COMPONENTS ══
const FEE_COMPONENTS = [
  { key:'tuition',     label:'Tuition Fee',      alwaysOn:true  },
  { key:'conveyance',  label:'Conveyance',        alwaysOn:false },
  { key:'computer',    label:'Computer Lab',      alwaysOn:false },
  { key:'science',     label:'Science Lab',       alwaysOn:false },
  { key:'sports',      label:'Sports Fee',        alwaysOn:false },
  { key:'library',     label:'Library Fee',       alwaysOn:false },
  { key:'exam',        label:'Exam Fee',          alwaysOn:false },
  { key:'development', label:'Development Fund',  alwaysOn:false },
  { key:'activity',    label:'Activity Fee',      alwaysOn:false },
];

const GRADE_MAP = pct => {
  if (pct >= 90) return { g:'A+', c:'#059669' };
  if (pct >= 75) return { g:'A',  c:'#10b981' };
  if (pct >= 60) return { g:'B+', c:'#2563eb' };
  if (pct >= 50) return { g:'B',  c:'#7c3aed' };
  if (pct >= 33) return { g:'C',  c:'#d97706' };
  return { g:'F', c:'#dc2626' };
};

// ══ GLOBAL STATE ══
const S = {
  user: null, role: 'viewer', schoolId: '',
  assignedClasses: null,
  students: [], fees: [], exams: [], alerts: [],
  attendance: {}, results: {}, timetables: {},
  feeStructure: {}, members: [],
  settings: { schoolName:'', academicYear:'2024-25', phone:'', address:'', board:'CBSE' },
  currentSection: 'dashboard',
  examTab: 'schedule',
  tempAtt: {}, _voiceActive: false,
};

let currentFeeBreakdown = {};

// ══ UTILITIES ══
const U = {
  el: id => document.getElementById(id),
  today: () => new Date().toISOString().split('T')[0],
  month: () => new Date().toISOString().slice(0,7),
  id: () => 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
  esc: s => s == null ? '' : String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c)),
  escapeHTML: s => U.esc(s),
  fmtCurrency: n => '₹' + Number(n||0).toLocaleString('en-IN'),
  fmtDate: d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d; } },
  fmtMonth: m => { if (!m) return '—'; try { const [y,mo] = m.split('-'); return new Date(y,mo-1).toLocaleDateString('en-IN',{month:'long',year:'numeric'}); } catch { return m; } },
  avatar: name => { const w = String(name||'').trim().split(' '); return w.length>=2 ? (w[0][0]+w[1][0]).toUpperCase() : String(name||'?').slice(0,2).toUpperCase(); },
  isPhone: p => /^\d{10}$/.test(p.replace(/\s/g,'')),
  canAccessClass: cls => {
    if (S.role==='admin'||S.role==='viewer') return true;
    if (!S.assignedClasses?.length) return false;
    return S.assignedClasses.includes(String(cls));
  },
  classOptions: () => {
    const all = Array.from({length:12},(_,i)=>String(i+1));
    const allowed = (S.role==='teacher'&&S.assignedClasses?.length) ? S.assignedClasses.map(String) : all;
    return allowed.map(c=>`<option value="${c}">Class ${c}</option>`).join('');
  },
  isReadOnly: () => S.role==='viewer',
};

// ══ TOAST ══
const Toast = {
  icons:{success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'},
  show(title,msg='',type='info',duration=4000){
    const c=U.el('toastContainer'); if(!c) return;
    const t=document.createElement('div');
    t.className=`toast toast-${type}`;
    t.innerHTML=`<div class="toast-icon">${this.icons[type]||'📢'}</div><div class="toast-content"><div class="toast-title">${U.esc(title)}</div>${msg?`<div class="toast-msg">${U.esc(msg)}</div>`:''}</div><button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
    c.appendChild(t);
    setTimeout(()=>{t.style.animation='toastOut .3s ease forwards';setTimeout(()=>t.remove(),300);},duration);
  },
  success:(t,m)=>Toast.show(t,m,'success'),
  error:(t,m)=>Toast.show(t,m,'error',6000),
  warning:(t,m)=>Toast.show(t,m,'warning'),
  info:(t,m)=>Toast.show(t,m,'info'),
};

// ══ CONFIRM ══
let _confirmResolve = null;
function showConfirm(title,msg,icon='⚠️',danger=true){
  return new Promise(res=>{
    _confirmResolve=res;
    U.el('confirmIcon').textContent=icon;
    U.el('confirmTitle').textContent=title;
    U.el('confirmMsg').textContent=msg;
    const ok=U.el('confirmOkBtn');
    if(ok) ok.className=`btn ${danger?'btn-danger':'btn-primary'} w-full`;
    U.el('confirmOverlay').style.display='flex';
  });
}
function resolveConfirm(result){U.el('confirmOverlay').style.display='none';if(_confirmResolve){_confirmResolve(result);_confirmResolve=null;}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.add('hidden'));resolveConfirm(false);}});

// ══ THEME ══
function toggleTheme(){
  const html=document.documentElement;
  html.dataset.theme=html.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem('em_theme',html.dataset.theme);
}

// ══ SIDEBAR ══
function toggleSidebar(){U.el('sidebar').classList.toggle('show');U.el('sidebarOverlay').classList.toggle('show');}
function closeSidebar(){U.el('sidebar')?.classList.remove('show');U.el('sidebarOverlay')?.classList.remove('show');}
function openModal(id){U.el(id)?.classList.remove('hidden');}
function closeModal(id){U.el(id)?.classList.add('hidden');}

// ══ AUTH PANEL ══
function toggleAuthPanel(type){
  U.el('loginFormPanel').style.display=type==='signup'?'none':'block';
  U.el('signupFormPanel').style.display=type==='signup'?'block':'none';
  const e=U.el('loginError');if(e){e.textContent='';e.style.display='none';}
}

// ══ NAVIGATION ══
const TITLES={dashboard:'Dashboard',students:'Student Management',fees:'Fee Management',feestructure:'Fee Structure',attendance:'Attendance Tracking',exams:'Exams & Results',timetable:'Smart Timetable',whatsapp:'Parent Notifications',reports:'Reports & Analytics',team:'Team Management',ai:'AI Assistant',settings:'Settings'};

function showSection(id){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const nav=document.querySelector(`[data-section="${id}"]`);
  if(nav) nav.classList.add('active');
  U.el('pageTitle').textContent=TITLES[id]||id;
  S.currentSection=id;
  closeSidebar();
  renderSection(id);
}

function renderSection(id){
  const area=U.el('contentArea');
  const fns={
    dashboard:  renderDashboard,
    students:   renderStudentsSection,
    fees:       renderFeesSection,
    feestructure: renderFeeStructureSection,
    attendance: renderAttendanceSection,
    exams:      renderExamsSection,
    timetable:  renderTimetableSection,
    whatsapp:   renderWhatsappSection,
    reports:    renderReportsSection,
    team:       renderTeamSection,
    ai:         renderAISection,
    settings:   renderSettingsSection,
  };
  if(fns[id]) fns[id]();
}

// ══════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════
async function signInWithGoogle(){
  try{
    const{error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
    if(error) throw error;
  }catch(err){showLoginError(err.message);}
}

async function handleLogin(e){
  e.preventDefault();
  const btn=U.el('loginBtn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Signing in...';
  hideLoginError();
  try{
    const{data,error}=await sb.auth.signInWithPassword({email:U.el('loginEmail').value.trim(),password:U.el('loginPassword').value});
    if(error) throw error;
    S.user=data.user;
    await initApp();
  }catch(err){showLoginError(err.message);}
  finally{btn.disabled=false;btn.textContent='Sign In';}
}

async function handleSignup(e){
  e.preventDefault();
  const btn=U.el('signupBtn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Creating...';
  hideLoginError();
  const name=U.el('signupName').value.trim();
  const school=U.el('signupSchool').value.trim();
  const email=U.el('signupEmail').value.trim();
  const password=U.el('signupPassword').value;
  try{
    const{data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name}}});
    if(error) throw error;
    if(data.user&&data.session){
      await _createSchool(data.user.id,school);
      S.user=data.user;
      await initApp();
    }else{
      Toast.success('Account Created!','Check your email to verify, then Sign In.');
      toggleAuthPanel('login');
    }
  }catch(err){showLoginError(err.message);}
  finally{btn.disabled=false;btn.textContent='Create Admin Account';}
}

function showLoginError(msg){const e=U.el('loginError');if(e){e.textContent='⚠️ '+msg;e.style.display='block';}}
function hideLoginError(){const e=U.el('loginError');if(e){e.textContent='';e.style.display='none';}}

async function handleLogout(){
  const ok=await showConfirm('Sign Out','Are you sure you want to sign out?','👋',false);
  if(!ok) return;
  await sb.auth.signOut();
  location.reload();
}

// ══ SCHOOL CREATION ══
async function _createSchool(userId,schoolName){
  // Disable RLS issue workaround: insert directly
  const{data:school,error:schErr}=await sb.from('schools').insert({name:schoolName,owner_id:userId,academic_year:'2024-25',board:'CBSE'}).select().single();
  if(schErr) throw schErr;
  const{error:memErr}=await sb.from('school_members').insert({school_id:school.id,user_id:userId,role:'admin',accepted_at:new Date().toISOString(),display_name:'',assigned_classes:null});
  if(memErr) throw memErr;
  // Seed fee structures
  const inserts=[];
  Array.from({length:12},(_,i)=>String(i+1)).forEach(cls=>{
    FEE_COMPONENTS.forEach(comp=>{
      inserts.push({school_id:school.id,class_name:cls,component_key:comp.key,component_label:comp.label,amount:comp.key==='tuition'?3000:comp.key==='conveyance'?0:100,enabled:comp.alwaysOn||comp.key==='tuition',always_on:comp.alwaysOn});
    });
  });
  await sb.from('fee_structures').insert(inserts);
  return school;
}

// ══ SESSION INIT ══
async function initAuth(){
  const{data:{session}}=await sb.auth.getSession();
  if(session){S.user=session.user;await initApp();}
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='SIGNED_IN'&&session&&!S.schoolId){S.user=session.user;await initApp();}
    else if(event==='SIGNED_OUT'){U.el('loginPage').style.display='flex';U.el('appPage').classList.remove('active');}
  });
}

async function initApp(){
  try{
    const{data:memberships,error}=await sb.from('school_members').select('school_id,role,assigned_classes,display_name').eq('user_id',S.user.id).order('invited_at',{ascending:false});
    if(error) throw error;
    if(!memberships?.length){showSchoolSetup();return;}
    const m=memberships[0];
    S.schoolId=m.school_id;S.role=m.role;
    S.assignedClasses=m.assigned_classes?(Array.isArray(m.assigned_classes)?m.assigned_classes.map(String):JSON.parse(m.assigned_classes).map(String)):null;
    const{data:school}=await sb.from('schools').select('*').eq('id',S.schoolId).single();
    if(school) S.settings={schoolName:school.name,academicYear:school.academic_year,phone:school.phone||'',address:school.address||'',board:school.board||'CBSE'};
    const name=S.user.user_metadata?.full_name||m.display_name||S.user.email.split('@')[0];
    U.el('userName').textContent=U.esc(name);
    U.el('userAvatar').textContent=U.avatar(name);
    U.el('userRole').textContent={admin:'Administrator',teacher:'Teacher',viewer:'Viewer'}[S.role]||S.role;
    U.el('sidebarSchoolName').textContent=U.esc(S.settings.schoolName||'My School');
    const badges={admin:'<span class="badge badge-primary">👨‍💼 Admin</span>',teacher:'<span class="badge badge-success">👩‍🏫 Teacher</span>',viewer:'<span class="badge badge-gray">👁️ Viewer</span>'};
    U.el('topbarRoleBadge').innerHTML=badges[S.role]||'';
    _buildAdminNav();
    // Load all data
    await Promise.all([loadStudents(),loadFees(),loadExams(),loadAlerts()]);
    await loadFeeStructure();
    loadAttendanceLocal();
    loadTimetableLocal();
    loadResultsLocal();
    setupRealtime();
    U.el('loginPage').style.display='none';
    U.el('appPage').classList.add('active');
    showSection('dashboard');
    Toast.success('Welcome back!',U.esc(name));
  }catch(err){
    console.error('initApp:',err);
    showLoginError('Login Error: '+err.message);
  }
}

function _buildAdminNav(){
  const el=U.el('adminNavItems');
  if(!el) return;
  if(S.role==='admin'){
    el.innerHTML=`
      <div class="nav-item" data-section="team" onclick="showSection('team')">
        <div class="nav-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div>Team Management
      </div>`;
  }else{el.innerHTML='';}
  if(S.role==='teacher'&&S.assignedClasses?.length){
    const pill=document.createElement('div');
    pill.className='nav-class-pill';
    pill.innerHTML=`📚 Classes: ${S.assignedClasses.map(c=>`<b>Class ${c}</b>`).join(', ')}`;
    el.appendChild(pill);
  }
}

function showSchoolSetup(){
  U.el('loginPage').style.display='none';
  U.el('appPage').classList.add('active');
  U.el('contentArea').innerHTML=`
    <div style="max-width:480px;margin:60px auto;text-align:center">
      <div style="font-size:64px">🏫</div>
      <h2 style="margin:16px 0 8px;font-size:24px;font-weight:800">Welcome!</h2>
      <p style="color:var(--text3);margin-bottom:28px">Set up your school to get started</p>
      <div class="card"><div class="card-body">
        <div class="form-group"><label class="form-label">School Name *</label><input class="form-control" id="setupSchoolName" placeholder="e.g. Sunrise Public School"/></div>
        <div class="form-group"><label class="form-label">Academic Year</label><input class="form-control" id="setupYear" value="2024-25"/></div>
        <div class="form-group"><label class="form-label">Board</label><select class="form-control" id="setupBoard"><option>CBSE</option><option>ICSE</option><option>UP Board</option><option>MP Board</option><option>Other</option></select></div>
        <button class="btn btn-primary w-full" style="padding:13px;font-size:15px" onclick="completeSchoolSetup()">🚀 Create School & Enter Dashboard</button>
      </div></div>
    </div>`;
}

async function completeSchoolSetup(){
  const name=U.el('setupSchoolName')?.value.trim();
  if(!name){Toast.warning('School name required');return;}
  try{
    await _createSchool(S.user.id,name);
    Toast.success('School Created! 🎉');
    await initApp();
  }catch(err){Toast.error('Setup Failed',err.message);console.error(err);}
}

// ══ REALTIME ══
function setupRealtime(){
  if(!S.schoolId) return;
  sb.channel('school-'+S.schoolId)
    .on('postgres_changes',{event:'*',schema:'public',table:'students',filter:`school_id=eq.${S.schoolId}`},()=>{loadStudents();})
    .on('postgres_changes',{event:'*',schema:'public',table:'fee_payments',filter:`school_id=eq.${S.schoolId}`},()=>{loadFees();})
    .subscribe();
}

// ══════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════
async function loadStudents(){
  let q=sb.from('students').select('*').eq('school_id',S.schoolId).order('class_name').order('name');
  if(S.role==='teacher'&&S.assignedClasses?.length) q=q.in('class_name',S.assignedClasses);
  const{data,error}=await q;
  if(error){console.error('loadStudents:',error);return;}
  S.students=(data||[]).map(s=>({id:s.id,name:s.name,class:s.class_name,roll:s.roll_number,dob:s.dob,father:s.father_name,mother:s.mother_name||'',phone:s.phone,email:s.email||'',address:s.address||'',status:s.status,conveyance:s.conveyance_fee,busRoute:s.bus_route||'',createdAt:s.created_at}));
  if(S.currentSection==='students') renderStudents();
  updateDashboardStats();
}

async function loadFees(){
  const{data,error}=await sb.from('fee_payments').select('*').eq('school_id',S.schoolId).order('created_at',{ascending:false});
  if(error){console.error('loadFees:',error);return;}
  const stuIds=new Set(S.students.map(s=>s.id));
  S.fees=(data||[]).filter(f=>S.role==='admin'||stuIds.has(f.student_id)).map(f=>{
    const stu=S.students.find(s=>s.id===f.student_id);
    return{id:f.id,receipt:f.receipt_number,studentId:f.student_id,studentName:stu?.name||'Unknown',studentClass:stu?.class||'',month:f.month,totalAmount:f.total_amount,amount:f.total_amount,feeBreakdown:f.breakdown||{},mode:f.payment_mode,date:f.payment_date,status:f.status,createdAt:f.created_at};
  });
  if(S.currentSection==='fees') renderFees();
  updateDashboardStats();
}

async function loadExams(){
  let q=sb.from('exams').select('*').eq('school_id',S.schoolId).order('exam_date',{ascending:false});
  if(S.role==='teacher'&&S.assignedClasses?.length) q=q.in('class_name',S.assignedClasses);
  const{data,error}=await q;
  if(error){console.error('loadExams:',error);return;}
  S.exams=(data||[]).map(e=>({id:e.id,name:e.name,subject:e.subject,class:e.class_name,date:e.exam_date,maxMarks:e.max_marks,passMarks:e.pass_marks,duration:e.duration_minutes,type:e.exam_type,createdAt:e.created_at}));
}

async function loadAlerts(){
  const{data,error}=await sb.from('alerts').select('*').eq('school_id',S.schoolId).order('sent_at',{ascending:false});
  if(error){console.error('loadAlerts:',error);return;}
  S.alerts=(data||[]).map(a=>({id:a.id,type:a.alert_type,message:a.message,recipient:a.recipient_type,count:a.recipient_count,sentAt:a.sent_at}));
}

async function loadFeeStructure(){
  const{data,error}=await sb.from('fee_structures').select('*').eq('school_id',S.schoolId);
  if(error){console.error('loadFeeStructure:',error);return;}
  S.feeStructure={};
  (data||[]).forEach(r=>{
    if(!S.feeStructure[r.class_name]) S.feeStructure[r.class_name]={};
    S.feeStructure[r.class_name][r.component_key]={label:r.component_label,amount:r.amount,enabled:r.enabled,alwaysOn:r.always_on};
  });
}

async function loadMembers(){
  if(S.role!=='admin') return;
  const{data,error}=await sb.from('school_members').select('*').eq('school_id',S.schoolId);
  if(error){console.error('loadMembers:',error);return;}
  S.members=data||[];
}

// Attendance, Results, Timetables stored in Supabase + localStorage cache
function loadAttendanceLocal(){S.attendance=JSON.parse(localStorage.getItem('em_att_'+S.schoolId)||'{}');}
function saveAttendanceLocal(){localStorage.setItem('em_att_'+S.schoolId,JSON.stringify(S.attendance));}
function loadResultsLocal(){S.results=JSON.parse(localStorage.getItem('em_res_'+S.schoolId)||'{}');}
function saveResultsLocal(){localStorage.setItem('em_res_'+S.schoolId,JSON.stringify(S.results));}
function loadTimetableLocal(){S.timetables=JSON.parse(localStorage.getItem('em_tt_'+S.schoolId)||'{}');}
function saveTimetableLocal(){localStorage.setItem('em_tt_'+S.schoolId,JSON.stringify(S.timetables));}

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
async function renderDashboard(){
  const teacherNote=S.role==='teacher'&&S.assignedClasses?.length?`<div style="display:inline-block;margin-top:8px;padding:4px 14px;border-radius:20px;background:rgba(255,255,255,.18);font-size:13px;font-weight:500">📚 Your Classes: ${S.assignedClasses.map(c=>`Class ${c}`).join(', ')}</div>`:'';
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="welcome-banner">
        <div style="position:relative;z-index:1">
          <div style="font-size:22px;font-weight:800">Namaskar, ${U.esc(S.user?.user_metadata?.full_name||'User')}! 🙏</div>
          <div style="font-size:13px;opacity:.8;margin-top:3px">Today — ${U.fmtDate(U.today())} | ${U.esc(S.settings.schoolName)}</div>
          ${teacherNote}
          <div class="banner-chips" style="margin-top:18px">
            <div class="banner-chip"><div class="chip-label">Total Students</div><div class="chip-value" id="chipStudents">—</div></div>
            <div class="banner-chip"><div class="chip-label">Present Today</div><div class="chip-value" id="chipPresent">—</div></div>
            <div class="banner-chip"><div class="chip-label">Fee Collected</div><div class="chip-value" id="chipCollected">—</div></div>
            <div class="banner-chip"><div class="chip-label">Pending Fees</div><div class="chip-value" id="chipPending">—</div></div>
          </div>
        </div>
      </div>
      <div class="grid-4 mb-6">
        <div class="stat-card"><div class="stat-icon" style="background:var(--primary-light);color:var(--primary)"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div><div class="stat-value" id="statStudents">0</div><div class="stat-label">Total Students</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--success-bg);color:var(--success)"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div><div class="stat-value" id="statPresent">—</div><div class="stat-label">Present Today</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--danger-bg);color:var(--danger)"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div><div class="stat-value" id="statPending" style="color:var(--danger)">₹0</div><div class="stat-label">Pending Fees</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--warning-bg);color:var(--warning)"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div><div class="stat-value" id="statAlerts">${S.alerts.length}</div><div class="stat-label">Alerts Sent</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <div class="card"><div class="card-header"><span class="card-title">⚡ Quick Actions</span></div><div class="card-body">
          <div class="quick-grid">
            <div class="quick-card" onclick="${!U.isReadOnly()?'openStudentModal()':'void(0)'}"><div class="quick-icon">👨‍🎓</div><div class="quick-title">Add Student</div></div>
            <div class="quick-card" onclick="${!U.isReadOnly()?'openFeeModal()':'void(0)'}"><div class="quick-icon">💰</div><div class="quick-title">Record Fee</div></div>
            <div class="quick-card" onclick="showSection('attendance')"><div class="quick-icon">✅</div><div class="quick-title">Attendance</div></div>
            <div class="quick-card" onclick="showSection('whatsapp')"><div class="quick-icon">📲</div><div class="quick-title">Send Alert</div></div>
            <div class="quick-card" onclick="showSection('exams')"><div class="quick-icon">📝</div><div class="quick-title">Exams</div></div>
            <div class="quick-card" onclick="showSection('ai')"><div class="quick-icon">✨</div><div class="quick-title">AI Assistant</div></div>
          </div>
        </div></div>
        <div class="card"><div class="card-header"><span class="card-title">⚠️ Fee Defaulters</span><button class="btn btn-sm btn-ghost" onclick="showSection('fees')">View All</button></div><div class="card-body" id="defaultersList" style="max-height:220px;overflow-y:auto"></div></div>
      </div>
    </div>`;
  updateDashboardStats();
  renderDefaulters();
}

function updateDashboardStats(){
  const active=S.students.filter(s=>s.status==='active').length;
  const paid=S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const pending=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const today=U.today();
  const todayAtt=Object.entries(S.attendance).filter(([k])=>k.startsWith(today+'_'));
  let present=0,total=0;
  todayAtt.forEach(([,v])=>Object.values(v).forEach(st=>{total++;if(st==='P')present++;}));
  const set=(id,v)=>{const el=U.el(id);if(el)el.textContent=v;};
  set('statStudents',active);set('chipStudents',active);
  set('statPresent',total>0?`${present}/${total}`:'—');set('chipPresent',total>0?`${present}/${total}`:'—');
  set('statPending',U.fmtCurrency(pending));set('chipPending',U.fmtCurrency(pending));
  set('chipCollected',U.fmtCurrency(paid));
}

function renderDefaulters(){
  const el=U.el('defaultersList');if(!el)return;
  const defIds=[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))];
  if(!defIds.length){el.innerHTML='<div class="empty-state" style="padding:20px"><div class="empty-icon" style="font-size:28px">🎉</div><div class="empty-desc">No defaulters!</div></div>';return;}
  el.innerHTML=defIds.slice(0,8).map(id=>{
    const s=S.students.find(x=>x.id===id);if(!s)return'';
    const amt=S.fees.filter(f=>f.studentId===id&&f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><div><div style="font-weight:600;font-size:13px">${U.esc(s.name)}</div><div style="font-size:11px;color:var(--text3)">Class ${s.class}</div></div><span class="badge badge-danger">${U.fmtCurrency(amt)}</span></div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// STUDENTS
// ══════════════════════════════════════════════════════
function renderStudentsSection(){
  const canWrite=!U.isReadOnly();
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Student Management</div><div style="font-size:13px;color:var(--text3)">${S.students.length} students</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="exportStudentsExcel()">📊 Excel</button>
          ${canWrite?`<button class="btn btn-primary" onclick="openStudentModal()">+ Add Student</button>`:`<span class="badge badge-gray">👁️ View Only</span>`}
        </div>
      </div>
      <div class="card mb-4"><div class="card-body-sm" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <div class="search-wrap" style="position:relative;flex:1;min-width:200px"><svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:15px;height:15px;stroke:var(--text3);fill:none;stroke-width:2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input class="form-control" id="stuSearch" placeholder="Search name, roll, phone..." style="padding-left:32px" oninput="renderStudents()"/></div>
        <select class="form-control" id="classFilter" onchange="renderStudents()" style="width:140px"><option value="">All Classes</option>${U.classOptions()}</select>
        <select class="form-control" id="statusFilter" onchange="renderStudents()" style="width:130px"><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <span style="font-size:12px;color:var(--text3)" id="stuCountLabel"></span>
      </div></div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Student</th><th>Class</th><th>Roll</th><th>Father</th><th>Phone</th><th>Conveyance</th><th>Status</th>${canWrite?'<th>Actions</th>':''}</tr></thead>
        <tbody id="studentsBody"></tbody>
      </table></div></div>
    </div>`;
  renderStudents();
}

function renderStudents(){
  const q=(U.el('stuSearch')?.value||'').toLowerCase();
  const cls=U.el('classFilter')?.value||'';
  const st=U.el('statusFilter')?.value||'';
  const list=S.students.filter(s=>(!q||(s.name||'').toLowerCase().includes(q)||(s.roll||'').toLowerCase().includes(q)||(s.phone||'').includes(q))&&(!cls||String(s.class)===cls)&&(!st||s.status===st));
  const lbl=U.el('stuCountLabel');if(lbl) lbl.textContent=`${list.length} / ${S.students.length}`;
  const canWrite=!U.isReadOnly();
  const tbody=U.el('studentsBody');if(!tbody)return;
  if(!list.length){tbody.innerHTML=`<tr><td colspan="${canWrite?9:8}"><div class="empty-state"><div class="empty-icon">👨‍🎓</div><div class="empty-title">No students found</div></div></td></tr>`;return;}
  tbody.innerHTML=list.map((s,i)=>`<tr>
    <td style="color:var(--text3);font-size:12px;font-weight:600">${i+1}</td>
    <td><div style="display:flex;align-items:center;gap:8px"><div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:800;flex-shrink:0">${U.esc(U.avatar(s.name))}</div><div><div class="td-primary" style="cursor:pointer" onclick="viewStudent('${s.id}')">${U.esc(s.name)}</div><div style="font-size:11px;color:var(--text3)">${U.esc(s.email||'')}</div></div></div></td>
    <td><span class="badge badge-primary">Class ${U.esc(s.class)}</span></td>
    <td class="td-mono">${U.esc(s.roll||'—')}</td>
    <td>${U.esc(s.father||'—')}</td>
    <td>${U.esc(s.phone)}</td>
    <td>${Number(s.conveyance||0)>0?U.fmtCurrency(s.conveyance)+'<span style="font-size:10px;color:var(--text3)">/mo</span>':'<span style="color:var(--text3)">—</span>'}</td>
    <td><span class="badge ${s.status==='active'?'badge-success':'badge-warning'}">${s.status}</span></td>
    ${canWrite?`<td><div style="display:flex;gap:4px">
      <button class="btn-icon" onclick="openStudentModal('${s.id}')" title="Edit" style="width:30px;height:30px"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg></button>
      ${S.role==='admin'?`<button class="btn-icon btn-icon-danger" onclick="deleteStudent('${s.id}','${U.esc(s.name)}')" title="Delete" style="width:30px;height:30px"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>`:''}
    </div></td>`:''}
  </tr>`).join('');
}

function populateClassSelects(){
  const opts=U.classOptions();
  ['stuClass','examClass','attClass','waClass'].forEach(id=>{
    const el=U.el(id);if(!el)return;
    const first=id==='stuClass'?'<option value="">Select Class</option>':id==='attClass'||id==='waClass'?'<option value="">Select Class...</option>':'<option value="">All Classes</option>';
    el.innerHTML=first+opts;
  });
}

function openStudentModal(id=null){
  if(U.isReadOnly()){Toast.error('Access Denied','Viewers cannot modify records');return;}
  ['stuName','stuRoll','stuDob','stuFather','stuMother','stuPhone','stuEmail','stuAddress','stuConveyance','stuBusRoute'].forEach(f=>{const el=U.el(f);if(el)el.value='';});
  if(U.el('stuStatus')) U.el('stuStatus').value='active';
  U.el('editStuId').value='';
  populateClassSelects();
  if(id){
    const s=S.students.find(x=>x.id===id);if(!s)return;
    U.el('editStuId').value=s.id;
    U.el('stuName').value=s.name;U.el('stuClass').value=s.class;
    U.el('stuRoll').value=s.roll||'';U.el('stuDob').value=s.dob||'';
    U.el('stuFather').value=s.father||'';U.el('stuMother').value=s.mother||'';
    U.el('stuPhone').value=s.phone;U.el('stuEmail').value=s.email||'';
    U.el('stuAddress').value=s.address||'';U.el('stuStatus').value=s.status;
    U.el('stuConveyance').value=s.conveyance||0;U.el('stuBusRoute').value=s.busRoute||'';
    U.el('studentModalTitle').textContent='Edit Student';
  }else{U.el('studentModalTitle').textContent='Add New Student';}
  openModal('studentModal');
}

async function saveStudent(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const name=U.el('stuName').value.trim();
  const cls=U.el('stuClass').value;
  const phone=U.el('stuPhone').value.trim();
  if(!name){Toast.warning('Name is required');return;}
  if(!cls){Toast.warning('Please select a class');return;}
  if(!phone||!U.isPhone(phone)){Toast.warning('Enter valid 10-digit phone number');return;}
  if(S.role==='teacher'&&!U.canAccessClass(cls)){Toast.error('Access Denied',`Not assigned to Class ${cls}`);return;}
  const btn=U.el('saveStuBtn');btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';
  const payload={name,class_name:cls,roll_number:U.el('stuRoll').value.trim(),dob:U.el('stuDob').value||null,father_name:U.el('stuFather').value.trim(),mother_name:U.el('stuMother').value.trim(),phone,email:U.el('stuEmail').value.trim(),address:U.el('stuAddress').value.trim(),status:U.el('stuStatus').value,conveyance_fee:Number(U.el('stuConveyance').value||0),bus_route:U.el('stuBusRoute').value.trim(),school_id:S.schoolId};
  try{
    const id=U.el('editStuId').value;
    if(id){const{error}=await sb.from('students').update(payload).eq('id',id).eq('school_id',S.schoolId);if(error)throw error;Toast.success('Student Updated ✅',name);}
    else{const{error}=await sb.from('students').insert(payload);if(error)throw error;Toast.success('Student Added ✅',name);}
    closeModal('studentModal');await loadStudents();
  }catch(err){Toast.error('Save Failed',err.message);console.error(err);}
  finally{btn.disabled=false;btn.innerHTML='💾 Save Student';}
}

async function deleteStudent(id,name){
  if(S.role!=='admin'){Toast.error('Admin Only');return;}
  const ok=await showConfirm('Delete Student',`Delete "${name}"? All fees & attendance will also be removed.`,'🗑️');
  if(!ok)return;
  try{
    const{error}=await sb.from('students').delete().eq('id',id).eq('school_id',S.schoolId);
    if(error)throw error;
    Toast.warning('Deleted',name+' removed');
    await loadStudents();await loadFees();
  }catch(err){Toast.error('Delete Failed',err.message);}
}

function viewStudent(id){
  const s=S.students.find(x=>x.id===id);if(!s)return;
  const fees=S.fees.filter(f=>f.studentId===id);
  const paid=fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const pending=fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const struct=S.feeStructure[s.class]||{};
  const monthly=Object.values(struct).filter(c=>c.enabled).reduce((t,c)=>t+Number(c.amount||0),0)+(Number(s.conveyance||0));
  U.el('viewStudentBody').innerHTML=`
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:22px;font-weight:800;margin:0 auto 12px">${U.esc(U.avatar(s.name))}</div>
      <div style="font-size:20px;font-weight:800">${U.esc(s.name)}</div>
      <div style="color:var(--text3);font-size:13px;margin-top:4px">Class ${U.esc(s.class)} ${s.roll?'· Roll '+U.esc(s.roll):''}</div>
      <span class="badge ${s.status==='active'?'badge-success':'badge-warning'} badge-lg" style="margin-top:8px">${s.status}</span>
    </div>
    <div style="background:var(--primary-light);border:1px solid var(--primary-mid);border-radius:8px;padding:12px;margin-bottom:16px;text-align:center">
      <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase">Monthly Fee</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary)">${U.fmtCurrency(monthly)}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:16px">
      ${[['👨','Father',s.father],['👩','Mother',s.mother],['📱','Phone',s.phone],['📧','Email',s.email],['🎂','DOB',U.fmtDate(s.dob)],['🚌','Bus Route',s.busRoute]].map(([ic,l,v])=>v?`<div style="background:var(--surface2);border-radius:8px;padding:10px"><div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase">${ic} ${l}</div><div style="font-weight:600;margin-top:3px">${U.esc(v)}</div></div>`:'').join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;padding:12px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--success)">${U.fmtCurrency(paid)}</div><div style="font-size:11px;color:var(--success);font-weight:600">Total Paid</div></div>
      <div style="background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:8px;padding:12px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--danger)">${U.fmtCurrency(pending)}</div><div style="font-size:11px;color:var(--danger);font-weight:600">Outstanding</div></div>
    </div>`;
  U.el('editFromView').onclick=()=>{closeModal('viewStudentModal');openStudentModal(id);};
  openModal('viewStudentModal');
}

// ══════════════════════════════════════════════════════
// FEE STRUCTURE
// ══════════════════════════════════════════════════════
function renderFeeStructureSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Fee Structure</div><div style="font-size:13px;color:var(--text3)">Define fee components per class</div></div>
        ${S.role==='admin'?`<button class="btn btn-primary" onclick="saveFeeStructure()">💾 Save All</button>`:''}
      </div>
      <div style="background:var(--primary-light);border:1px solid var(--primary-mid);border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:var(--primary)">
        ℹ️ Set fee components per class. These auto-fill when recording payments.
      </div>
      <div id="feeStructureGrid"></div>
    </div>`;
  renderFeeStructure();
}

function renderFeeStructure(){
  const grid=U.el('feeStructureGrid');if(!grid)return;
  const isAdmin=S.role==='admin';
  const classes=S.role==='teacher'&&S.assignedClasses?.length?S.assignedClasses:Array.from({length:12},(_,i)=>String(i+1));
  grid.innerHTML=classes.map(cls=>{
    const struct=S.feeStructure[cls]||{};
    const total=FEE_COMPONENTS.filter(c=>struct[c.key]?.enabled).reduce((t,c)=>t+Number(struct[c.key]?.amount||0),0);
    return `<div class="card mb-4"><div class="card-header"><span class="card-title">Class ${cls}</span><span class="badge badge-primary">Total: ${U.fmtCurrency(total)}/mo</span></div><div class="card-body">
      <div class="grid-3">${FEE_COMPONENTS.map(comp=>{
        const saved=struct[comp.key]||{};
        const enabled=saved.enabled??comp.alwaysOn;
        const amount=saved.amount||0;
        return `<div style="background:var(--surface2);border-radius:8px;padding:12px;border:1.5px solid ${enabled?'var(--primary-mid)':'var(--border)'}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label style="font-size:12px;font-weight:700;color:var(--text2)">${comp.label}</label>
            <input type="checkbox" id="fs_${cls}_${comp.key}_en" ${enabled?'checked':''} ${!isAdmin||comp.alwaysOn?'disabled':''} onchange="feeStructChanged('${cls}','${comp.key}')"/>
          </div>
          <input type="number" class="form-control" id="fs_${cls}_${comp.key}_amt" value="${amount}" min="0" placeholder="₹0" ${!isAdmin?'disabled':''} oninput="feeStructChanged('${cls}','${comp.key}')"/>
        </div>`;
      }).join('')}</div>
    </div></div>`;
  }).join('');
}

function feeStructChanged(cls,key){
  if(!S.feeStructure[cls]) S.feeStructure[cls]={};
  const en=U.el(`fs_${cls}_${key}_en`)?.checked??false;
  const amt=Number(U.el(`fs_${cls}_${key}_amt`)?.value||0);
  const comp=FEE_COMPONENTS.find(c=>c.key===key);
  S.feeStructure[cls][key]={label:comp?.label||key,amount:amt,enabled:en,alwaysOn:comp?.alwaysOn||false};
}

async function saveFeeStructure(){
  if(S.role!=='admin'){Toast.error('Admin Only');return;}
  try{
    const upserts=[];
    Object.entries(S.feeStructure).forEach(([cls,comps])=>{
      Object.entries(comps).forEach(([key,val])=>{
        upserts.push({school_id:S.schoolId,class_name:cls,component_key:key,component_label:val.label,amount:val.amount,enabled:val.enabled,always_on:val.alwaysOn});
      });
    });
    const{error}=await sb.from('fee_structures').upsert(upserts,{onConflict:'school_id,class_name,component_key'});
    if(error) throw error;
    Toast.success('Fee Structure Saved ✅');
    renderFeeStructure();
  }catch(err){Toast.error('Save Failed',err.message);}
}

// ══════════════════════════════════════════════════════
// FEES CRUD
// ══════════════════════════════════════════════════════
function renderFeesSection(){
  const canWrite=!U.isReadOnly();
  const paid=S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const pending=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const defs=[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))].length;
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Fee Management</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="exportFeesExcel()">📊 Excel</button>
          <button class="btn btn-outline btn-sm" onclick="exportFeesPDF()">📄 PDF</button>
          ${canWrite?`<button class="btn btn-primary" onclick="openFeeModal()">+ Record Payment</button>`:`<span class="badge badge-gray">👁️ View Only</span>`}
        </div>
      </div>
      <div class="grid-3 mb-6">
        <div class="stat-card"><div class="stat-value" style="color:var(--success)">${U.fmtCurrency(paid)}</div><div class="stat-label">Total Collected</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${U.fmtCurrency(pending)}</div><div class="stat-label">Outstanding</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${defs}</div><div class="stat-label">Defaulters</div></div>
      </div>
      <div class="card mb-4"><div class="card-body-sm" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <input class="form-control" id="feeSearch" placeholder="Search student..." style="max-width:240px" oninput="renderFees()"/>
        <select class="form-control" id="feeStatusFilter" onchange="renderFees()" style="width:130px"><option value="">All Status</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="partial">Partial</option></select>
        <input type="month" class="form-control" id="feeMonthFilter" onchange="renderFees()" style="width:160px"/>
      </div></div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Receipt</th><th>Student</th><th>Class</th><th>Month</th><th>Amount</th><th>Mode</th><th>Status</th></tr></thead>
        <tbody id="feesBody"></tbody>
      </table></div></div>
    </div>`;
  renderFees();
}

function renderFees(){
  const q=(U.el('feeSearch')?.value||'').toLowerCase();
  const st=U.el('feeStatusFilter')?.value||'';
  const mo=U.el('feeMonthFilter')?.value||'';
  const list=[...S.fees].filter(f=>(!q||(f.studentName||'').toLowerCase().includes(q))&&(!st||f.status===st)&&(!mo||f.month===mo)).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  const modeLabel={cash:'💵 Cash',upi:'📱 UPI',bank:'🏦 Bank',cheque:'📋 Cheque',online:'💳 Online'};
  const tbody=U.el('feesBody');if(!tbody)return;
  if(!list.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">No fee records</div></div></td></tr>`;return;}
  tbody.innerHTML=list.map(f=>`<tr>
    <td class="td-mono">${U.esc((f.receipt||'').slice(-12)||'—')}</td>
    <td class="td-primary">${U.esc(f.studentName)}</td>
    <td><span class="badge badge-primary">Class ${U.esc(f.studentClass||'?')}</span></td>
    <td>${U.esc(U.fmtMonth(f.month))}</td>
    <td style="font-weight:800;font-size:15px">${U.fmtCurrency(f.totalAmount)}</td>
    <td>${U.esc(modeLabel[f.mode]||f.mode||'—')}</td>
    <td><span class="badge ${f.status==='paid'?'badge-success':f.status==='partial'?'badge-warning':'badge-danger'}">${U.esc(f.status)}</span></td>
  </tr>`).join('');
}

function resetFeeBreakdown(){
  currentFeeBreakdown={};
  FEE_COMPONENTS.forEach(c=>{currentFeeBreakdown[c.key]={label:c.label,amount:0,enabled:c.alwaysOn};});
}

function openFeeModal(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  U.el('feeStu').value='';U.el('feeMonth').value=U.month();U.el('feeMode').value='cash';
  U.el('feeDate').value=U.today();U.el('feeRef').value='';U.el('feeNotes').value='';U.el('feeStatus').value='paid';
  const sel=U.el('feeStu');
  sel.innerHTML='<option value="">Select student...</option>'+S.students.filter(s=>s.status==='active').sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${s.id}">${U.esc(s.name)} — Class ${s.class}${s.roll?' ('+U.esc(s.roll)+')':''}</option>`).join('');
  resetFeeBreakdown();
  renderFeeBreakdownUI();
  openModal('feeModal');
}

function onFeeStudentChange(){
  const id=U.el('feeStu').value;
  if(!id){resetFeeBreakdown();renderFeeBreakdownUI();return;}
  const s=S.students.find(x=>x.id===id);
  if(!s)return;
  const struct=S.feeStructure[s.class]||{};
  resetFeeBreakdown();
  FEE_COMPONENTS.forEach(comp=>{
    const fs=struct[comp.key];
    currentFeeBreakdown[comp.key]={label:comp.label,amount:comp.key==='conveyance'?Number(s.conveyance||0):(fs?.amount||0),enabled:comp.key==='conveyance'?Number(s.conveyance||0)>0:(fs?.enabled||comp.alwaysOn)};
  });
  renderFeeBreakdownUI();
}

function renderFeeBreakdownUI(){
  const el=U.el('feeBreakdownGrid');if(!el)return;
  let total=0;
  Object.values(currentFeeBreakdown).forEach(c=>{if(c.enabled)total+=Number(c.amount||0);});
  el.innerHTML=FEE_COMPONENTS.map(comp=>{
    const c=currentFeeBreakdown[comp.key]||{};
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" id="fb_${comp.key}" ${c.enabled?'checked':''} onchange="fbToggle('${comp.key}')"/>
      <label for="fb_${comp.key}" style="flex:1;font-size:13px;font-weight:500">${comp.label}</label>
      <input type="number" class="form-control" id="fb_${comp.key}_amt" value="${c.amount||0}" min="0" style="width:110px;text-align:right" oninput="fbAmt('${comp.key}')"/>
    </div>`;
  }).join('')+`<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;font-weight:800;font-size:16px"><span>Total</span><span style="color:var(--success)">${U.fmtCurrency(total)}</span></div>`;
}

function fbToggle(key){currentFeeBreakdown[key].enabled=U.el('fb_'+key)?.checked||false;renderFeeBreakdownUI();}
function fbAmt(key){currentFeeBreakdown[key].amount=Number(U.el('fb_'+key+'_amt')?.value||0);renderFeeBreakdownUI();}

async function saveFee(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const stuId=U.el('feeStu').value;
  const month=U.el('feeMonth').value;
  if(!stuId){Toast.warning('Select a student');return;}
  if(!month){Toast.warning('Select a month');return;}
  let total=0;
  FEE_COMPONENTS.forEach(c=>{if(currentFeeBreakdown[c.key]?.enabled)total+=Number(currentFeeBreakdown[c.key].amount||0);});
  if(!total){Toast.warning('Total amount is ₹0');return;}
  const btn=U.el('saveFeeBtnModal');btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';
  const stu=S.students.find(s=>s.id===stuId);
  const receipt='RCP-'+month.replace('-','')+'#'+String(S.fees.length+1).padStart(4,'0');
  try{
    const{error}=await sb.from('fee_payments').insert({school_id:S.schoolId,student_id:stuId,receipt_number:receipt,month,total_amount:total,breakdown:JSON.parse(JSON.stringify(currentFeeBreakdown)),payment_mode:U.el('feeMode').value,payment_date:U.el('feeDate').value||U.today(),status:U.el('feeStatus').value});
    if(error)throw error;
    Toast.success('Payment Recorded ✅',`${U.fmtCurrency(total)} for ${U.esc(stu?.name||'')}`);
    closeModal('feeModal');await loadFees();renderFeesSection();
  }catch(err){Toast.error('Save Failed',err.message);console.error(err);}
  finally{btn.disabled=false;btn.innerHTML='💾 Record Payment';}
}

// ══════════════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════════════
function renderAttendanceSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Attendance Tracking</div></div>
        <button class="btn btn-outline btn-sm" onclick="exportAttendancePDF()">📄 Export PDF</button>
      </div>
      <div class="card mb-4"><div class="card-body-sm" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
        <select class="form-control" id="attClass" style="width:150px"><option value="">Select Class...</option>${U.classOptions()}</select>
        <input type="date" class="form-control" id="attDate" value="${U.today()}" max="${U.today()}" style="width:170px"/>
        <button class="btn btn-primary" onclick="loadAttendance()">Load Students</button>
        ${!U.isReadOnly()?`<button class="btn btn-success" onclick="saveAttendance()" id="saveAttBtn" disabled>💾 Save Attendance</button>`:''}
        <div id="attSummaryLine" style="font-size:13px;color:var(--text3);margin-left:auto"></div>
      </div></div>
      <div class="grid-4 mb-4 hidden" id="attStats">
        <div class="stat-card"><div class="stat-value" id="aTotal">0</div><div class="stat-label">Total</div></div>
        <div class="stat-card" style="border-color:var(--success-border)"><div class="stat-value" id="aPresent" style="color:var(--success)">0</div><div class="stat-label">Present</div></div>
        <div class="stat-card" style="border-color:var(--danger-border)"><div class="stat-value" id="aAbsent" style="color:var(--danger)">0</div><div class="stat-label">Absent</div></div>
        <div class="stat-card" style="border-color:var(--warning-border)"><div class="stat-value" id="aLate" style="color:var(--warning)">0</div><div class="stat-label">Late</div></div>
      </div>
      <div class="card"><div class="card-body" id="attList"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Select class to start</div><div class="empty-desc">Choose a class and date, then click Load Students</div></div></div></div>
    </div>`;
}

function loadAttendance(){
  const cls=U.el('attClass').value;
  const date=U.el('attDate').value||U.today();
  if(!cls){Toast.warning('Select a class first');return;}
  if(!U.canAccessClass(cls)){Toast.error('Access Denied',`Not assigned to Class ${cls}`);return;}
  const students=S.students.filter(s=>String(s.class)===cls&&s.status==='active');
  if(!students.length){U.el('attList').innerHTML=`<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No active students in Class ${cls}</div></div>`;return;}
  const key=date+'_'+cls;
  const saved=S.attendance[key]||{};
  S.tempAtt={...saved};
  U.el('attStats').classList.remove('hidden');
  const saveBtn=U.el('saveAttBtn');if(saveBtn)saveBtn.disabled=false;
  updateAttStats(students.length);
  const readOnly=U.isReadOnly();
  U.el('attList').innerHTML=`
    <div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:12px;padding:10px;background:var(--surface2);border-radius:var(--radius);display:flex;justify-content:space-between;align-items:center">
      <span>Class ${cls} · ${U.fmtDate(date)} · ${students.length} students ${Object.keys(saved).length?'<span class="badge badge-success" style="margin-left:8px">✓ Saved</span>':''}</span>
      ${!readOnly?`<div style="display:flex;gap:6px"><button class="btn btn-sm btn-outline" onclick="markAll('P')" style="color:var(--success);border-color:var(--success-border)">✅ All Present</button><button class="btn btn-sm btn-outline" onclick="markAll('A')" style="color:var(--danger);border-color:var(--danger-border)">❌ All Absent</button></div>`:''}
    </div>
    ${students.map((s,i)=>`<div class="att-row" id="row-${s.id}">
      <span style="color:var(--text3);font-size:12px;font-weight:600;width:24px">${i+1}</span>
      <div style="flex:1"><div class="att-name">${U.esc(s.name)}</div><div class="att-roll">Roll: ${U.esc(s.roll||'—')}</div></div>
      <div class="att-btns">
        <button class="att-btn ${S.tempAtt[s.id]==='P'?'present':''}" onclick="${readOnly?'':'markAtt(\''+s.id+'\',\'P\','+students.length+')'}" ${readOnly?'disabled':''}>P</button>
        <button class="att-btn ${S.tempAtt[s.id]==='A'?'absent':''}" onclick="${readOnly?'':'markAtt(\''+s.id+'\',\'A\','+students.length+')'}" ${readOnly?'disabled':''}>A</button>
        <button class="att-btn ${S.tempAtt[s.id]==='L'?'late':''}" onclick="${readOnly?'':'markAtt(\''+s.id+'\',\'L\','+students.length+')'}" ${readOnly?'disabled':''}>L</button>
      </div>
    </div>`).join('')}`;
}

function markAtt(stuId,status,total){
  S.tempAtt[stuId]=status;
  const row=document.getElementById('row-'+stuId);
  if(row){
    row.querySelectorAll('.att-btn').forEach(b=>b.classList.remove('present','absent','late'));
    const map={P:'present',A:'absent',L:'late'};
    const idx={P:0,A:1,L:2};
    row.querySelectorAll('.att-btn')[idx[status]]?.classList.add(map[status]);
  }
  updateAttStats(total);
}

function markAll(status){
  const cls=U.el('attClass').value;
  S.students.filter(s=>String(s.class)===cls&&s.status==='active').forEach(s=>{S.tempAtt[s.id]=status;});
  loadAttendance();
}

function updateAttStats(total){
  const vals=Object.values(S.tempAtt);
  U.el('aTotal').textContent=total;
  U.el('aPresent').textContent=vals.filter(v=>v==='P').length;
  U.el('aAbsent').textContent=vals.filter(v=>v==='A').length;
  U.el('aLate').textContent=vals.filter(v=>v==='L').length;
  const pct=total>0?Math.round(vals.filter(v=>v==='P').length/total*100):0;
  const lbl=U.el('attSummaryLine');if(lbl)lbl.textContent=Object.keys(S.tempAtt).length+'/'+total+' marked · '+pct+'% present';
}

async function saveAttendance(){
  if(U.isReadOnly())return;
  const cls=U.el('attClass').value;
  const date=U.el('attDate').value||U.today();
  if(!cls)return;
  const key=date+'_'+cls;
  S.attendance[key]=JSON.parse(JSON.stringify(S.tempAtt));
  saveAttendanceLocal();
  // Also save to Supabase
  const upserts=Object.entries(S.tempAtt).map(([stuId,status])=>({school_id:S.schoolId,student_id:stuId,class_name:cls,record_date:date,status,marked_by:S.user.id}));
  if(upserts.length){
    const{error}=await sb.from('attendance_records').upsert(upserts,{onConflict:'student_id,record_date'});
    if(error)console.error('saveAttendance:',error);
  }
  Toast.success('Attendance Saved ✅',`Class ${cls} · ${date} · ${upserts.length} students`);
  loadAttendance();
}

// ══════════════════════════════════════════════════════
// EXAMS
// ══════════════════════════════════════════════════════
function renderExamsSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Exams & Results</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ${S.examTab==='schedule'?'btn-primary':'btn-outline'} btn-sm" onclick="setExamTab('schedule')">📅 Schedule</button>
          <button class="btn ${S.examTab==='results'?'btn-primary':'btn-outline'} btn-sm" onclick="setExamTab('results')">📊 Results</button>
          ${!U.isReadOnly()?`<button class="btn btn-primary" onclick="openExamModal()">+ Create Exam</button>`:''}
        </div>
      </div>
      <div id="examContent"></div>
    </div>`;
  renderExamContent();
}

function setExamTab(tab){S.examTab=tab;renderExamsSection();}

function renderExamContent(){
  const el=U.el('examContent');if(!el)return;
  if(S.examTab==='results') renderExamResults(el);
  else renderExamSchedule(el);
}

function renderExamSchedule(el){
  const today=U.today();
  const upcoming=(S.exams||[]).filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const past=(S.exams||[]).filter(e=>e.date<today).sort((a,b)=>b.date.localeCompare(a.date));
  if(!S.exams?.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">No exams yet</div><div class="empty-desc">Click "+ Create Exam" to schedule</div></div>';return;}
  const typeColor={written:'badge-primary',mcq:'badge-purple',practical:'badge-warning'};
  const renderList=(list,title)=>list.length?`<div style="margin-bottom:24px"><div style="font-size:14px;font-weight:700;margin-bottom:12px">${title}</div><div class="grid-3">${list.map(e=>`
    <div class="exam-card" style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-lg);padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div><div style="font-weight:800;font-size:15px">${U.esc(e.name)}</div><div style="font-size:12px;color:var(--text3)">${U.esc(e.subject)} · Class ${U.esc(e.class)}</div></div>
        <span class="badge ${typeColor[e.type]||'badge-gray'}">${e.type||'written'}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        <span class="badge badge-gray">📅 ${U.fmtDate(e.date)}</span>
        <span class="badge badge-gray">⏱ ${e.duration}m</span>
        <span class="badge badge-gray">Max ${e.maxMarks}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-xs btn-primary" onclick="openResultEntry('${e.id}')">📊 Marks</button>
        ${!U.isReadOnly()?`<button class="btn btn-xs btn-ghost" onclick="openExamModal('${e.id}')">✏️</button>
        <button class="btn btn-xs btn-ghost" style="color:var(--danger)" onclick="deleteExam('${e.id}')">🗑️</button>`:''}
      </div>
    </div>`).join('')}</div></div>`:'' ;
  el.innerHTML=renderList(upcoming,'📅 Upcoming')+renderList(past,'📂 Past Exams');
}

function renderExamResults(el){
  if(!S.exams?.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No exams yet</div></div>';return;}
  el.innerHTML=`<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Exam</th><th>Subject</th><th>Class</th><th>Date</th><th>Students</th><th>Avg Score</th><th>Pass Rate</th></tr></thead>
    <tbody>${S.exams.map(e=>{
      const res=S.results[e.id]||{};
      const stuCount=Object.keys(res).length;
      const marks=Object.values(res).map(r=>Number(r.marks||0));
      const avg=stuCount?Math.round(marks.reduce((t,m)=>t+m,0)/stuCount):0;
      const passRate=stuCount?Math.round(marks.filter(m=>m>=e.passMarks).length/stuCount*100):0;
      const pct=e.maxMarks?Math.round(avg/e.maxMarks*100):0;
      const g=stuCount?GRADE_MAP(pct):{g:'—',c:'var(--text3)'};
      return `<tr>
        <td class="td-primary">${U.esc(e.name)}</td>
        <td>${U.esc(e.subject)}</td>
        <td><span class="badge badge-primary">Class ${U.esc(e.class)}</span></td>
        <td>${U.fmtDate(e.date)}</td>
        <td>${stuCount}</td>
        <td style="font-weight:700;color:${g.c}">${stuCount?avg+'/'+e.maxMarks:'—'}</td>
        <td>${stuCount?`<span class="badge ${passRate>=50?'badge-success':'badge-danger'}">${passRate}%</span>`:'—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
}

function openExamModal(id=null){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  ['examName','examSubject','examDate'].forEach(f=>{const el=U.el(f);if(el)el.value='';});
  U.el('editExamId').value='';
  if(U.el('examMaxMarks')) U.el('examMaxMarks').value=100;
  if(U.el('examPassMarks')) U.el('examPassMarks').value=33;
  if(U.el('examDuration')) U.el('examDuration').value=180;
  if(U.el('examType')) U.el('examType').value='written';
  populateClassSelects();
  if(id){
    const e=(S.exams||[]).find(x=>x.id===id);if(!e)return;
    U.el('editExamId').value=e.id;
    U.el('examName').value=e.name;U.el('examSubject').value=e.subject;
    U.el('examDate').value=e.date;U.el('examMaxMarks').value=e.maxMarks;
    U.el('examPassMarks').value=e.passMarks;U.el('examDuration').value=e.duration;
    U.el('examType').value=e.type||'written';
    setTimeout(()=>{if(U.el('examClass'))U.el('examClass').value=e.class;},50);
    U.el('examModalTitle').textContent='Edit Exam';
  }else{
    U.el('examDate').value=U.today();
    U.el('examModalTitle').textContent='Create Exam';
  }
  openModal('examModal');
}

async function saveExam(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const name=(U.el('examName')?.value||'').trim();
  const subj=(U.el('examSubject')?.value||'').trim();
  const cls=U.el('examClass')?.value||'';
  if(!name||!subj||!cls){Toast.warning('Fill all required fields');return;}
  if(!U.canAccessClass(cls)){Toast.error('Access Denied',`Not assigned to Class ${cls}`);return;}
  const id=U.el('editExamId')?.value||'';
  const payload={school_id:S.schoolId,name,subject:subj,class_name:cls,exam_date:U.el('examDate')?.value||U.today(),max_marks:Number(U.el('examMaxMarks')?.value)||100,pass_marks:Number(U.el('examPassMarks')?.value)||33,duration_minutes:Number(U.el('examDuration')?.value)||180,exam_type:U.el('examType')?.value||'written'};
  try{
    if(id){const{error}=await sb.from('exams').update(payload).eq('id',id).eq('school_id',S.schoolId);if(error)throw error;Toast.success('Exam Updated ✅');}
    else{const{error}=await sb.from('exams').insert(payload);if(error)throw error;Toast.success('Exam Created ✅',name);}
    closeModal('examModal');await loadExams();renderExamsSection();
  }catch(err){Toast.error('Failed',err.message);}
}

async function deleteExam(id){
  const ok=await showConfirm('Delete Exam','Delete this exam and all results?','🗑️');
  if(!ok)return;
  try{
    const{error}=await sb.from('exams').delete().eq('id',id).eq('school_id',S.schoolId);
    if(error)throw error;
    if(S.results) delete S.results[id];
    saveResultsLocal();
    Toast.warning('Exam deleted');await loadExams();renderExamsSection();
  }catch(err){Toast.error('Delete Failed',err.message);}
}

function openResultEntry(examId){
  const exam=(S.exams||[]).find(e=>e.id===examId);if(!exam)return;
  const students=S.students.filter(s=>String(s.class)===String(exam.class)&&s.status==='active');
  if(!students.length){Toast.warning('No active students in Class '+exam.class);return;}
  if(!S.results) S.results={};
  const existing=S.results[examId]||{};
  U.el('resultModalBody').innerHTML=`
    <div style="background:var(--primary-light);border:1px solid var(--primary-mid);border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px">
      <strong>${U.esc(exam.name)}</strong> — ${U.esc(exam.subject)} | Class ${U.esc(exam.class)} | Max: ${exam.maxMarks} | Pass: ${exam.passMarks}
    </div>
    <input type="hidden" id="rExamId" value="${examId}"/>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Student</th><th>Roll</th><th>Marks (max ${exam.maxMarks})</th><th>Grade</th></tr></thead>
      <tbody>${students.map((s,i)=>{
        const m=existing[s.id]?.marks??'';
        const pct=m!==''?Math.round(Number(m)/exam.maxMarks*100):null;
        const g=pct!==null?GRADE_MAP(pct):{g:'—',c:'var(--text3)'};
        return `<tr>
          <td style="color:var(--text3)">${i+1}</td>
          <td class="td-primary">${U.esc(s.name)}</td>
          <td class="td-mono">${U.esc(s.roll||'—')}</td>
          <td><input type="number" class="form-control" id="mk-${s.id}" value="${m}" min="0" max="${exam.maxMarks}" placeholder="Enter marks" style="max-width:130px" oninput="liveGrade('${s.id}','${examId}')"/></td>
          <td id="grd-${s.id}" style="font-weight:700;color:${g.c}">${g.g}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  openModal('resultModal');
}

function liveGrade(stuId,examId){
  const exam=(S.exams||[]).find(e=>e.id===examId);if(!exam)return;
  const m=Number(U.el('mk-'+stuId)?.value||0);
  const pct=Math.round(m/exam.maxMarks*100);
  const g=GRADE_MAP(pct);
  const el=U.el('grd-'+stuId);if(el){el.textContent=g.g;el.style.color=g.c;}
}

function saveResults(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const examId=U.el('rExamId')?.value;if(!examId)return;
  const exam=(S.exams||[]).find(e=>e.id===examId);if(!exam)return;
  const students=S.students.filter(s=>String(s.class)===String(exam.class)&&s.status==='active');
  if(!S.results) S.results={};
  if(!S.results[examId]) S.results[examId]={};
  students.forEach(s=>{
    const m=U.el('mk-'+s.id)?.value;
    if(m!==undefined&&m!=='') S.results[examId][s.id]={marks:Number(m),savedAt:new Date().toISOString()};
  });
  saveResultsLocal();
  closeModal('resultModal');
  Toast.success('Results Saved ✅');
  if(S.examTab==='results') renderExamResults(U.el('examContent'));
}

// ══════════════════════════════════════════════════════
// TIMETABLE
// ══════════════════════════════════════════════════════
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PERIODS=['8:00','8:45','9:30','10:30','11:15','12:00','12:45','1:30'];

function renderTimetableSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Smart Timetable</div></div>
        <div style="display:flex;gap:8px">
          <select class="form-control" id="ttClass" style="width:140px" onchange="renderTimetable()">${U.classOptions()}</select>
          ${!U.isReadOnly()?`<button class="btn btn-primary" onclick="saveTimetable()">💾 Save</button>`:''}
        </div>
      </div>
      <div class="card"><div class="table-wrap"><table id="ttTable"></table></div></div>
    </div>`;
  renderTimetable();
}

function renderTimetable(){
  const cls=U.el('ttClass')?.value||'1';
  const tt=S.timetables[cls]||{};
  const readOnly=U.isReadOnly();
  const table=U.el('ttTable');if(!table)return;
  table.innerHTML=`
    <thead><tr><th style="width:80px">Period</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
    <tbody>${PERIODS.map((time,pi)=>`<tr>
      <td style="font-weight:700;font-size:12px;color:var(--text3)">${time}</td>
      ${DAYS.map((day,di)=>{
        const val=(tt[di]||{})[pi]||'';
        return `<td><input type="text" class="form-control" id="tt_${di}_${pi}" value="${U.esc(val)}" placeholder="Subject" style="font-size:12px;padding:6px 8px" ${readOnly?'disabled':''}/></td>`;
      }).join('')}
    </tr>`).join('')}
    </tbody>`;
}

function saveTimetable(){
  if(U.isReadOnly())return;
  const cls=U.el('ttClass')?.value||'1';
  S.timetables[cls]={};
  DAYS.forEach((_,di)=>{
    S.timetables[cls][di]={};
    PERIODS.forEach((_,pi)=>{
      const val=U.el(`tt_${di}_${pi}`)?.value.trim()||'';
      if(val) S.timetables[cls][di][pi]=val;
    });
  });
  saveTimetableLocal();
  Toast.success('Timetable Saved ✅',`Class ${cls}`);
}

// ══════════════════════════════════════════════════════
// WHATSAPP / ALERTS
// ══════════════════════════════════════════════════════
let _waType='fee';
function renderWhatsappSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-title" style="margin-bottom:20px">Parent Notifications</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="card"><div class="card-header"><span class="card-title">📲 Compose Alert</span></div><div class="card-body">
          <div class="form-group"><label class="form-label">Alert Type</label>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px">
              ${[['fee','💰','Fee Reminder'],['absent','⚠️','Absent Alert'],['holiday','🏖️','Holiday'],['exam','📝','Exam Alert'],['result','🏆','Result Notice'],['custom','✏️','Custom']].map(([type,icon,label])=>`
                <div onclick="selectWaType('${type}')" id="waType_${type}" style="padding:10px;border-radius:8px;border:1.5px solid ${type===_waType?'var(--primary)':'var(--border)'};background:${type===_waType?'var(--primary-light)':'var(--surface)'};cursor:pointer;text-align:center">
                  <div style="font-size:20px">${icon}</div><div style="font-size:11px;font-weight:600;margin-top:4px">${label}</div>
                </div>`).join('')}
            </div>
          </div>
          <div class="form-group"><label class="form-label">Send To</label>
            <select class="form-control" id="waRecipient" onchange="updateWaCount()"><option value="all">All Parents</option><option value="class">Specific Class</option><option value="defaulters">Fee Defaulters Only</option></select>
          </div>
          <div class="form-group hidden" id="waClassGroup"><label class="form-label">Select Class</label><select class="form-control" id="waClass">${U.classOptions()}</select></div>
          <div class="form-group"><label class="form-label">Message</label>
            <textarea class="form-control" id="waMsg" rows="5" placeholder="Type message..." oninput="updateWaCount()"></textarea>
            <div style="font-size:12px;color:var(--text3);margin-top:4px" id="waCount">0 chars · ~0 parents</div>
          </div>
          <div style="background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:var(--success)">💡 Click Send to save record. Use WhatsApp button to send manually.</div>
          <button class="btn w-full mb-4" style="background:#25D366;color:white;padding:11px;font-size:14px" onclick="sendAlert()">📤 Save & Send Alert</button>
          <button class="btn w-full btn-outline" onclick="openWhatsAppDirect()" style="border-color:#25D366;color:#25D366">Open WhatsApp Web ↗</button>
        </div></div>
        <div class="card"><div class="card-header"><span class="card-title">Alert History</span><span class="badge badge-primary" id="totalAlerts">${S.alerts.length} sent</span></div><div class="card-body" id="alertHistory" style="max-height:520px;overflow-y:auto"></div></div>
      </div>
    </div>`;
  setWaTemplate();
  updateWaCount();
  renderAlerts();
}

function selectWaType(type){
  _waType=type;
  document.querySelectorAll('[id^="waType_"]').forEach(el=>{
    const t=el.id.replace('waType_','');
    el.style.borderColor=t===type?'var(--primary)':'var(--border)';
    el.style.background=t===type?'var(--primary-light)':'var(--surface)';
  });
  setWaTemplate();
}

function setWaTemplate(){
  const school=S.settings.schoolName||'Our School';
  const templates={
    fee:`Dear Parent,\n\nKindly note that the fee for ${school} is due. Please clear the pending amount at the earliest.\n\nThank you,\n${school} Administration`,
    absent:`Dear Parent,\n\nYour ward was absent from ${school} today (${U.fmtDate(U.today())}). Please ensure regular attendance.\n\nRegards,\n${school}`,
    holiday:`Dear Parent,\n\n${school} will remain closed on the upcoming holiday. Classes will resume as per schedule.\n\nRegards,\n${school} Administration`,
    exam:`Dear Parent,\n\nExaminations are scheduled at ${school}. Please ensure your ward is well prepared and reaches on time.\n\nRegards,\n${school}`,
    result:`Dear Parent,\n\nThe examination results for ${school} are now available. Please collect the report card from the office.\n\nRegards,\n${school}`,
    custom:''
  };
  const el=U.el('waMsg');if(el) el.value=templates[_waType]||'';
  updateWaCount();
}

function updateWaCount(){
  const recip=U.el('waRecipient')?.value||'all';
  const waClassGrp=U.el('waClassGroup');
  if(waClassGrp) waClassGrp.classList.toggle('hidden',recip!=='class');
  let count=0;
  if(recip==='all') count=S.students.filter(s=>s.status==='active'&&s.phone).length;
  else if(recip==='class'){const cls=U.el('waClass')?.value;count=S.students.filter(s=>s.status==='active'&&s.phone&&String(s.class)===cls).length;}
  else if(recip==='defaulters'){const defs=new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId));count=S.students.filter(s=>defs.has(s.id)&&s.phone).length;}
  const msg=U.el('waMsg')?.value||'';
  const el=U.el('waCount');if(el) el.textContent=`${msg.length} chars · ~${count} parents`;
}

async function sendAlert(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const msg=(U.el('waMsg')?.value||'').trim();
  if(!msg){Toast.warning('Write a message first');return;}
  const recip=U.el('waRecipient')?.value||'all';
  let count=0;
  if(recip==='all') count=S.students.filter(s=>s.status==='active'&&s.phone).length;
  else if(recip==='class'){const cls=U.el('waClass')?.value;count=S.students.filter(s=>s.status==='active'&&s.phone&&String(s.class)===cls).length;}
  else{const defs=new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId));count=S.students.filter(s=>defs.has(s.id)&&s.phone).length;}
  try{
    const{error}=await sb.from('alerts').insert({school_id:S.schoolId,alert_type:_waType,message:msg,recipient_type:recip,recipient_count:count,sent_by:S.user.id});
    if(error)throw error;
    Toast.success('Alert Saved ✅',`${count} parents notified`);
    await loadAlerts();renderAlerts();
  }catch(err){Toast.error('Failed',err.message);}
}

function openWhatsAppDirect(){
  const msg=encodeURIComponent((U.el('waMsg')?.value||'').trim());
  if(msg) window.open('https://wa.me/?text='+msg,'_blank');
  else Toast.warning('Write a message first');
}

function renderAlerts(){
  const el=U.el('alertHistory');if(!el)return;
  const total=U.el('totalAlerts');if(total)total.textContent=S.alerts.length+' sent';
  if(!S.alerts.length){el.innerHTML='<div class="empty-state" style="padding:24px"><div class="empty-icon" style="font-size:32px">📭</div><div class="empty-desc">No alerts sent yet</div></div>';return;}
  const typeIcon={fee:'💰',absent:'⚠️',holiday:'🏖️',exam:'📝',result:'🏆',custom:'✏️'};
  el.innerHTML=S.alerts.map(a=>`
    <div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span>${typeIcon[a.type]||'📢'}</span>
          <span style="font-weight:600;font-size:13px;text-transform:capitalize">${U.esc(a.type||'Custom')}</span>
        </div>
        <div style="font-size:11px;color:var(--text3)">${U.fmtDate(a.sentAt)}</div>
      </div>
      <div style="font-size:12px;color:var(--text2);white-space:pre-line;max-height:60px;overflow:hidden">${U.esc(a.message)}</div>
      <div style="margin-top:4px"><span class="badge badge-gray">${a.count||0} parents</span></div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════
async function renderReportsSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Reports & Analytics</div></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="exportFullReportPDF()">📄 PDF</button>
          <button class="btn btn-outline btn-sm" onclick="exportFullReportExcel()">📊 Excel</button>
        </div>
      </div>
      <div id="reportsBody"><div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-desc">Loading...</div></div></div>
    </div>`;
  const today=U.today();
  const thisMonth=today.slice(0,7);
  const active=S.students.filter(s=>s.status==='active').length;
  const paid=S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const pending=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const monthFee=S.fees.filter(f=>f.status==='paid'&&f.month===thisMonth).reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const defs=[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))];
  const byClass={};S.students.forEach(s=>{byClass[s.class]=(byClass[s.class]||0)+1;});
  const byMonth={};S.fees.filter(f=>f.status==='paid').forEach(f=>{byMonth[f.month]=(byMonth[f.month]||0)+Number(f.totalAmount||0);});
  const attData=Object.entries(S.attendance).filter(([k])=>k.startsWith(today+'_'));
  let pres=0,tot=0;attData.forEach(([,v])=>Object.values(v).forEach(st=>{tot++;if(st==='P')pres++;}));
  const attRate=tot>0?Math.round(pres/tot*100):0;
  const collectRate=S.students.length>0?Math.round(S.fees.filter(f=>f.status==='paid').length/Math.max(S.fees.length,1)*100):0;
  U.el('reportsBody').innerHTML=`
    <div class="grid-4 mb-6">
      <div class="stat-card"><div class="stat-value">${active}</div><div class="stat-label">Active Students</div></div>
      <div class="stat-card"><div class="stat-value">${attRate}%</div><div class="stat-label">Today's Attendance</div></div>
      <div class="stat-card"><div class="stat-value">${collectRate}%</div><div class="stat-label">Collection Rate</div></div>
      <div class="stat-card"><div class="stat-value">${S.alerts.length}</div><div class="stat-label">Alerts Sent</div></div>
    </div>
    <div class="grid-2 mb-6">
      <div class="card"><div class="card-header"><span class="card-title">Class-wise Students</span></div><div class="card-body">
        ${Object.entries(byClass).sort((a,b)=>Number(a[0])-Number(b[0])).map(([cls,cnt])=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="width:60px;font-size:12px;font-weight:700">Class ${cls}</span>
            <div style="flex:1;height:8px;background:var(--surface3);border-radius:4px"><div style="width:${Math.round(cnt/Math.max(active,1)*100)}%;height:100%;background:var(--primary);border-radius:4px"></div></div>
            <span style="font-size:12px;font-weight:600;color:var(--text2);width:30px;text-align:right">${cnt}</span>
          </div>`).join('')||'<div style="color:var(--text3)">No data</div>'}
      </div></div>
      <div class="card"><div class="card-header"><span class="card-title">Fee Collection by Month</span></div><div class="card-body">
        ${Object.entries(byMonth).sort().slice(-6).map(([mo,amt])=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="width:70px;font-size:11px;font-weight:600;color:var(--text3)">${U.fmtMonth(mo).split(' ')[0]}</span>
            <div style="flex:1;height:8px;background:var(--surface3);border-radius:4px"><div style="width:${Math.round(amt/Math.max(paid,1)*100)}%;height:100%;background:var(--success);border-radius:4px"></div></div>
            <span style="font-size:11px;font-weight:600;color:var(--success);width:70px;text-align:right">${U.fmtCurrency(amt)}</span>
          </div>`).join('')||'<div style="color:var(--text3)">No data</div>'}
      </div></div>
    </div>
    <div class="grid-2 mb-6">
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${U.fmtCurrency(paid)}</div><div class="stat-label">Total Collected</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${U.fmtCurrency(pending)}</div><div class="stat-label">Total Pending</div></div>
    </div>
    <div class="card"><div class="card-header"><span class="card-title">⚠️ Defaulter List</span></div><div class="card-body">
      ${defs.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Phone</th><th>Pending Amount</th></tr></thead><tbody>
        ${defs.map(id=>{
          const s=S.students.find(x=>x.id===id);if(!s)return'';
          const amt=S.fees.filter(f=>f.studentId===id&&f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
          return `<tr><td class="td-primary">${U.esc(s.name)}</td><td><span class="badge badge-primary">Class ${s.class}</span></td><td>${U.esc(s.phone)}</td><td style="color:var(--danger);font-weight:700">${U.fmtCurrency(amt)}</td></tr>`;
        }).join('')}
      </tbody></table></div>`:'<div style="color:var(--success);font-weight:600;padding:12px">🎉 No defaulters!</div>'}
    </div></div>`;
}

// ══════════════════════════════════════════════════════
// TEAM MANAGEMENT (Admin only)
// ══════════════════════════════════════════════════════
async function renderTeamSection(){
  if(S.role!=='admin'){Toast.error('Admin Only');return;}
  await loadMembers();
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Team Management</div><div style="font-size:13px;color:var(--text3)">Manage teachers & their class access</div></div>
        <button class="btn btn-primary" onclick="openMemberModal()">+ Add Member</button>
      </div>
      <div class="card mb-4" style="padding:16px;background:var(--primary-light);border-color:var(--primary-mid)">
        <div style="font-size:13px;color:var(--primary);font-weight:500">
          📋 <b>Invite Flow:</b> Teacher pehle apni email se Sign Up kare → Admin yahan se role & classes assign kare.
        </div>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Name / Email</th><th>Role</th><th>Assigned Classes</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody id="teamBody"></tbody>
      </table></div></div>
    </div>`;
  renderTeamRows();
}

function renderTeamRows(){
  const tbody=U.el('teamBody');if(!tbody)return;
  if(!S.members.length){tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No team members yet</div></div></td></tr>`;return;}
  const roleColors={admin:'badge-primary',teacher:'badge-success',viewer:'badge-gray'};
  tbody.innerHTML=S.members.map(m=>{
    const classes=m.assigned_classes?(Array.isArray(m.assigned_classes)?m.assigned_classes:JSON.parse(m.assigned_classes)).map(c=>`Class ${c}`).join(', '):(m.role==='admin'?'<span style="color:var(--text3)">All Classes</span>':'<span style="color:var(--danger)">None assigned</span>');
    const joined=m.accepted_at?U.fmtDate(m.accepted_at):'<span style="color:var(--text3)">Pending</span>';
    const isSelf=m.user_id===S.user.id;
    return `<tr>
      <td><div class="td-primary">${U.esc(m.display_name||'—')}</div><div style="font-size:11px;color:var(--text3)">${U.esc(m.email||'')}</div></td>
      <td><span class="badge ${roleColors[m.role]||'badge-gray'}">${m.role}</span></td>
      <td style="font-size:13px">${classes}</td>
      <td style="font-size:12px;color:var(--text3)">${joined}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn-icon" onclick="editMember('${m.id}')" style="width:30px;height:30px"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg></button>
        ${!isSelf?`<button class="btn-icon btn-icon-danger" onclick="deleteMember('${m.id}','${U.esc(m.display_name||'Member')}')" style="width:30px;height:30px"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>`:'<span style="font-size:11px;color:var(--text3);margin-left:6px">You</span>'}
      </div></td>
    </tr>`;
  }).join('');
}

function openMemberModal(){
  U.el('editMemberId').value='';U.el('memberName').value='';U.el('memberEmail').value='';
  U.el('memberRole').value='teacher';U.el('memberEmail').disabled=false;
  U.el('teacherModalTitle').textContent='Add Team Member';
  U.el('memberInfoBox').style.display='none';
  _buildClassCheckboxes(null);toggleClassAssign();
  openModal('teacherModal');
}

function editMember(id){
  const m=S.members.find(x=>x.id===id);if(!m)return;
  U.el('editMemberId').value=m.id;U.el('memberName').value=m.display_name||'';
  U.el('memberEmail').value=m.email||'';U.el('memberRole').value=m.role;
  U.el('memberEmail').disabled=true;U.el('teacherModalTitle').textContent='Edit Member';
  const existing=m.assigned_classes?(Array.isArray(m.assigned_classes)?m.assigned_classes.map(String):JSON.parse(m.assigned_classes).map(String)):[];
  _buildClassCheckboxes(existing);toggleClassAssign();
  U.el('memberInfoBox').style.display='block';U.el('memberInfoBox').innerHTML='ℹ️ Editing existing member. Email locked.';
  openModal('teacherModal');
}

function _buildClassCheckboxes(selected){
  const c=U.el('classCheckboxes');if(!c)return;
  c.innerHTML=Array.from({length:12},(_,i)=>{
    const cls=String(i+1);
    return `<label class="class-checkbox-item"><input type="checkbox" value="${cls}" ${selected?.includes(cls)?'checked':''} class="cls-chk"/><span>Class ${cls}</span></label>`;
  }).join('');
}

function toggleClassAssign(){
  const role=U.el('memberRole')?.value;
  const grp=U.el('classAssignGroup');
  if(grp) grp.style.display=role==='teacher'?'block':'none';
}

function selectAllClasses(){document.querySelectorAll('.cls-chk').forEach(c=>c.checked=true);}
function clearAllClasses(){document.querySelectorAll('.cls-chk').forEach(c=>c.checked=false);}

async function saveMember(){
  const memberId=U.el('editMemberId').value;
  const name=U.el('memberName').value.trim();
  const email=U.el('memberEmail').value.trim();
  const role=U.el('memberRole').value;
  const classes=role==='teacher'?Array.from(document.querySelectorAll('.cls-chk:checked')).map(c=>c.value):null;
  if(!name){Toast.warning('Enter member name');return;}
  if(!memberId&&!email){Toast.warning('Enter email');return;}
  if(role==='teacher'&&(!classes||!classes.length)){Toast.warning('Assign at least one class');return;}
  try{
    if(memberId){
      const{error}=await sb.from('school_members').update({role,display_name:name,assigned_classes:classes}).eq('id',memberId).eq('school_id',S.schoolId);
      if(error)throw error;Toast.success('Member Updated ✅',name);
    }else{
      Toast.info('Next Step',`Ask ${email} to sign up on EduManage Pro. Then edit their role here.`);
      closeModal('teacherModal');return;
    }
    U.el('memberEmail').disabled=false;
    closeModal('teacherModal');await loadMembers();renderTeamRows();
  }catch(err){Toast.error('Save Failed',err.message);}
}

async function deleteMember(id,name){
  const ok=await showConfirm('Remove Member',`Remove "${name}" from this school?`,'👤');
  if(!ok)return;
  try{
    const{error}=await sb.from('school_members').delete().eq('id',id).eq('school_id',S.schoolId);
    if(error)throw error;
    Toast.warning('Removed',name+' removed');await loadMembers();renderTeamRows();
  }catch(err){Toast.error('Failed',err.message);}
}

// ══════════════════════════════════════════════════════
// AI ASSISTANT
// ══════════════════════════════════════════════════════
function renderAISection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header"><div><div class="section-title">✨ AI Assistant</div><div style="font-size:13px;color:var(--text3)">Ask anything about your school data</div></div>
        <button class="btn btn-outline btn-sm" id="voiceBtn" onclick="toggleVoice()">🎤 Voice</button>
      </div>
      <div class="card mb-4" style="max-height:420px;overflow-y:auto" id="aiChatBox">
        <div style="padding:20px;text-align:center;color:var(--text3)">
          <div style="font-size:40px;margin-bottom:12px">🤖</div>
          <div style="font-size:15px;font-weight:600;color:var(--text2)">Hello! I'm your School AI Assistant</div>
          <div style="font-size:13px;margin-top:6px">Ask me about students, fees, attendance, or exams</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px">
            ${['Total students','Fee defaulters','Today attendance','Upcoming exams','Class-wise count','Perfect attendance'].map(q=>`<button class="btn btn-outline btn-sm" onclick="askAI('${q}')">${q}</button>`).join('')}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <input class="form-control" id="aiInput" placeholder="Ask about students, fees, attendance..." onkeydown="if(event.key==='Enter')sendAI()"/>
        <button class="btn btn-primary" onclick="sendAI()">Send ✈️</button>
      </div>
    </div>`;
}

function askAI(q){const el=U.el('aiInput');if(el)el.value=q;sendAI();}

function sendAI(){
  const input=U.el('aiInput');
  const q=(input?.value||'').trim();if(!q)return;
  const box=U.el('aiChatBox');if(!box)return;
  box.innerHTML+=`<div style="padding:10px 16px;background:var(--primary);color:white;border-radius:12px 12px 4px 12px;margin:8px 8px 8px auto;max-width:80%;font-size:13px">${U.esc(q)}</div>`;
  const ans=getAIAnswer(q);
  box.innerHTML+=`<div style="padding:10px 16px;background:var(--surface2);border-radius:12px 12px 12px 4px;margin:8px auto 8px 8px;max-width:85%;font-size:13px;line-height:1.6">🤖 ${ans}</div>`;
  box.scrollTop=box.scrollHeight;
  if(input) input.value='';
}

function getAIAnswer(q){
  const ql=q.toLowerCase();
  if(/total student|how many student|enrolled/.test(ql)){
    const a=S.students.filter(s=>s.status==='active').length;
    const cc={};S.students.forEach(s=>{cc[s.class]=(cc[s.class]||0)+1;});
    const top=Object.entries(cc).sort((a,b)=>b[1]-a[1])[0];
    return `👥 <b>Total: ${S.students.length}</b> (Active: ${a})${top?`<br>Largest: Class ${top[0]} (${top[1]} students)`:''}`;
  }
  if(/class.*(count|wise|summary)/.test(ql)){
    const cc={};S.students.forEach(s=>{cc[s.class]=(cc[s.class]||0)+1;});
    return '📚 <b>Class-wise:</b><br>'+Object.entries(cc).sort((a,b)=>Number(a[0])-Number(b[0])).map(([c,n])=>`Class ${c}: <b>${n}</b>`).join(' · ')||'No students yet.';
  }
  if(/fee|collect|paid|pending|default/.test(ql)){
    const paid=S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
    const pend=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
    const defIds=[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))];
    const names=defIds.map(id=>S.students.find(s=>s.id===id)?.name).filter(Boolean);
    return `💰 Collected: <b style="color:var(--success)">${U.fmtCurrency(paid)}</b><br>Pending: <b style="color:var(--danger)">${U.fmtCurrency(pend)}</b> (${defIds.length} defaulters)${names.length?'<br>'+names.slice(0,5).join(', '):''}`;
  }
  if(/attendance|present|absent/.test(ql)){
    const today=U.today();
    const keys=Object.keys(S.attendance).filter(k=>k.startsWith(today+'_'));
    let p=0,t=0;
    keys.forEach(k=>{Object.values(S.attendance[k]).forEach(v=>{if(['P','A','L'].includes(v)){t++;if(v==='P')p++;}});});
    return `✅ Today: <b>${p}/${t}</b> (${t>0?Math.round(p/t*100):0}%)<br>${keys.length?'Classes: '+keys.map(k=>'Class '+k.split('_')[1]).join(', '):'No attendance marked today'}`;
  }
  if(/exam|test|upcoming/.test(ql)){
    const today=U.today();
    const upcoming=(S.exams||[]).filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
    return `📝 Total: ${(S.exams||[]).length} | Upcoming: ${upcoming.length}<br>${upcoming.slice(0,3).map(e=>`📅 <b>${U.esc(e.name)}</b> — ${U.esc(e.subject)}, Class ${e.class}, ${U.fmtDate(e.date)}`).join('<br>')||'None scheduled'}`;
  }
  if(/perfect|100%/.test(ql)){
    const m={};
    Object.values(S.attendance).forEach(v=>{Object.entries(v).forEach(([id,st])=>{if(!m[id])m[id]={p:0,t:0};m[id].t++;if(st==='P')m[id].p++;});});
    const perfect=S.students.filter(s=>m[s.id]?.t>0&&m[s.id].p===m[s.id].t);
    return perfect.length?`🌟 <b>${perfect.length} students with perfect attendance:</b><br>${perfect.map(s=>`✅ ${U.esc(s.name)} (Class ${s.class})`).join('<br>')}`:'No students with 100% attendance found.';
  }
  if(/hi|hello|namaskar|hey/.test(ql)){
    return `🙏 Namaskar! I have: <b>${S.students.length}</b> students · <b>${S.fees.length}</b> fee records · <b>${(S.exams||[]).length}</b> exams<br>Ask me about fees, attendance, students, or exams!`;
  }
  return `🤔 Try: "total students" · "fee defaulters" · "today attendance" · "upcoming exams"`;
}

function toggleVoice(){
  const SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
  const btn=U.el('voiceBtn');
  if(!SpeechRec){Toast.warning('Voice Not Supported','Use Chrome/Edge');return;}
  if(S._voiceActive){S._voiceActive=false;if(btn)btn.textContent='🎤 Voice';return;}
  const rec=new SpeechRec();
  rec.lang='en-IN';rec.continuous=false;rec.interimResults=false;
  S._voiceActive=true;if(btn){btn.textContent='🔴 Listening...';btn.style.color='red';}
  rec.onresult=e=>{
    const t=e.results[0][0].transcript;
    const inp=U.el('aiInput');if(inp)inp.value=t;
    sendAI();S._voiceActive=false;if(btn){btn.textContent='🎤 Voice';btn.style.color='';}
    if(S.currentSection!=='ai') showSection('ai');
  };
  rec.onerror=rec.onend=()=>{S._voiceActive=false;if(btn){btn.textContent='🎤 Voice';btn.style.color='';}};
  rec.start();
}

// ══════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════
function renderSettingsSection(){
  const isAdmin=S.role==='admin';
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-title" style="margin-bottom:20px">Settings</div>
      <div class="card mb-4"><div class="card-header"><span class="card-title">🏫 School Details</span></div><div class="card-body">
        <div class="grid-2">
          <div class="form-group"><label class="form-label">School Name</label><input class="form-control" id="cfgSchoolName" value="${U.esc(S.settings.schoolName)}" ${!isAdmin?'disabled':''}/></div>
          <div class="form-group"><label class="form-label">Academic Year</label><input class="form-control" id="cfgYear" value="${U.esc(S.settings.academicYear)}" ${!isAdmin?'disabled':''}/></div>
          <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="cfgPhone" value="${U.esc(S.settings.phone)}" ${!isAdmin?'disabled':''}/></div>
          <div class="form-group"><label class="form-label">Board</label>
            <select class="form-control" id="cfgBoard" ${!isAdmin?'disabled':''}>
              ${['CBSE','ICSE','UP Board','MP Board','Other'].map(b=>`<option ${S.settings.board===b?'selected':''}>${b}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Address</label><textarea class="form-control" id="cfgAddress" ${!isAdmin?'disabled':''}>${U.esc(S.settings.address)}</textarea></div>
        ${isAdmin?`<button class="btn btn-primary" onclick="saveSettings()">💾 Save Settings</button>`:`<p style="color:var(--text3);font-size:13px">⚠️ Only admins can edit school settings.</p>`}
      </div></div>
      <div class="card"><div class="card-header"><span class="card-title">👤 Your Account</span></div><div class="card-body">
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Email</label><input class="form-control" value="${U.esc(S.user?.email||'')}" disabled/></div>
          <div class="form-group"><label class="form-label">Role</label><input class="form-control" value="${{admin:'Administrator',teacher:'Teacher',viewer:'Viewer'}[S.role]||S.role}" disabled/></div>
          ${S.role==='teacher'&&S.assignedClasses?.length?`<div class="form-group"><label class="form-label">Assigned Classes</label><input class="form-control" value="${S.assignedClasses.map(c=>'Class '+c).join(', ')}" disabled/></div>`:''}
        </div>
        <button class="btn btn-ghost" onclick="handleLogout()">🚪 Sign Out</button>
      </div></div>
    </div>`;
}

async function saveSettings(){
  if(S.role!=='admin'){Toast.error('Admin Only');return;}
  try{
    const name=U.el('cfgSchoolName').value.trim();
    const year=U.el('cfgYear').value.trim();
    const phone=U.el('cfgPhone').value.trim();
    const board=U.el('cfgBoard').value;
    const address=U.el('cfgAddress').value.trim();
    const{error}=await sb.from('schools').update({name,academic_year:year,phone,board,address}).eq('id',S.schoolId);
    if(error)throw error;
    S.settings={schoolName:name,academicYear:year,phone,board,address};
    U.el('sidebarSchoolName').textContent=U.esc(name);
    Toast.success('Settings Saved ✅');
  }catch(err){Toast.error('Save Failed',err.message);}
}

// ══════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════
function exportStudentsExcel(){
  if(!window.XLSX){Toast.warning('Excel library not loaded');return;}
  const data=S.students.map((s,i)=>({'#':i+1,Name:s.name,Class:s.class,Roll:s.roll||'',Father:s.father||'',Phone:s.phone,Email:s.email||'',Status:s.status,'Conveyance':s.conveyance||0}));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Students');
  XLSX.writeFile(wb,`Students_${S.settings.schoolName}_${U.today()}.xlsx`);
  Toast.success('Excel Downloaded ✅');
}

function exportFeesExcel(){
  if(!window.XLSX){Toast.warning('Excel library not loaded');return;}
  const data=S.fees.map(f=>({'Receipt':f.receipt,'Student':f.studentName,'Class':f.studentClass,'Month':f.month,'Amount':f.totalAmount,'Mode':f.mode,'Status':f.status}));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Fees');
  XLSX.writeFile(wb,`Fees_${S.settings.schoolName}_${U.today()}.xlsx`);
  Toast.success('Excel Downloaded ✅');
}

function exportFeesPDF(){
  if(!window.jspdf?.jsPDF){Toast.warning('PDF library not loaded');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.setFontSize(16);doc.text(S.settings.schoolName||'School',14,20);
  doc.setFontSize(12);doc.text('Fee Report — '+U.today(),14,30);
  let y=45;
  doc.setFontSize(10);
  ['Receipt','Student','Class','Month','Amount','Status'].forEach((h,i)=>doc.text(h,[14,55,85,110,135,160][i],40));
  S.fees.slice(0,40).forEach(f=>{
    if(y>270){doc.addPage();y=20;}
    [f.receipt||'',f.studentName||'',f.studentClass||'',f.month||'',String(f.totalAmount||0),f.status||''].forEach((v,i)=>doc.text(String(v).slice(0,15),[14,55,85,110,135,160][i],y));
    y+=8;
  });
  doc.save(`Fees_${U.today()}.pdf`);
  Toast.success('PDF Downloaded ✅');
}

function exportAttendancePDF(){
  const cls=U.el('attClass')?.value;
  const date=U.el('attDate')?.value||U.today();
  if(!cls){Toast.warning('Select a class first');return;}
  if(!window.jspdf?.jsPDF){Toast.warning('PDF library not loaded');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.setFontSize(16);doc.text(`Attendance — Class ${cls}`,14,20);
  doc.setFontSize(12);doc.text('Date: '+U.fmtDate(date),14,30);
  const key=date+'_'+cls;
  const att=S.attendance[key]||{};
  const students=S.students.filter(s=>String(s.class)===cls&&s.status==='active');
  let y=50;
  doc.setFontSize(10);
  doc.text('#',14,45);doc.text('Name',25,45);doc.text('Roll',100,45);doc.text('Status',130,45);
  students.forEach((s,i)=>{
    if(y>270){doc.addPage();y=20;}
    const st=att[s.id]||'—';
    doc.text(String(i+1),14,y);doc.text((s.name||'').slice(0,25),25,y);doc.text(s.roll||'—',100,y);doc.text(st,130,y);
    y+=8;
  });
  doc.save(`Attendance_Class${cls}_${date}.pdf`);
  Toast.success('PDF Downloaded ✅');
}

function exportFullReportPDF(){
  if(!window.jspdf?.jsPDF){Toast.warning('PDF library not loaded');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  const school=S.settings.schoolName||'School';
  doc.setFontSize(18);doc.text(school,14,20);
  doc.setFontSize(12);doc.text('Full Report — '+U.today(),14,30);
  const paid=S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  const pending=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount||0),0);
  doc.setFontSize(11);
  doc.text(`Total Students: ${S.students.length} (Active: ${S.students.filter(s=>s.status==='active').length})`,14,45);
  doc.text(`Fee Collected: Rs.${paid} | Pending: Rs.${pending}`,14,55);
  doc.text(`Total Alerts Sent: ${S.alerts.length}`,14,65);
  doc.save(`FullReport_${school}_${U.today()}.pdf`);
  Toast.success('PDF Downloaded ✅');
}

function exportFullReportExcel(){
  if(!window.XLSX){Toast.warning('Excel library not loaded');return;}
  const wb=XLSX.utils.book_new();
  const stuWs=XLSX.utils.json_to_sheet(S.students.map(s=>({Name:s.name,Class:s.class,Roll:s.roll||'',Phone:s.phone,Status:s.status})));
  XLSX.utils.book_append_sheet(wb,stuWs,'Students');
  const feeWs=XLSX.utils.json_to_sheet(S.fees.map(f=>({Receipt:f.receipt,Student:f.studentName,Class:f.studentClass,Month:f.month,Amount:f.totalAmount,Status:f.status})));
  XLSX.utils.book_append_sheet(wb,feeWs,'Fees');
  XLSX.writeFile(wb,`FullReport_${S.settings.schoolName}_${U.today()}.xlsx`);
  Toast.success('Excel Downloaded ✅');
}

// ══════════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  document.documentElement.dataset.theme=localStorage.getItem('em_theme')||'light';
  if(initSupabase()) initAuth();
});

console.log('EduManage Pro v8 — Supabase + All Features Active ✓');