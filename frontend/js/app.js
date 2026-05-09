'use strict';
// ═══════════════════════════════════════════════════════
// EDUMANAGE PRO v9 — FULLY FIXED & COMPLETE
// All bugs fixed. Supabase Backend + All Features
// ═══════════════════════════════════════════════════════

let sb = null;

function initSupabase() {
  if (!window.ENV?.SUPABASE_URL || !window.ENV?.SUPABASE_ANON_KEY) {
    document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f2f7;font-family:sans-serif"><div style="text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.1);max-width:400px"><div style="font-size:48px;margin-bottom:16px">⚙️</div><h2 style="color:#1a1a2e">Setup Required</h2><p style="color:#666;margin-top:10px">Please fill your Supabase keys in <b>env.js</b> and reload the page.</p></div></div>`;
    return false;
  }
  sb = window.supabase.createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);
  return true;
}

// ══ CONSTANTS ══
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

const DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PERIODS = ['8:00','8:45','9:30','10:30','11:15','12:00','12:45','1:30'];

const GRADE_MAP = pct => {
  if (pct >= 90) return { g:'A+', c:'#059669' };
  if (pct >= 75) return { g:'A',  c:'#10b981' };
  if (pct >= 60) return { g:'B+', c:'#2563eb' };
  if (pct >= 50) return { g:'B',  c:'#7c3aed' };
  if (pct >= 33) return { g:'C',  c:'#d97706' };
  return { g:'F', c:'#dc2626' };
};

// ══ STATE ══
const S = {
  user:null, role:'viewer', schoolId:'',
  assignedClasses:null,
  students:[], fees:[], exams:[], alerts:[],
  attendance:{}, results:{}, timetables:{},
  feeStructure:{}, members:[],
  settings:{ schoolName:'', academicYear:'2024-25', phone:'', address:'', board:'CBSE' },
  currentSection:'dashboard',
  examTab:'schedule',
  tempAtt:{},
  _voiceActive:false,
};

let _feeBreakdown = {};
let _confirmResolve = null;
let _waType = 'fee';

// ══ UTILITIES ══
const U = {
  el:  id => document.getElementById(id),
  qs:  sel => document.querySelector(sel),
  today: () => new Date().toISOString().split('T')[0],
  month: () => new Date().toISOString().slice(0,7),
  esc: s => s==null?'':String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c)),
  fmtCurrency: n => '₹'+Number(n||0).toLocaleString('en-IN'),
  fmtDate: d => { if(!d)return'—'; try{return new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}catch{return d;} },
  fmtMonth: m => { if(!m)return'—'; try{const[y,mo]=m.split('-');return new Date(y,mo-1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});}catch{return m;} },
  avatar: n => { const w=String(n||'').trim().split(' ');return w.length>=2?(w[0][0]+w[w.length-1][0]).toUpperCase():String(n||'?').slice(0,2).toUpperCase(); },
  isPhone: p => /^\d{10}$/.test(String(p).replace(/\s/g,'')),
  isReadOnly: () => S.role==='viewer',
  canAccessClass: cls => {
    if(S.role==='admin'||S.role==='viewer') return true;
    if(!S.assignedClasses?.length) return false;
    return S.assignedClasses.includes(String(cls));
  },
  classOptions: () => {
    const all = Array.from({length:12},(_,i)=>String(i+1));
    const allowed = (S.role==='teacher'&&S.assignedClasses?.length) ? S.assignedClasses.map(String) : all;
    return allowed.map(c=>`<option value="${c}">Class ${c}</option>`).join('');
  },
  setText: (id,val) => { const el=document.getElementById(id); if(el) el.textContent=val; },
};

// ══ TOAST ══
const Toast = {
  show(title,msg='',type='info',dur=4000){
    const c=U.el('toastContainer');if(!c)return;
    const t=document.createElement('div');
    t.className=`toast toast-${type}`;
    t.innerHTML=`<div class="toast-icon">${{success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'}[type]||'📢'}</div><div class="toast-content"><div class="toast-title">${U.esc(title)}</div>${msg?`<div class="toast-msg">${U.esc(String(msg))}</div>`:''}</div><button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
    c.appendChild(t);
    setTimeout(()=>{t.style.animation='toastOut .3s ease forwards';setTimeout(()=>t.remove(),300);},dur);
  },
  success:(t,m)=>Toast.show(t,m,'success'),
  error:  (t,m)=>Toast.show(t,m,'error',6000),
  warning:(t,m)=>Toast.show(t,m,'warning'),
  info:   (t,m)=>Toast.show(t,m,'info'),
};

// ══ CONFIRM ══
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
function resolveConfirm(v){
  U.el('confirmOverlay').style.display='none';
  if(_confirmResolve){_confirmResolve(v);_confirmResolve=null;}
}

// ESC to close modals
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m=>m.classList.add('hidden'));
    resolveConfirm(false);
  }
});

// ══ THEME ══
function toggleTheme(){
  const h=document.documentElement;
  h.dataset.theme=h.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem('em_theme',h.dataset.theme);
}

// ══ LAYOUT ══
function toggleSidebar(){ U.el('sidebar').classList.toggle('show'); U.el('sidebarOverlay').classList.toggle('show'); }
function closeSidebar()  { U.el('sidebar')?.classList.remove('show'); U.el('sidebarOverlay')?.classList.remove('show'); }
function openModal(id)   { U.el(id)?.classList.remove('hidden'); }
function closeModal(id)  { U.el(id)?.classList.add('hidden'); }

function toggleAuthPanel(type){
  U.el('loginFormPanel').style.display  = type==='signup'?'none':'block';
  U.el('signupFormPanel').style.display = type==='signup'?'block':'none';
  const e=U.el('loginError'); if(e){e.textContent='';e.style.display='none';}
}

// ══ NAVIGATION ══
const SECTION_TITLES = {
  dashboard:'Dashboard', students:'Student Management', fees:'Fee Management',
  feestructure:'Fee Structure', attendance:'Attendance Tracking',
  exams:'Exams & Results', timetable:'Smart Timetable',
  whatsapp:'Parent Notifications', reports:'Reports & Analytics',
  team:'Team Management', ai:'AI Assistant', settings:'Settings'
};

function showSection(id){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const nav=U.qs(`[data-section="${id}"]`);
  if(nav) nav.classList.add('active');
  U.setText('pageTitle', SECTION_TITLES[id]||id);
  S.currentSection=id;
  closeSidebar();
  _renderSection(id);
}

function _renderSection(id){
  const map={
    dashboard:    renderDashboard,
    students:     renderStudentsSection,
    fees:         renderFeesSection,
    feestructure: renderFeeStructureSection,
    attendance:   renderAttendanceSection,
    exams:        renderExamsSection,
    timetable:    renderTimetableSection,
    whatsapp:     renderWhatsappSection,
    reports:      renderReportsSection,
    team:         renderTeamSection,
    ai:           renderAISection,
    settings:     renderSettingsSection,
  };
  if(map[id]) map[id]();
}

// ══════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════
async function signInWithGoogle(){
  try{
    const{error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
    if(error) throw error;
  }catch(err){_showLoginErr(err.message);}
}

async function handleLogin(e){
  e.preventDefault();
  const btn=U.el('loginBtn');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Signing in...';
  _hideLoginErr();
  try{
    const{data,error}=await sb.auth.signInWithPassword({
      email:U.el('loginEmail').value.trim(),
      password:U.el('loginPassword').value
    });
    if(error) throw error;
    S.user=data.user;
    await _initApp();
  }catch(err){_showLoginErr(err.message);}
  finally{btn.disabled=false; btn.textContent='Sign In';}
}

async function handleSignup(e){
  e.preventDefault();
  const btn=U.el('signupBtn');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Creating...';
  _hideLoginErr();
  const name   = U.el('signupName').value.trim();
  const school = U.el('signupSchool').value.trim();
  const email  = U.el('signupEmail').value.trim();
  const pwd    = U.el('signupPassword').value;
  try{
    const{data,error}=await sb.auth.signUp({email,password:pwd,options:{data:{full_name:name}}});
    if(error) throw error;
    if(data.user && data.session){
      S.user=data.user;
      await _createSchool(data.user.id, school||'My School');
      await _initApp();
    }else{
      Toast.success('Account Created!','Check your email to verify, then Sign In.');
      toggleAuthPanel('login');
    }
  }catch(err){_showLoginErr(err.message);}
  finally{btn.disabled=false; btn.textContent='Create Admin Account';}
}

function _showLoginErr(msg){ const e=U.el('loginError'); if(e){e.textContent='⚠️ '+msg; e.style.display='block';} }
function _hideLoginErr()   { const e=U.el('loginError'); if(e){e.textContent=''; e.style.display='none';} }

async function handleLogout(){
  const ok=await showConfirm('Sign Out','Are you sure you want to sign out?','👋',false);
  if(!ok) return;
  await sb.auth.signOut();
  location.reload();
}

// ══ SCHOOL CREATION ══
async function _createSchool(userId, schoolName){
  const{data:school,error:e1}=await sb.from('schools')
    .insert({name:schoolName, owner_id:userId, academic_year:'2024-25', board:'CBSE'})
    .select().single();
  if(e1) throw e1;

  const{error:e2}=await sb.from('school_members').insert({
    school_id:school.id, user_id:userId,
    role:'admin', accepted_at:new Date().toISOString(),
    display_name:'', assigned_classes:null
  });
  if(e2) throw e2;

  // Seed fee structures
  const rows=[];
  Array.from({length:12},(_,i)=>String(i+1)).forEach(cls=>{
    FEE_COMPONENTS.forEach(c=>{
      rows.push({
        school_id:school.id, class_name:cls,
        component_key:c.key, component_label:c.label,
        amount:c.key==='tuition'?3000:c.key==='computer'?200:c.key==='sports'?150:c.key==='library'?50:100,
        enabled:c.alwaysOn||c.key==='tuition',
        always_on:c.alwaysOn
      });
    });
  });
  await sb.from('fee_structures').insert(rows);
  return school;
}

// ══ SESSION & APP INIT ══
async function _initAuth(){
  const{data:{session}}=await sb.auth.getSession();
  if(session){ S.user=session.user; await _initApp(); }

  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='SIGNED_IN' && session && !S.schoolId){
      S.user=session.user; await _initApp();
    }else if(event==='SIGNED_OUT'){
      U.el('loginPage').style.display='flex';
      U.el('appPage').classList.remove('active');
      S.schoolId=''; S.user=null;
    }
  });
}

async function _initApp(){
  try{
    const{data:mems,error}=await sb.from('school_members')
      .select('school_id,role,assigned_classes,display_name,email')
      .eq('user_id',S.user.id)
      .order('invited_at',{ascending:false});
    if(error) throw error;

    if(!mems?.length){ _showSchoolSetup(); return; }

    const m = mems[0];
    S.schoolId = m.school_id;
    S.role     = m.role;
    S.assignedClasses = m.assigned_classes
      ? (Array.isArray(m.assigned_classes) ? m.assigned_classes.map(String) : JSON.parse(m.assigned_classes).map(String))
      : null;

    const{data:school}=await sb.from('schools').select('*').eq('id',S.schoolId).single();
    if(school) S.settings={
      schoolName:school.name, academicYear:school.academic_year||'2024-25',
      phone:school.phone||'', address:school.address||'', board:school.board||'CBSE'
    };

    // Update UI identity
    const name = S.user.user_metadata?.full_name || m.display_name || S.user.email.split('@')[0];
    U.setText('userName', name);
    U.setText('userAvatar', U.avatar(name));
    U.setText('userRole', {admin:'Administrator',teacher:'Teacher',viewer:'Viewer'}[S.role]||S.role);
    U.setText('sidebarSchoolName', S.settings.schoolName||'My School');

    const badges={admin:'<span class="badge badge-primary">👨‍💼 Admin</span>',teacher:'<span class="badge badge-success">👩‍🏫 Teacher</span>',viewer:'<span class="badge badge-gray">👁️ Viewer</span>'};
    U.el('topbarRoleBadge').innerHTML = badges[S.role]||'';

    _buildAdminNav();

    // Load all data
    await Promise.all([_loadStudents(), _loadFees(), _loadExams(), _loadAlerts(), _loadFeeStructure()]);
    _loadLocalData();
    _setupRealtime();

    U.el('loginPage').style.display='none';
    U.el('appPage').classList.add('active');
    showSection('dashboard');
    Toast.success('Welcome back!', U.esc(name));
  }catch(err){
    console.error('_initApp:', err);
    _showLoginErr('Error: '+err.message);
  }
}

function _buildAdminNav(){
  const el=U.el('adminNavItems'); if(!el) return;
  if(S.role==='admin'){
    el.innerHTML=`<div class="nav-item" data-section="team" onclick="showSection('team')">
      <div class="nav-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div>Team Management
    </div>`;
  } else { el.innerHTML=''; }
  if(S.role==='teacher' && S.assignedClasses?.length){
    const pill=document.createElement('div');
    pill.className='nav-class-pill';
    pill.innerHTML=`📚 Classes: ${S.assignedClasses.map(c=>`<b>Class ${c}</b>`).join(', ')}`;
    el.appendChild(pill);
  }
}

function _showSchoolSetup(){
  U.el('loginPage').style.display='none';
  U.el('appPage').classList.add('active');
  const name = S.user?.user_metadata?.full_name || S.user?.email?.split('@')[0] || 'User';
  U.el('contentArea').innerHTML=`
    <div style="max-width:480px;margin:60px auto;text-align:center;animation:fadeIn .3s ease">
      <div style="font-size:64px;margin-bottom:16px">🏫</div>
      <h2 style="font-size:24px;font-weight:800;color:var(--text1)">Welcome, ${U.esc(name)}!</h2>
      <p style="color:var(--text3);margin:10px 0 28px;font-size:15px">Let's set up your school to get started.</p>
      <div class="card"><div class="card-body">
        <div class="form-group"><label class="form-label">School Name *</label><input class="form-control" id="setupSchoolName" placeholder="e.g. Sunrise Public School" autofocus/></div>
        <div class="form-group"><label class="form-label">Academic Year</label><input class="form-control" id="setupYear" value="2024-25"/></div>
        <div class="form-group"><label class="form-label">Board</label>
          <select class="form-control" id="setupBoard">
            <option>CBSE</option><option>ICSE</option><option>UP Board</option><option>MP Board</option><option>Other</option>
          </select>
        </div>
        <button class="btn btn-primary w-full" style="padding:13px;font-size:15px;margin-top:4px" onclick="_completeSetup()">🚀 Create School & Enter Dashboard</button>
      </div></div>
    </div>`;
}

async function _completeSetup(){
  const name=(U.el('setupSchoolName')?.value||'').trim();
  if(!name){Toast.warning('School name is required');return;}
  try{
    await _createSchool(S.user.id, name);
    Toast.success('School Created! 🎉');
    await _initApp();
  }catch(err){Toast.error('Setup Failed',err.message);console.error(err);}
}

function _setupRealtime(){
  if(!S.schoolId) return;
  sb.channel('em-'+S.schoolId)
    .on('postgres_changes',{event:'*',schema:'public',table:'students',filter:`school_id=eq.${S.schoolId}`},
      ()=>{ _loadStudents(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'fee_payments',filter:`school_id=eq.${S.schoolId}`},
      ()=>{ _loadFees(); })
    .subscribe();
}

// ══════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════
async function _loadStudents(){
  let q=sb.from('students').select('*').eq('school_id',S.schoolId).order('class_name').order('name');
  if(S.role==='teacher'&&S.assignedClasses?.length) q=q.in('class_name',S.assignedClasses);
  const{data,error}=await q;
  if(error){console.error('loadStudents:',error);return;}
  S.students=(data||[]).map(s=>({
    id:s.id, name:s.name, class:s.class_name, roll:s.roll_number,
    dob:s.dob, father:s.father_name, mother:s.mother_name||'',
    phone:s.phone, email:s.email||'', address:s.address||'',
    status:s.status, conveyance:Number(s.conveyance_fee||0),
    busRoute:s.bus_route||'', createdAt:s.created_at
  }));
  U.setText('navStudentCount', S.students.filter(s=>s.status==='active').length);
  if(S.currentSection==='students') renderStudents();
  _updateDashStats();
}

async function _loadFees(){
  const{data,error}=await sb.from('fee_payments').select('*').eq('school_id',S.schoolId).order('created_at',{ascending:false});
  if(error){console.error('loadFees:',error);return;}
  const stuMap=new Map(S.students.map(s=>[s.id,s]));
  S.fees=(data||[]).map(f=>{
    const stu=stuMap.get(f.student_id);
    return{id:f.id, receipt:f.receipt_number, studentId:f.student_id,
      studentName:stu?.name||'Unknown', studentClass:stu?.class||'',
      month:f.month, totalAmount:Number(f.total_amount||0),
      feeBreakdown:f.breakdown||{}, mode:f.payment_mode,
      date:f.payment_date, status:f.status, createdAt:f.created_at};
  });
  if(S.currentSection==='fees') renderFees();
  _updateDashStats();
}

async function _loadExams(){
  let q=sb.from('exams').select('*').eq('school_id',S.schoolId).order('exam_date',{ascending:false});
  if(S.role==='teacher'&&S.assignedClasses?.length) q=q.in('class_name',S.assignedClasses);
  const{data,error}=await q;
  if(error){console.error('loadExams:',error);return;}
  S.exams=(data||[]).map(e=>({
    id:e.id, name:e.name, subject:e.subject, class:e.class_name,
    date:e.exam_date, maxMarks:e.max_marks, passMarks:e.pass_marks,
    duration:e.duration_minutes, type:e.exam_type, createdAt:e.created_at
  }));
}

async function _loadAlerts(){
  const{data,error}=await sb.from('alerts').select('*').eq('school_id',S.schoolId).order('sent_at',{ascending:false});
  if(error){console.error('loadAlerts:',error);return;}
  S.alerts=(data||[]).map(a=>({
    id:a.id, type:a.alert_type, message:a.message,
    recipient:a.recipient_type, count:a.recipient_count, sentAt:a.sent_at
  }));
}

async function _loadFeeStructure(){
  const{data,error}=await sb.from('fee_structures').select('*').eq('school_id',S.schoolId);
  if(error){console.error('loadFeeStructure:',error);return;}
  S.feeStructure={};
  (data||[]).forEach(r=>{
    if(!S.feeStructure[r.class_name]) S.feeStructure[r.class_name]={};
    S.feeStructure[r.class_name][r.component_key]={
      label:r.component_label, amount:Number(r.amount||0),
      enabled:r.enabled, alwaysOn:r.always_on
    };
  });
}

async function _loadMembers(){
  if(S.role!=='admin') return;
  const{data,error}=await sb.from('school_members').select('*').eq('school_id',S.schoolId).order('invited_at');
  if(error){console.error('loadMembers:',error);return;}
  S.members=data||[];
}

function _loadLocalData(){
  try{ S.attendance=JSON.parse(localStorage.getItem('em_att_'+S.schoolId)||'{}'); }catch{ S.attendance={}; }
  try{ S.results=JSON.parse(localStorage.getItem('em_res_'+S.schoolId)||'{}'); }catch{ S.results={}; }
  try{ S.timetables=JSON.parse(localStorage.getItem('em_tt_'+S.schoolId)||'{}'); }catch{ S.timetables={}; }
}

function _saveAtt(){ try{localStorage.setItem('em_att_'+S.schoolId,JSON.stringify(S.attendance));}catch(e){} }
function _saveRes(){ try{localStorage.setItem('em_res_'+S.schoolId,JSON.stringify(S.results));}catch(e){} }
function _saveTT() { try{localStorage.setItem('em_tt_'+S.schoolId,JSON.stringify(S.timetables));}catch(e){} }

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
function renderDashboard(){
  const teacherNote = S.role==='teacher'&&S.assignedClasses?.length
    ? `<div style="display:inline-block;margin-top:8px;padding:4px 14px;border-radius:20px;background:rgba(255,255,255,.18);font-size:13px;font-weight:500">📚 Classes: ${S.assignedClasses.map(c=>`Class ${c}`).join(', ')}</div>` : '';
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="welcome-banner">
        <div style="position:relative;z-index:1">
          <div style="font-size:22px;font-weight:800">Namaskar, ${U.esc(S.user?.user_metadata?.full_name||'User')}! 🙏</div>
          <div style="font-size:13px;opacity:.8;margin-top:3px">${U.fmtDate(U.today())} · ${U.esc(S.settings.schoolName)}</div>
          ${teacherNote}
          <div class="banner-chips">
            <div class="banner-chip"><div class="chip-label">Total Students</div><div class="chip-value" id="chipStudents">—</div></div>
            <div class="banner-chip"><div class="chip-label">Present Today</div><div class="chip-value" id="chipPresent">—</div></div>
            <div class="banner-chip"><div class="chip-label">Fee Collected</div><div class="chip-value" id="chipCollected">—</div></div>
            <div class="banner-chip"><div class="chip-label">Fees Pending</div><div class="chip-value" id="chipPending">—</div></div>
          </div>
        </div>
      </div>
      <div class="grid-4 mb-6">
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--primary-bg);color:var(--primary)">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <div class="stat-value" id="statStudents">0</div>
          <div class="stat-label">Active Students</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--success-bg);color:var(--success)">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="stat-value" id="statPresent">—</div>
          <div class="stat-label">Present Today</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--danger-bg);color:var(--danger)">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div class="stat-value" id="statPending" style="color:var(--danger)">₹0</div>
          <div class="stat-label">Fees Pending</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--warning-bg);color:var(--warning)">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </div>
          <div class="stat-value" id="statAlerts">${S.alerts.length}</div>
          <div class="stat-label">Alerts Sent</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <div class="card">
          <div class="card-header"><span class="card-title">⚡ Quick Actions</span></div>
          <div class="card-body">
            <div class="quick-grid">
              <div class="quick-card" onclick="${!U.isReadOnly()?'openStudentModal()':'Toast.info(\'Viewer\',\'Read only access\')'}"><div class="quick-icon">👨‍🎓</div><div class="quick-title">Add Student</div></div>
              <div class="quick-card" onclick="${!U.isReadOnly()?'openFeeModal()':'Toast.info(\'Viewer\',\'Read only access\')'}"><div class="quick-icon">💰</div><div class="quick-title">Record Fee</div></div>
              <div class="quick-card" onclick="showSection('attendance')"><div class="quick-icon">✅</div><div class="quick-title">Attendance</div></div>
              <div class="quick-card" onclick="showSection('whatsapp')"><div class="quick-icon">📲</div><div class="quick-title">Send Alert</div></div>
              <div class="quick-card" onclick="showSection('exams')"><div class="quick-icon">📝</div><div class="quick-title">Exams</div></div>
              <div class="quick-card" onclick="showSection('ai')"><div class="quick-icon">✨</div><div class="quick-title">AI Assistant</div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">⚠️ Fee Defaulters</span><button class="btn btn-sm btn-ghost" onclick="showSection('fees')">View All</button></div>
          <div class="card-body" id="defaultersList" style="max-height:220px;overflow-y:auto"></div>
        </div>
      </div>
    </div>`;
  _updateDashStats();
  _renderDefaulters();
}

function _updateDashStats(){
  if(S.currentSection!=='dashboard') return;
  const active = S.students.filter(s=>s.status==='active').length;
  const paid   = S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+f.totalAmount,0);
  const pend   = S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
  const today  = U.today();
  let pres=0, tot=0;
  Object.entries(S.attendance).filter(([k])=>k.startsWith(today+'_')).forEach(([,v])=>{
    Object.values(v).forEach(st=>{tot++;if(st==='P')pres++;});
  });
  U.setText('statStudents', active); U.setText('chipStudents', active);
  U.setText('statPresent', tot>0?`${pres}/${tot}`:'—'); U.setText('chipPresent', tot>0?`${pres}/${tot}`:'—');
  U.setText('statPending',  U.fmtCurrency(pend)); U.setText('chipPending', U.fmtCurrency(pend));
  U.setText('chipCollected', U.fmtCurrency(paid));
  if(U.el('statPending')) U.el('statPending').textContent=U.fmtCurrency(pend);
}

function _renderDefaulters(){
  const el=U.el('defaultersList'); if(!el) return;
  const defIds=[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))];
  if(!defIds.length){el.innerHTML='<div class="empty-state" style="padding:20px"><div class="empty-icon" style="font-size:32px">🎉</div><div class="empty-desc">No defaulters! All fees clear.</div></div>';return;}
  const stuMap=new Map(S.students.map(s=>[s.id,s]));
  el.innerHTML=defIds.slice(0,10).map(id=>{
    const s=stuMap.get(id); if(!s) return '';
    const amt=S.fees.filter(f=>f.studentId===id&&f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600;font-size:13px">${U.esc(s.name)}</div><div style="font-size:11px;color:var(--text3)">Class ${s.class} · ${s.phone}</div></div>
      <span class="badge badge-danger">${U.fmtCurrency(amt)}</span>
    </div>`;
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
        <div><div class="section-title">Student Management</div><div style="font-size:13px;color:var(--text3)" id="stuSubtitle">${S.students.length} students</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="_exportStudentsExcel()">📊 Excel</button>
          <button class="btn btn-outline btn-sm" onclick="_exportStudentsPDF()">📄 PDF</button>
          ${canWrite?`<button class="btn btn-primary" onclick="openStudentModal()">+ Add Student</button>`:`<span class="badge badge-gray">👁️ View Only</span>`}
        </div>
      </div>
      <div class="card mb-4"><div class="card-body-sm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <div style="position:relative;flex:1;min-width:180px">
          <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:14px;height:14px;stroke:var(--text3);fill:none;stroke-width:2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="form-control" id="stuSearch" placeholder="Search name, roll, phone..." style="padding-left:32px" oninput="renderStudents()"/>
        </div>
        <select class="form-control" id="stuClassFilter" onchange="renderStudents()" style="width:140px">
          <option value="">All Classes</option>${U.classOptions()}
        </select>
        <select class="form-control" id="stuStatusFilter" onchange="renderStudents()" style="width:130px">
          <option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <span style="font-size:12px;color:var(--text3);white-space:nowrap" id="stuCountLabel"></span>
      </div></div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Student</th><th>Class</th><th>Roll</th><th>Father</th><th>Phone</th><th>Conveyance</th><th>Status</th>${canWrite?'<th>Actions</th>':''}</tr></thead>
        <tbody id="studentsBody"></tbody>
      </table></div></div>
    </div>`;
  renderStudents();
}

function renderStudents(){
  const q   = (U.el('stuSearch')?.value||'').toLowerCase();
  const cls = U.el('stuClassFilter')?.value||'';
  const st  = U.el('stuStatusFilter')?.value||'';
  const list= S.students.filter(s=>
    (!q  || s.name.toLowerCase().includes(q)||(s.roll||'').toLowerCase().includes(q)||(s.phone||'').includes(q)||(s.father||'').toLowerCase().includes(q)) &&
    (!cls || String(s.class)===cls) &&
    (!st  || s.status===st)
  );
  U.setText('stuCountLabel', `${list.length} / ${S.students.length}`);
  U.setText('stuSubtitle', `${S.students.length} students`);
  const canWrite=!U.isReadOnly();
  const tbody=U.el('studentsBody'); if(!tbody) return;
  if(!list.length){
    tbody.innerHTML=`<tr><td colspan="${canWrite?9:8}"><div class="empty-state"><div class="empty-icon">👨‍🎓</div><div class="empty-title">No students found</div><div class="empty-desc">Try adjusting your search or filters</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML=list.map((s,i)=>`<tr>
    <td style="color:var(--text3);font-size:12px;font-weight:600;width:40px">${i+1}</td>
    <td>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:800;flex-shrink:0">${U.esc(U.avatar(s.name))}</div>
        <div>
          <div class="td-primary" style="cursor:pointer;text-decoration:underline dotted" onclick="viewStudent('${s.id}')" title="View Profile">${U.esc(s.name)}</div>
          <div style="font-size:11px;color:var(--text3)">${U.esc(s.email||'')}</div>
        </div>
      </div>
    </td>
    <td><span class="badge badge-primary">Class ${U.esc(s.class)}</span></td>
    <td class="td-mono">${U.esc(s.roll||'—')}</td>
    <td style="font-size:13px">${U.esc(s.father||'—')}</td>
    <td>${U.esc(s.phone)}</td>
    <td>${s.conveyance>0?U.fmtCurrency(s.conveyance)+'<small style="color:var(--text3)">/mo</small>':'<span style="color:var(--text3)">—</span>'}</td>
    <td><span class="badge ${s.status==='active'?'badge-success':'badge-warning'}">${s.status}</span></td>
    ${canWrite?`<td>
      <div style="display:flex;gap:4px">
        <button class="btn-icon" onclick="openStudentModal('${s.id}')" title="Edit" style="width:30px;height:30px">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
        </button>
        ${S.role==='admin'?`<button class="btn-icon btn-icon-danger" onclick="deleteStudent('${s.id}','${U.esc(s.name.replace(/'/g,"\\'"))}')" title="Delete" style="width:30px;height:30px">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>`:''}
      </div>
    </td>`:''}
  </tr>`).join('');
}

function _populateClassSelects(){
  const opts=U.classOptions();
  [['stuClass','<option value="">Select Class</option>'],
   ['examClass','<option value="">Select Class</option>'],
   ['attClassSel','<option value="">Select Class...</option>'],
  ].forEach(([id,first])=>{
    const el=U.el(id); if(!el) return;
    el.innerHTML=first+opts;
  });
}

function openStudentModal(id=null){
  if(U.isReadOnly()){Toast.error('Access Denied','Viewers cannot modify records');return;}
  ['stuName','stuRoll','stuDob','stuFather','stuMother','stuPhone','stuEmail','stuAddress','stuConveyance','stuBusRoute'].forEach(f=>{const el=U.el(f);if(el)el.value='';});
  U.el('stuStatus').value='active';
  U.el('editStuId').value='';
  _populateClassSelects();

  if(id){
    const s=S.students.find(x=>x.id===id); if(!s) return;
    U.el('editStuId').value=s.id;
    U.el('stuName').value=s.name||'';
    U.el('stuRoll').value=s.roll||'';
    U.el('stuDob').value=s.dob||'';
    U.el('stuFather').value=s.father||'';
    U.el('stuMother').value=s.mother||'';
    U.el('stuPhone').value=s.phone||'';
    U.el('stuEmail').value=s.email||'';
    U.el('stuAddress').value=s.address||'';
    U.el('stuStatus').value=s.status||'active';
    U.el('stuConveyance').value=s.conveyance||0;
    U.el('stuBusRoute').value=s.busRoute||'';
    // Set class after options rendered
    setTimeout(()=>{ const el=U.el('stuClass'); if(el) el.value=s.class||''; },10);
    U.setText('studentModalTitle','Edit Student');
  }else{
    U.setText('studentModalTitle','Add New Student');
  }
  openModal('studentModal');
}

async function saveStudent(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const name  = U.el('stuName').value.trim();
  const cls   = U.el('stuClass').value;
  const phone = U.el('stuPhone').value.trim();
  if(!name)  {Toast.warning('Student name is required');return;}
  if(!cls)   {Toast.warning('Please select a class');return;}
  if(!phone||!U.isPhone(phone)){Toast.warning('Enter valid 10-digit phone number');return;}
  if(S.role==='teacher'&&!U.canAccessClass(cls)){Toast.error('Access Denied',`You are not assigned to Class ${cls}`);return;}

  const btn=U.el('saveStuBtn');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Saving...';
  const payload={
    name, class_name:cls,
    roll_number:  U.el('stuRoll').value.trim(),
    dob:          U.el('stuDob').value||null,
    father_name:  U.el('stuFather').value.trim(),
    mother_name:  U.el('stuMother').value.trim(),
    phone,
    email:        U.el('stuEmail').value.trim(),
    address:      U.el('stuAddress').value.trim(),
    status:       U.el('stuStatus').value,
    conveyance_fee:Number(U.el('stuConveyance').value||0),
    bus_route:    U.el('stuBusRoute').value.trim(),
    school_id:    S.schoolId
  };
  try{
    const eid=U.el('editStuId').value;
    if(eid){
      const{error}=await sb.from('students').update(payload).eq('id',eid).eq('school_id',S.schoolId);
      if(error) throw error;
      Toast.success('Student Updated ✅',name);
    }else{
      const{error}=await sb.from('students').insert(payload);
      if(error) throw error;
      Toast.success('Student Added ✅',name);
    }
    closeModal('studentModal');
    await _loadStudents();
  }catch(err){Toast.error('Save Failed',err.message);console.error(err);}
  finally{btn.disabled=false;btn.innerHTML='💾 Save Student';}
}

async function deleteStudent(id,name){
  if(S.role!=='admin'){Toast.error('Admin Only','Only admins can delete students');return;}
  const ok=await showConfirm('Delete Student',`Delete "${name}"? All fees & attendance will be removed.`,'🗑️');
  if(!ok) return;
  try{
    const{error}=await sb.from('students').delete().eq('id',id).eq('school_id',S.schoolId);
    if(error) throw error;
    Toast.warning('Deleted',name+' removed');
    await _loadStudents(); await _loadFees();
  }catch(err){Toast.error('Delete Failed',err.message);}
}

function viewStudent(id){
  const s=S.students.find(x=>x.id===id); if(!s) return;
  const fees=S.fees.filter(f=>f.studentId===id);
  const paid=fees.filter(f=>f.status==='paid').reduce((t,f)=>t+f.totalAmount,0);
  const pend=fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
  const struct=S.feeStructure[s.class]||{};
  const monthly=Object.values(struct).filter(c=>c.enabled).reduce((t,c)=>t+Number(c.amount||0),0)+s.conveyance;
  const att=Object.entries(S.attendance);
  let ap=0,at=0;
  att.forEach(([,v])=>{ if(v[s.id]){at++;if(v[s.id]==='P')ap++;} });
  const attPct=at>0?Math.round(ap/at*100):0;

  U.el('viewStudentBody').innerHTML=`
    <div style="text-align:center;margin-bottom:20px">
      <div style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:800;margin:0 auto 12px">${U.esc(U.avatar(s.name))}</div>
      <div style="font-size:20px;font-weight:800;color:var(--text1)">${U.esc(s.name)}</div>
      <div style="color:var(--text3);font-size:13px;margin-top:4px">Class ${U.esc(s.class)} ${s.roll?'· Roll '+U.esc(s.roll):''}</div>
      <span class="badge ${s.status==='active'?'badge-success':'badge-warning'}" style="margin-top:8px;font-size:12px">${s.status}</span>
    </div>
    <div style="background:var(--primary-bg);border:1px solid var(--primary-border);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.5px">Monthly Fee</div><div style="font-size:22px;font-weight:800;color:var(--primary)">${U.fmtCurrency(monthly)}</div></div>
      <div style="text-align:right"><div style="font-size:11px;color:var(--text3)">Attendance Rate</div><div style="font-size:20px;font-weight:800;color:${attPct>=75?'var(--success)':attPct>=50?'var(--warning)':'var(--danger)'}">${at?attPct+'%':'—'}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      ${[['👨','Father',s.father],['👩','Mother',s.mother],['📱','Phone',s.phone],['📧','Email',s.email],['🎂','DOB',U.fmtDate(s.dob)],['🚌','Bus Route',s.busRoute],['📍','Address',s.address],['🏫','School ID',s.id?.slice(-8)]]
        .filter(([,,v])=>v)
        .map(([ic,l,v])=>`<div style="background:var(--bg2);border-radius:8px;padding:10px;border:1px solid var(--border)">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:3px">${ic} ${l}</div>
          <div style="font-weight:600;font-size:13px;color:var(--text1);word-break:break-all">${U.esc(v)}</div>
        </div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:var(--success-bg);border:1px solid var(--success-border);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--success)">${U.fmtCurrency(paid)}</div>
        <div style="font-size:11px;color:var(--success);font-weight:600;margin-top:4px">Total Paid</div>
      </div>
      <div style="background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--danger)">${U.fmtCurrency(pend)}</div>
        <div style="font-size:11px;color:var(--danger);font-weight:600;margin-top:4px">Outstanding</div>
      </div>
    </div>
    ${fees.length?`<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text2)">Recent Fee Records</div>
    <div class="table-wrap"><table style="font-size:12px"><thead><tr><th>Month</th><th>Amount</th><th>Mode</th><th>Status</th></tr></thead><tbody>
      ${fees.slice(0,5).map(f=>`<tr>
        <td>${U.fmtMonth(f.month)}</td>
        <td style="font-weight:700">${U.fmtCurrency(f.totalAmount)}</td>
        <td>${f.mode}</td>
        <td><span class="badge ${f.status==='paid'?'badge-success':f.status==='partial'?'badge-warning':'badge-danger'}">${f.status}</span></td>
      </tr>`).join('')}
    </tbody></table></div>`:''}`;

  U.el('editFromView').onclick=()=>{ closeModal('viewStudentModal'); openStudentModal(id); };
  openModal('viewStudentModal');
}

// ══════════════════════════════════════════════════════
// FEE STRUCTURE
// ══════════════════════════════════════════════════════
function renderFeeStructureSection(){
  if(S.role==='viewer'){
    U.el('contentArea').innerHTML=`<div class="empty-state"><div class="empty-icon">🔒</div><div class="empty-title">Viewer Access</div><div class="empty-desc">You can view but not edit fee structures</div></div>`;
  }
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Fee Structure</div><div style="font-size:13px;color:var(--text3)">Monthly fee per class component</div></div>
        ${S.role==='admin'?`<button class="btn btn-primary" onclick="saveFeeStructure()">💾 Save All Changes</button>`:''}
      </div>
      <div style="background:var(--primary-bg);border:1px solid var(--primary-border);border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:var(--primary)">
        ℹ️ Set fee amounts per class. These auto-fill when recording payments.
      </div>
      <div id="feeStructGrid"></div>
    </div>`;
  _renderFeeStructGrid();
}

function _renderFeeStructGrid(){
  const grid=U.el('feeStructGrid'); if(!grid) return;
  const isAdmin=S.role==='admin';
  const classes=S.role==='teacher'&&S.assignedClasses?.length ? S.assignedClasses : Array.from({length:12},(_,i)=>String(i+1));
  grid.innerHTML=classes.map(cls=>{
    const struct=S.feeStructure[cls]||{};
    const total=FEE_COMPONENTS.filter(c=>struct[c.key]?.enabled).reduce((t,c)=>t+Number(struct[c.key]?.amount||0),0);
    return `<div class="card mb-4">
      <div class="card-header">
        <span class="card-title">📚 Class ${cls}</span>
        <span class="badge badge-primary">Total: ${U.fmtCurrency(total)}/month</span>
      </div>
      <div class="card-body">
        <div class="grid-3">${FEE_COMPONENTS.map(comp=>{
          const saved=struct[comp.key]||{};
          const enabled=saved.enabled??comp.alwaysOn;
          const amount=Number(saved.amount||0);
          return `<div style="padding:12px;border-radius:8px;border:1.5px solid ${enabled?'var(--primary-border)':'var(--border)'};background:${enabled?'var(--primary-bg)':'var(--bg2)'};transition:all .2s">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <label style="font-size:12px;font-weight:700;color:var(--text2)">${comp.label}</label>
              <input type="checkbox" id="fs_${cls}_${comp.key}_en" ${enabled?'checked':''} ${!isAdmin||comp.alwaysOn?'disabled':''} onchange="_feeStructChanged('${cls}','${comp.key}',this)"/>
            </div>
            <input type="number" class="form-control" id="fs_${cls}_${comp.key}_amt" value="${amount}" min="0" placeholder="₹0" ${!isAdmin?'disabled':''} style="font-size:13px" oninput="_feeStructChanged('${cls}','${comp.key}',null)"/>
          </div>`;
        }).join('')}</div>
      </div>
    </div>`;
  }).join('');
}

function _feeStructChanged(cls,key,chkEl){
  if(!S.feeStructure[cls]) S.feeStructure[cls]={};
  const en=U.el(`fs_${cls}_${key}_en`)?.checked??false;
  const amt=Number(U.el(`fs_${cls}_${key}_amt`)?.value||0);
  const comp=FEE_COMPONENTS.find(c=>c.key===key);
  S.feeStructure[cls][key]={label:comp?.label||key,amount:amt,enabled:en,alwaysOn:comp?.alwaysOn||false};
}

async function saveFeeStructure(){
  if(S.role!=='admin'){Toast.error('Admin Only');return;}
  const rows=[];
  Object.entries(S.feeStructure).forEach(([cls,comps])=>{
    Object.entries(comps).forEach(([key,val])=>{
      rows.push({school_id:S.schoolId,class_name:cls,component_key:key,component_label:val.label,amount:val.amount,enabled:val.enabled,always_on:val.alwaysOn});
    });
  });
  if(!rows.length){Toast.warning('No changes to save');return;}
  try{
    const{error}=await sb.from('fee_structures').upsert(rows,{onConflict:'school_id,class_name,component_key'});
    if(error) throw error;
    Toast.success('Fee Structure Saved ✅');
  }catch(err){Toast.error('Save Failed',err.message);}
}

// ══════════════════════════════════════════════════════
// FEE MANAGEMENT
// ══════════════════════════════════════════════════════
function renderFeesSection(){
  const canWrite=!U.isReadOnly();
  const paid=S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+f.totalAmount,0);
  const pend=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
  const defs=[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))].length;
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Fee Management</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="_exportFeesExcel()">📊 Excel</button>
          <button class="btn btn-outline btn-sm" onclick="_exportFeesPDF()">📄 PDF</button>
          ${canWrite?`<button class="btn btn-primary" onclick="openFeeModal()">+ Record Payment</button>`:`<span class="badge badge-gray">👁️ View Only</span>`}
        </div>
      </div>
      <div class="grid-3 mb-6">
        <div class="stat-card"><div class="stat-value" style="color:var(--success)">${U.fmtCurrency(paid)}</div><div class="stat-label">Total Collected</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${U.fmtCurrency(pend)}</div><div class="stat-label">Outstanding</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${defs}</div><div class="stat-label">Defaulters</div></div>
      </div>
      <div class="card mb-4"><div class="card-body-sm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input class="form-control" id="feeSearch" placeholder="Search student name..." style="max-width:220px" oninput="renderFees()"/>
        <select class="form-control" id="feeClassFilter" onchange="renderFees()" style="width:140px">
          <option value="">All Classes</option>${U.classOptions()}
        </select>
        <select class="form-control" id="feeStatusFilter" onchange="renderFees()" style="width:130px">
          <option value="">All Status</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="partial">Partial</option>
        </select>
        <input type="month" class="form-control" id="feeMonthFilter" onchange="renderFees()" style="width:155px"/>
        <span style="font-size:12px;color:var(--text3)" id="feeCountLabel"></span>
      </div></div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Receipt</th><th>Student</th><th>Class</th><th>Month</th><th>Amount</th><th>Mode</th><th>Status</th></tr></thead>
        <tbody id="feesBody"></tbody>
      </table></div></div>
    </div>`;
  renderFees();
}

function renderFees(){
  const q  =(U.el('feeSearch')?.value||'').toLowerCase();
  const cls=U.el('feeClassFilter')?.value||'';
  const st =U.el('feeStatusFilter')?.value||'';
  const mo =U.el('feeMonthFilter')?.value||'';
  const list=S.fees.filter(f=>
    (!q  || f.studentName.toLowerCase().includes(q)) &&
    (!cls || String(f.studentClass)===cls) &&
    (!st  || f.status===st) &&
    (!mo  || f.month===mo)
  );
  U.setText('feeCountLabel', `${list.length} records`);
  const modeLabel={cash:'💵 Cash',upi:'📱 UPI',bank:'🏦 Bank',cheque:'📋 Cheque',online:'💳 Online'};
  const tbody=U.el('feesBody'); if(!tbody) return;
  if(!list.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">No fee records found</div></div></td></tr>`;return;}
  tbody.innerHTML=list.map(f=>`<tr>
    <td class="td-mono" style="font-size:12px">${U.esc((f.receipt||'').slice(-14)||'—')}</td>
    <td class="td-primary">${U.esc(f.studentName)}</td>
    <td><span class="badge badge-primary">Class ${U.esc(f.studentClass||'?')}</span></td>
    <td>${U.esc(U.fmtMonth(f.month))}</td>
    <td style="font-weight:800;font-size:15px;color:var(--text1)">${U.fmtCurrency(f.totalAmount)}</td>
    <td style="font-size:13px">${U.esc(modeLabel[f.mode]||f.mode||'—')}</td>
    <td><span class="badge ${f.status==='paid'?'badge-success':f.status==='partial'?'badge-warning':'badge-danger'}">${f.status}</span></td>
  </tr>`).join('');
}

function _resetFeeBreakdown(){
  _feeBreakdown={};
  FEE_COMPONENTS.forEach(c=>{_feeBreakdown[c.key]={label:c.label,amount:0,enabled:c.alwaysOn};});
}

function openFeeModal(){
  if(U.isReadOnly()){Toast.error('Access Denied','Viewers cannot record payments');return;}
  U.el('feeMonth').value=U.month();
  U.el('feeDate').value=U.today();
  U.el('feeRef').value='';
  U.el('feeNotes').value='';
  U.el('feeStatus').value='paid';
  U.el('feeMode').value='cash';
  const sel=U.el('feeStu');
  sel.innerHTML='<option value="">Select student...</option>'+
    S.students.filter(s=>s.status==='active').sort((a,b)=>a.name.localeCompare(b.name))
    .map(s=>`<option value="${s.id}">${U.esc(s.name)} — Class ${s.class}${s.roll?' ('+U.esc(s.roll)+')':''}</option>`).join('');
  _resetFeeBreakdown();
  _renderFeeBreakdownUI();
  openModal('feeModal');
}

function onFeeStudentChange(){
  const id=U.el('feeStu').value;
  _resetFeeBreakdown();
  if(id){
    const s=S.students.find(x=>x.id===id); if(!s) return;
    const struct=S.feeStructure[s.class]||{};
    FEE_COMPONENTS.forEach(comp=>{
      const fs=struct[comp.key];
      _feeBreakdown[comp.key]={
        label:comp.label,
        amount: comp.key==='conveyance' ? s.conveyance : Number(fs?.amount||0),
        enabled: comp.key==='conveyance' ? s.conveyance>0 : (fs?.enabled||comp.alwaysOn)
      };
    });
  }
  _renderFeeBreakdownUI();
}

function _renderFeeBreakdownUI(){
  const el=U.el('feeBreakdownGrid'); if(!el) return;
  let total=0;
  Object.values(_feeBreakdown).forEach(c=>{if(c.enabled) total+=Number(c.amount||0);});
  el.innerHTML=FEE_COMPONENTS.map(comp=>{
    const c=_feeBreakdown[comp.key]||{amount:0,enabled:false};
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" id="fb_${comp.key}" ${c.enabled?'checked':''} onchange="_fbToggle('${comp.key}')"/>
      <label for="fb_${comp.key}" style="flex:1;font-size:13px;font-weight:500;color:var(--text2)">${comp.label}</label>
      <input type="number" class="form-control" id="fb_${comp.key}_amt" value="${c.amount||0}" min="0" style="width:110px;text-align:right;font-weight:700" oninput="_fbAmt('${comp.key}')"/>
    </div>`;
  }).join('')+`
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;margin-top:4px">
    <span style="font-weight:700;color:var(--text2)">Total Amount</span>
    <span style="font-size:20px;font-weight:800;color:var(--success)">${U.fmtCurrency(total)}</span>
  </div>`;
}

function _fbToggle(key){ if(_feeBreakdown[key]){_feeBreakdown[key].enabled=U.el('fb_'+key)?.checked||false;_renderFeeBreakdownUI();} }
function _fbAmt(key)   { if(_feeBreakdown[key]){_feeBreakdown[key].amount=Number(U.el('fb_'+key+'_amt')?.value||0);_renderFeeBreakdownUI();} }

async function saveFee(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const stuId=U.el('feeStu').value;
  const month=U.el('feeMonth').value;
  if(!stuId){Toast.warning('Please select a student');return;}
  if(!month){Toast.warning('Please select a month');return;}
  let total=0;
  FEE_COMPONENTS.forEach(c=>{if(_feeBreakdown[c.key]?.enabled) total+=Number(_feeBreakdown[c.key].amount||0);});
  if(!total){Toast.warning('Total fee amount is ₹0. Enable at least one component.');return;}

  const btn=U.el('saveFeeBtnModal');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Saving...';
  const stu=S.students.find(s=>s.id===stuId);
  const receipt=`RCP-${month.replace('-','')}-${(S.fees.length+1).toString().padStart(4,'0')}-${Date.now().toString().slice(-4)}`;
  try{
    const{error}=await sb.from('fee_payments').insert({
      school_id:S.schoolId, student_id:stuId,
      receipt_number:receipt, month,
      total_amount:total,
      breakdown:JSON.parse(JSON.stringify(_feeBreakdown)),
      payment_mode:U.el('feeMode').value,
      payment_date:U.el('feeDate').value||U.today(),
      status:U.el('feeStatus').value,
      recorded_by:S.user.id
    });
    if(error) throw error;
    Toast.success('Payment Recorded ✅',`${U.fmtCurrency(total)} for ${U.esc(stu?.name||'')}`);
    closeModal('feeModal');
    await _loadFees();
    renderFeesSection();
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
        <button class="btn btn-outline btn-sm" onclick="_exportAttPDF()">📄 Export PDF</button>
      </div>
      <div class="card mb-4"><div class="card-body-sm" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <select class="form-control" id="attClassSel" style="width:155px" onchange=""><option value="">Select Class...</option>${U.classOptions()}</select>
        <input type="date" class="form-control" id="attDate" value="${U.today()}" max="${U.today()}" style="width:170px"/>
        <button class="btn btn-primary" onclick="_loadAttendance()">📋 Load Students</button>
        ${!U.isReadOnly()?`<button class="btn btn-success" id="saveAttBtn" onclick="saveAttendance()" disabled>💾 Save</button>`:''}
        <span style="font-size:13px;color:var(--text3);margin-left:auto" id="attSummaryLine"></span>
      </div></div>
      <div class="grid-4 mb-4 hidden" id="attStats">
        <div class="stat-card"><div class="stat-value" id="aTotal">0</div><div class="stat-label">Total</div></div>
        <div class="stat-card" style="border-left:3px solid var(--success)"><div class="stat-value" id="aPresent" style="color:var(--success)">0</div><div class="stat-label">Present ✅</div></div>
        <div class="stat-card" style="border-left:3px solid var(--danger)"><div class="stat-value" id="aAbsent" style="color:var(--danger)">0</div><div class="stat-label">Absent ❌</div></div>
        <div class="stat-card" style="border-left:3px solid var(--warning)"><div class="stat-value" id="aLate" style="color:var(--warning)">0</div><div class="stat-label">Late ⏰</div></div>
      </div>
      <div class="card"><div class="card-body" id="attList">
        <div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Select a Class</div><div class="empty-desc">Choose a class and date, then click "Load Students"</div></div>
      </div></div>
    </div>`;
}

function _loadAttendance(){
  const cls =U.el('attClassSel').value;
  const date=U.el('attDate').value||U.today();
  if(!cls){Toast.warning('Please select a class first');return;}
  if(!U.canAccessClass(cls)){Toast.error('Access Denied',`Not assigned to Class ${cls}`);return;}
  const students=S.students.filter(s=>String(s.class)===cls&&s.status==='active');
  if(!students.length){
    U.el('attList').innerHTML=`<div class="empty-state"><div class="empty-icon">🤷</div><div class="empty-title">No active students in Class ${cls}</div></div>`;
    return;
  }
  const key=date+'_'+cls;
  const saved=S.attendance[key]||{};
  S.tempAtt={...saved};
  U.el('attStats').classList.remove('hidden');
  const saveBtn=U.el('saveAttBtn'); if(saveBtn) saveBtn.disabled=false;
  _updateAttStats(students.length);
  const readOnly=U.isReadOnly();
  const alreadySaved=Object.keys(saved).length>0;
  U.el('attList').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg2);border-radius:8px;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="font-size:13px;font-weight:600;color:var(--text2)">
        Class ${cls} · ${U.fmtDate(date)} · ${students.length} students
        ${alreadySaved?'<span class="badge badge-success" style="margin-left:8px;font-size:11px">✓ Previously Saved</span>':''}
      </div>
      ${!readOnly?`<div style="display:flex;gap:8px">
        <button class="btn btn-sm" style="background:var(--success-bg);color:var(--success);border:1px solid var(--success-border)" onclick="_markAll('P',${students.length})">✅ All Present</button>
        <button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border)" onclick="_markAll('A',${students.length})">❌ All Absent</button>
      </div>`:''}
    </div>
    <div class="att-grid">
      ${students.map((s,i)=>`<div class="att-row" id="row-${s.id}">
        <span style="color:var(--text3);font-size:12px;font-weight:600;width:24px;flex-shrink:0">${i+1}</span>
        <div class="att-info">
          <div class="att-name">${U.esc(s.name)}</div>
          <div class="att-roll">Roll: ${U.esc(s.roll||'—')} · ${U.esc(s.phone)}</div>
        </div>
        <div class="att-btns">
          <button class="att-btn ${S.tempAtt[s.id]==='P'?'present':''}" onclick="${readOnly?'':` _markAtt('${s.id}','P',${students.length})`}" ${readOnly?'disabled':''}>P</button>
          <button class="att-btn ${S.tempAtt[s.id]==='A'?'absent':''}" onclick="${readOnly?'':` _markAtt('${s.id}','A',${students.length})`}" ${readOnly?'disabled':''}>A</button>
          <button class="att-btn ${S.tempAtt[s.id]==='L'?'late':''}"   onclick="${readOnly?'':` _markAtt('${s.id}','L',${students.length})`}" ${readOnly?'disabled':''}>L</button>
        </div>
      </div>`).join('')}
    </div>`;
}

function _markAtt(stuId,status,total){
  S.tempAtt[stuId]=status;
  const row=document.getElementById('row-'+stuId);
  if(row){
    row.querySelectorAll('.att-btn').forEach(b=>b.classList.remove('present','absent','late'));
    const map={P:'present',A:'absent',L:'late'};
    const idx={P:0,A:1,L:2}[status];
    if(idx!==undefined) row.querySelectorAll('.att-btn')[idx]?.classList.add(map[status]);
  }
  _updateAttStats(total);
}

function _markAll(status,total){
  const cls=U.el('attClassSel')?.value; if(!cls) return;
  S.students.filter(s=>String(s.class)===cls&&s.status==='active').forEach(s=>{ S.tempAtt[s.id]=status; });
  _loadAttendance();
}

function _updateAttStats(total){
  const vals=Object.values(S.tempAtt);
  const p=vals.filter(v=>v==='P').length;
  const a=vals.filter(v=>v==='A').length;
  const l=vals.filter(v=>v==='L').length;
  U.setText('aTotal',total); U.setText('aPresent',p); U.setText('aAbsent',a); U.setText('aLate',l);
  const pct=total>0?Math.round(p/total*100):0;
  const lbl=U.el('attSummaryLine');
  if(lbl) lbl.textContent=`${Object.keys(S.tempAtt).length}/${total} marked · ${pct}% present`;
}

async function saveAttendance(){
  if(U.isReadOnly()) return;
  const cls =U.el('attClassSel')?.value;
  const date=U.el('attDate')?.value||U.today();
  if(!cls){Toast.warning('Select a class first');return;}
  if(!Object.keys(S.tempAtt).length){Toast.warning('No attendance marked yet');return;}
  const key=date+'_'+cls;
  S.attendance[key]=JSON.parse(JSON.stringify(S.tempAtt));
  _saveAtt();
  const upserts=Object.entries(S.tempAtt).map(([stuId,status])=>({
    school_id:S.schoolId, student_id:stuId, class_name:cls,
    record_date:date, status, marked_by:S.user.id
  }));
  try{
    const{error}=await sb.from('attendance_records').upsert(upserts,{onConflict:'student_id,record_date'});
    if(error) console.error('att save:',error);
  }catch(e){console.error(e);}
  Toast.success('Attendance Saved ✅',`Class ${cls} · ${date} · ${upserts.length} students`);
  _loadAttendance();
}

// ══════════════════════════════════════════════════════
// EXAMS & RESULTS
// ══════════════════════════════════════════════════════
function renderExamsSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Exams & Results</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ${S.examTab==='schedule'?'btn-primary':'btn-outline'} btn-sm" onclick="S.examTab='schedule';renderExamsSection()">📅 Schedule</button>
          <button class="btn ${S.examTab==='results'?'btn-primary':'btn-outline'} btn-sm" onclick="S.examTab='results';renderExamsSection()">📊 Results</button>
          ${!U.isReadOnly()?`<button class="btn btn-primary" onclick="openExamModal()">+ Create Exam</button>`:''}
        </div>
      </div>
      <div id="examContent"></div>
    </div>`;
  if(S.examTab==='results') _renderExamResults(U.el('examContent'));
  else _renderExamSchedule(U.el('examContent'));
}

function _renderExamSchedule(el){
  const today=U.today();
  const upcoming=(S.exams||[]).filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const past    =(S.exams||[]).filter(e=>e.date<today).sort((a,b)=>b.date.localeCompare(a.date));
  if(!S.exams?.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">No exams yet</div><div class="empty-desc">Click "+ Create Exam" to schedule one</div></div>';return;}
  const typeColor={written:'badge-primary',mcq:'badge-purple',practical:'badge-warning'};
  const renderList=(list,title)=>{
    if(!list.length) return '';
    return `<div style="margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:var(--text2);margin-bottom:12px">${title}</div>
      <div class="grid-3">${list.map(e=>`
        <div style="background:var(--bg1);border:1.5px solid var(--border);border-radius:var(--radius-lg);padding:18px;transition:all .2s" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div>
              <div style="font-weight:800;font-size:15px;color:var(--text1)">${U.esc(e.name)}</div>
              <div style="font-size:12px;color:var(--text3);margin-top:2px">${U.esc(e.subject)} · Class ${U.esc(e.class)}</div>
            </div>
            <span class="badge ${typeColor[e.type]||'badge-gray'}">${e.type||'written'}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
            <span class="badge badge-gray">📅 ${U.fmtDate(e.date)}</span>
            <span class="badge badge-gray">⏱ ${e.duration}m</span>
            <span class="badge badge-gray">Max ${e.maxMarks}</span>
            <span class="badge badge-gray">Pass ${e.passMarks}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-xs btn-primary" onclick="openResultEntry('${e.id}')">📊 Enter Marks</button>
            ${!U.isReadOnly()?`
              <button class="btn btn-xs btn-outline" onclick="openExamModal('${e.id}')">✏️</button>
              <button class="btn btn-xs btn-outline" style="color:var(--danger);border-color:var(--danger-border)" onclick="_deleteExam('${e.id}')">🗑️</button>`:''}
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  };
  el.innerHTML=renderList(upcoming,'📅 Upcoming Exams')+renderList(past,'📂 Past Exams');
}

function _renderExamResults(el){
  if(!S.exams?.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No exams to show results for</div></div>';return;}
  el.innerHTML=`<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Exam</th><th>Subject</th><th>Class</th><th>Date</th><th>Students</th><th>Avg Score</th><th>Pass Rate</th><th>Action</th></tr></thead>
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
        <td style="font-size:12px">${U.fmtDate(e.date)}</td>
        <td>${stuCount}</td>
        <td style="font-weight:700;color:${g.c}">${stuCount?avg+'/'+e.maxMarks:'—'}</td>
        <td>${stuCount?`<span class="badge ${passRate>=50?'badge-success':'badge-danger'}">${passRate}%</span>`:'—'}</td>
        <td><button class="btn btn-xs btn-primary" onclick="openResultEntry('${e.id}')">📊 Marks</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
}

function openExamModal(id=null){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  U.el('editExamId').value='';
  ['examName','examSubject','examDate'].forEach(f=>{const el=U.el(f);if(el)el.value='';});
  U.el('examMaxMarks').value=100; U.el('examPassMarks').value=33;
  U.el('examDuration').value=180; U.el('examType').value='written';
  _populateClassSelects();
  if(id){
    const e=(S.exams||[]).find(x=>x.id===id); if(!e) return;
    U.el('editExamId').value=e.id;
    U.el('examName').value=e.name; U.el('examSubject').value=e.subject;
    U.el('examDate').value=e.date; U.el('examMaxMarks').value=e.maxMarks;
    U.el('examPassMarks').value=e.passMarks; U.el('examDuration').value=e.duration;
    U.el('examType').value=e.type||'written';
    setTimeout(()=>{ const el=U.el('examClass'); if(el) el.value=e.class; },10);
    U.setText('examModalTitle','Edit Exam');
  }else{
    U.el('examDate').value=U.today();
    U.setText('examModalTitle','Create Exam');
  }
  openModal('examModal');
}

async function saveExam(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const name =(U.el('examName')?.value||'').trim();
  const subj =(U.el('examSubject')?.value||'').trim();
  const cls  = U.el('examClass')?.value||'';
  const date = U.el('examDate')?.value||'';
  if(!name||!subj||!cls||!date){Toast.warning('Please fill all required fields');return;}
  if(!U.canAccessClass(cls)){Toast.error('Access Denied',`Not assigned to Class ${cls}`);return;}
  const id=U.el('editExamId')?.value||'';
  const payload={school_id:S.schoolId,name,subject:subj,class_name:cls,exam_date:date,
    max_marks:Number(U.el('examMaxMarks')?.value)||100,
    pass_marks:Number(U.el('examPassMarks')?.value)||33,
    duration_minutes:Number(U.el('examDuration')?.value)||180,
    exam_type:U.el('examType')?.value||'written'};
  try{
    if(id){const{error}=await sb.from('exams').update(payload).eq('id',id).eq('school_id',S.schoolId);if(error)throw error;Toast.success('Exam Updated ✅');}
    else{const{error}=await sb.from('exams').insert(payload);if(error)throw error;Toast.success('Exam Created ✅',name);}
    closeModal('examModal');
    await _loadExams();
    renderExamsSection();
  }catch(err){Toast.error('Failed',err.message);}
}

async function _deleteExam(id){
  const ok=await showConfirm('Delete Exam','Delete this exam and all entered results?','🗑️');
  if(!ok) return;
  try{
    const{error}=await sb.from('exams').delete().eq('id',id).eq('school_id',S.schoolId);
    if(error) throw error;
    delete S.results[id]; _saveRes();
    Toast.warning('Exam deleted');
    await _loadExams(); renderExamsSection();
  }catch(err){Toast.error('Delete Failed',err.message);}
}

function openResultEntry(examId){
  const exam=(S.exams||[]).find(e=>e.id===examId); if(!exam) return;
  const students=S.students.filter(s=>String(s.class)===String(exam.class)&&s.status==='active');
  if(!students.length){Toast.warning('No active students in Class '+exam.class);return;}
  if(!S.results) S.results={};
  const existing=S.results[examId]||{};
  U.el('resultModalBody').innerHTML=`
    <div style="background:var(--primary-bg);border:1px solid var(--primary-border);border-radius:8px;padding:12px 16px;margin-bottom:16px">
      <div style="font-size:14px;font-weight:700">${U.esc(exam.name)}</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">${U.esc(exam.subject)} · Class ${U.esc(exam.class)} · Max: ${exam.maxMarks} marks · Pass: ${exam.passMarks}</div>
    </div>
    <input type="hidden" id="rExamId" value="${examId}"/>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Student</th><th>Roll</th><th>Marks (out of ${exam.maxMarks})</th><th>Grade</th></tr></thead>
      <tbody>${students.map((s,i)=>{
        const m=existing[s.id]?.marks??'';
        const pct=m!==''?Math.round(Number(m)/exam.maxMarks*100):null;
        const g=pct!==null?GRADE_MAP(pct):{g:'—',c:'var(--text3)'};
        return `<tr>
          <td style="color:var(--text3);width:32px">${i+1}</td>
          <td class="td-primary">${U.esc(s.name)}</td>
          <td class="td-mono">${U.esc(s.roll||'—')}</td>
          <td><input type="number" class="form-control" id="mk-${s.id}" value="${m}" min="0" max="${exam.maxMarks}" placeholder="—" style="max-width:130px;font-weight:700" oninput="_liveGrade('${s.id}','${examId}')"/></td>
          <td id="grd-${s.id}" style="font-weight:800;color:${g.c};font-size:16px">${g.g}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  openModal('resultModal');
}

function _liveGrade(stuId,examId){
  const exam=(S.exams||[]).find(e=>e.id===examId); if(!exam) return;
  const m=Number(U.el('mk-'+stuId)?.value||0);
  if(m<0||m>exam.maxMarks) return;
  const pct=Math.round(m/exam.maxMarks*100);
  const g=GRADE_MAP(pct);
  const el=U.el('grd-'+stuId); if(el){el.textContent=g.g;el.style.color=g.c;}
}

function saveResults(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const examId=U.el('rExamId')?.value; if(!examId) return;
  const exam=(S.exams||[]).find(e=>e.id===examId); if(!exam) return;
  const students=S.students.filter(s=>String(s.class)===String(exam.class)&&s.status==='active');
  if(!S.results) S.results={};
  if(!S.results[examId]) S.results[examId]={};
  let saved=0;
  students.forEach(s=>{
    const el=U.el('mk-'+s.id);
    if(el&&el.value!==''){ S.results[examId][s.id]={marks:Number(el.value),savedAt:new Date().toISOString()}; saved++; }
  });
  _saveRes();
  closeModal('resultModal');
  Toast.success(`Results Saved ✅`,`${saved} students`);
  if(S.examTab==='results') _renderExamResults(U.el('examContent'));
}

// ══════════════════════════════════════════════════════
// TIMETABLE
// ══════════════════════════════════════════════════════
function renderTimetableSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Smart Timetable</div><div style="font-size:13px;color:var(--text3)">Weekly class schedule</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="form-control" id="ttClass" style="width:150px" onchange="_renderTimetable()">${U.classOptions()}</select>
          ${!U.isReadOnly()?`<button class="btn btn-primary" onclick="_saveTimetable()">💾 Save</button>`:''}
          <button class="btn btn-outline btn-sm" onclick="_exportTTPDF()">📄 PDF</button>
        </div>
      </div>
      <div class="card"><div class="table-wrap" style="overflow-x:auto"><table id="ttTable"></table></div></div>
    </div>`;
  _renderTimetable();
}

function _renderTimetable(){
  const cls=U.el('ttClass')?.value||'1';
  const tt=S.timetables[cls]||{};
  const readOnly=U.isReadOnly();
  const tbl=U.el('ttTable'); if(!tbl) return;
  tbl.innerHTML=`
    <thead><tr><th style="min-width:80px;background:var(--bg2)">Period</th>${DAYS.map(d=>`<th style="min-width:120px;background:var(--bg2)">${d}</th>`).join('')}</tr></thead>
    <tbody>${PERIODS.map((time,pi)=>`<tr>
      <td style="font-weight:700;font-size:12px;color:var(--text3);background:var(--bg2);white-space:nowrap">${time}</td>
      ${DAYS.map((_,di)=>{
        const val=(tt[di]||{})[pi]||'';
        return `<td><input type="text" class="form-control" id="tt_${di}_${pi}" value="${U.esc(val)}" placeholder="Subject" style="font-size:12px;padding:6px 8px;min-width:100%" ${readOnly?'disabled':''}/></td>`;
      }).join('')}
    </tr>`).join('')}</tbody>`;
}

function _saveTimetable(){
  if(U.isReadOnly()) return;
  const cls=U.el('ttClass')?.value||'1';
  S.timetables[cls]={};
  DAYS.forEach((_,di)=>{
    S.timetables[cls][di]={};
    PERIODS.forEach((_,pi)=>{
      const v=U.el(`tt_${di}_${pi}`)?.value.trim()||'';
      if(v) S.timetables[cls][di][pi]=v;
    });
  });
  _saveTT();
  Toast.success('Timetable Saved ✅',`Class ${cls}`);
}

// ══════════════════════════════════════════════════════
// WHATSAPP / ALERTS
// ══════════════════════════════════════════════════════
function renderWhatsappSection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-title" style="margin-bottom:20px">Parent Notifications</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <div class="card mb-4"><div class="card-header"><span class="card-title">📲 Compose Alert</span></div><div class="card-body">
            <div class="form-group">
              <label class="form-label">Alert Type</label>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px" id="waTypeBtns">
                ${[['fee','💰','Fee Reminder'],['absent','⚠️','Absent Alert'],['holiday','🏖️','Holiday'],['exam','📝','Exam Alert'],['result','🏆','Result'],['custom','✏️','Custom']].map(([t,ic,lb])=>`
                  <div onclick="_selectWaType('${t}')" id="waType_${t}" style="padding:10px 6px;border-radius:8px;border:1.5px solid ${t===_waType?'var(--primary)':'var(--border)'};background:${t===_waType?'var(--primary-bg)':'var(--bg2)'};cursor:pointer;text-align:center;transition:all .15s">
                    <div style="font-size:20px">${ic}</div>
                    <div style="font-size:11px;font-weight:600;margin-top:4px;color:var(--text2)">${lb}</div>
                  </div>`).join('')}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Send To</label>
              <select class="form-control" id="waRecipient" onchange="_updateWaCount()">
                <option value="all">All Active Parents</option>
                <option value="class">Specific Class</option>
                <option value="defaulters">Fee Defaulters Only</option>
              </select>
            </div>
            <div class="form-group hidden" id="waClassGroup">
              <label class="form-label">Select Class</label>
              <select class="form-control" id="waClass" onchange="_updateWaCount()">${U.classOptions()}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Message</label>
              <textarea class="form-control" id="waMsg" rows="6" placeholder="Type your message..." oninput="_updateWaCount()"></textarea>
              <div style="font-size:12px;color:var(--text3);margin-top:4px;display:flex;justify-content:space-between">
                <span id="waCharCount">0 chars</span>
                <span id="waParentCount">~0 parents</span>
              </div>
            </div>
            <div style="background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--success-dark)">
              💡 Save the alert record, then use WhatsApp button to send manually via WhatsApp Web.
            </div>
            ${!U.isReadOnly()?`<button class="btn btn-success w-full" style="padding:12px;font-size:14px;margin-bottom:10px" onclick="_sendAlert()">💾 Save & Prepare Alert</button>`:''}
            <button class="btn w-full btn-outline" style="border-color:#25D366;color:#25D366;padding:11px" onclick="_openWhatsApp()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Send via WhatsApp Web
            </button>
          </div></div>
        </div>
        <div>
          <div class="card"><div class="card-header"><span class="card-title">📜 Alert History</span><span class="badge badge-primary" id="totalAlertsBadge">${S.alerts.length} sent</span></div>
          <div class="card-body" id="alertHistoryList" style="max-height:580px;overflow-y:auto"></div></div>
        </div>
      </div>
    </div>`;
  _setWaTemplate();
  _updateWaCount();
  _renderAlerts();
}

function _selectWaType(type){
  _waType=type;
  document.querySelectorAll('[id^="waType_"]').forEach(el=>{
    const t=el.id.replace('waType_','');
    el.style.borderColor=t===type?'var(--primary)':'var(--border)';
    el.style.background=t===type?'var(--primary-bg)':'var(--bg2)';
  });
  _setWaTemplate();
}

function _setWaTemplate(){
  const school=S.settings.schoolName||'Our School';
  const today=U.fmtDate(U.today());
  const tpls={
    fee:`Dear Parent,\n\nThis is a reminder that the monthly fee for ${school} is due. Kindly clear the pending dues at the earliest to avoid any inconvenience.\n\nPlease contact the school office for any queries.\n\nThank you,\n${school} Administration`,
    absent:`Dear Parent,\n\nWe regret to inform you that your ward was absent from ${school} today (${today}). Regular attendance is essential for academic progress.\n\nKindly ensure your ward attends school regularly.\n\nRegards,\n${school}`,
    holiday:`Dear Parent,\n\n${school} will remain closed for an upcoming holiday. Classes will resume as per the school schedule.\n\nFor any queries, contact the school office.\n\nRegards,\n${school} Administration`,
    exam:`Dear Parent,\n\nExaminations are scheduled at ${school}. Kindly ensure your ward is well prepared and arrives at school on time with all necessary stationery.\n\nBest wishes,\n${school}`,
    result:`Dear Parent,\n\nThe examination results for ${school} are now available. Please visit the school office to collect the report card during working hours.\n\nRegards,\n${school} Administration`,
    custom:''
  };
  const el=U.el('waMsg'); if(el) el.value=tpls[_waType]||'';
  _updateWaCount();
}

function _updateWaCount(){
  const recip=U.el('waRecipient')?.value||'all';
  const grp=U.el('waClassGroup');
  if(grp) grp.classList.toggle('hidden',recip!=='class');
  let count=0;
  if(recip==='all') count=S.students.filter(s=>s.status==='active'&&s.phone).length;
  else if(recip==='class'){const cls=U.el('waClass')?.value||'';count=S.students.filter(s=>s.status==='active'&&s.phone&&String(s.class)===cls).length;}
  else if(recip==='defaulters'){const defs=new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId));count=S.students.filter(s=>defs.has(s.id)&&s.phone).length;}
  const msg=U.el('waMsg')?.value||'';
  U.setText('waCharCount', msg.length+' chars');
  U.setText('waParentCount', '~'+count+' parents');
}

async function _sendAlert(){
  if(U.isReadOnly()){Toast.error('Access Denied');return;}
  const msg=(U.el('waMsg')?.value||'').trim();
  if(!msg){Toast.warning('Please write a message first');return;}
  const recip=U.el('waRecipient')?.value||'all';
  let count=0;
  if(recip==='all') count=S.students.filter(s=>s.status==='active'&&s.phone).length;
  else if(recip==='class'){const cls=U.el('waClass')?.value||'';count=S.students.filter(s=>s.status==='active'&&s.phone&&String(s.class)===cls).length;}
  else{const defs=new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId));count=S.students.filter(s=>defs.has(s.id)&&s.phone).length;}
  try{
    const{error}=await sb.from('alerts').insert({school_id:S.schoolId,alert_type:_waType,message:msg,recipient_type:recip,recipient_count:count,sent_by:S.user.id});
    if(error) throw error;
    await _loadAlerts();
    _renderAlerts();
    Toast.success('Alert Saved ✅',`${count} parents · Click WhatsApp button to send`);
  }catch(err){Toast.error('Failed',err.message);}
}

function _openWhatsApp(){
  const msg=(U.el('waMsg')?.value||'').trim();
  if(!msg){Toast.warning('Write a message first');return;}
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
}

function _renderAlerts(){
  const el=U.el('alertHistoryList'); if(!el) return;
  U.setText('totalAlertsBadge', S.alerts.length+' sent');
  if(!S.alerts.length){el.innerHTML='<div class="empty-state" style="padding:24px"><div class="empty-icon" style="font-size:36px">📭</div><div class="empty-desc">No alerts sent yet</div></div>';return;}
  const icons={fee:'💰',absent:'⚠️',holiday:'🏖️',exam:'📝',result:'🏆',custom:'✏️'};
  el.innerHTML=S.alerts.map(a=>`
    <div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:16px">${icons[a.type]||'📢'}</span>
          <span style="font-weight:600;font-size:13px;text-transform:capitalize;color:var(--text1)">${U.esc(a.type)}</span>
          <span class="badge badge-gray">${a.count||0} parents</span>
        </div>
        <div style="font-size:11px;color:var(--text3)">${U.fmtDate(a.sentAt)}</div>
      </div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5;max-height:60px;overflow:hidden;text-overflow:ellipsis">${U.esc(a.message)}</div>
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
          <button class="btn btn-outline btn-sm" onclick="_exportFullPDF()">📄 PDF</button>
          <button class="btn btn-outline btn-sm" onclick="_exportFullExcel()">📊 Excel</button>
        </div>
      </div>
      <div id="reportsBody"><div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-desc">Loading report data...</div></div></div>
    </div>`;
  const today=U.today();
  const thisMonth=today.slice(0,7);
  const active=S.students.filter(s=>s.status==='active').length;
  const paid  =S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+f.totalAmount,0);
  const pend  =S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
  const moPaid=S.fees.filter(f=>f.status==='paid'&&f.month===thisMonth).reduce((t,f)=>t+f.totalAmount,0);
  const defs  =[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))];
  const byClass={};S.students.forEach(s=>{byClass[s.class]=(byClass[s.class]||0)+1;});
  const byMonth={};S.fees.filter(f=>f.status==='paid').forEach(f=>{byMonth[f.month]=(byMonth[f.month]||0)+f.totalAmount;});
  let ap=0,at=0;
  Object.entries(S.attendance).filter(([k])=>k.startsWith(today+'_')).forEach(([,v])=>Object.values(v).forEach(st=>{at++;if(st==='P')ap++;}));
  const attRate=at?Math.round(ap/at*100):0;
  const collRate=S.fees.length?Math.round(S.fees.filter(f=>f.status==='paid').length/S.fees.length*100):0;
  U.el('reportsBody').innerHTML=`
    <div class="grid-4 mb-6">
      <div class="stat-card"><div class="stat-value">${active}</div><div class="stat-label">Active Students</div></div>
      <div class="stat-card"><div class="stat-value">${attRate}%</div><div class="stat-label">Today's Attendance</div></div>
      <div class="stat-card"><div class="stat-value">${collRate}%</div><div class="stat-label">Collection Rate</div></div>
      <div class="stat-card"><div class="stat-value">${S.exams?.length||0}</div><div class="stat-label">Total Exams</div></div>
    </div>
    <div class="grid-2 mb-6">
      <div class="card"><div class="card-header"><span class="card-title">📚 Class-wise Students</span></div><div class="card-body">
        ${Object.entries(byClass).sort((a,b)=>Number(a[0])-Number(b[0])).map(([cls,cnt])=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="width:64px;font-size:12px;font-weight:700;color:var(--text3)">Class ${cls}</span>
            <div style="flex:1;height:8px;background:var(--bg3);border-radius:4px">
              <div style="width:${Math.round(cnt/Math.max(active,1)*100)}%;height:100%;background:var(--primary);border-radius:4px"></div>
            </div>
            <span style="font-size:13px;font-weight:700;color:var(--text2);width:28px;text-align:right">${cnt}</span>
          </div>`).join('')||'<div style="color:var(--text3)">No data</div>'}
      </div></div>
      <div class="card"><div class="card-header"><span class="card-title">💰 Monthly Collection (Last 6)</span></div><div class="card-body">
        ${Object.entries(byMonth).sort().slice(-6).map(([mo,amt])=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="width:70px;font-size:11px;font-weight:600;color:var(--text3)">${U.fmtMonth(mo).split(' ')[0]}</span>
            <div style="flex:1;height:8px;background:var(--bg3);border-radius:4px">
              <div style="width:${Math.round(amt/Math.max(paid,1)*100)}%;height:100%;background:var(--success);border-radius:4px"></div>
            </div>
            <span style="font-size:11px;font-weight:600;color:var(--success);width:72px;text-align:right">${U.fmtCurrency(amt)}</span>
          </div>`).join('')||'<div style="color:var(--text3)">No fee data</div>'}
      </div></div>
    </div>
    <div class="grid-2 mb-6">
      <div class="stat-card"><div class="stat-label">This Month's Collection</div><div class="stat-value" style="color:var(--success)">${U.fmtCurrency(moPaid)}</div></div>
      <div class="stat-card"><div class="stat-label">Total Outstanding</div><div class="stat-value" style="color:var(--danger)">${U.fmtCurrency(pend)}</div></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">⚠️ Fee Defaulter List</span><span class="badge badge-danger">${defs.length} students</span></div>
      <div class="card-body">
        ${defs.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Phone</th><th>Pending Amount</th></tr></thead><tbody>
          ${defs.map(id=>{
            const s=S.students.find(x=>x.id===id);if(!s)return'';
            const amt=S.fees.filter(f=>f.studentId===id&&f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
            return `<tr><td class="td-primary">${U.esc(s.name)}</td><td><span class="badge badge-primary">Class ${s.class}</span></td><td>${U.esc(s.phone)}</td><td style="color:var(--danger);font-weight:700">${U.fmtCurrency(amt)}</td></tr>`;
          }).join('')}
        </tbody></table></div>`:'<div style="color:var(--success);font-weight:600;padding:12px;text-align:center">🎉 No defaulters! All fees cleared.</div>'}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════
// TEAM MANAGEMENT
// ══════════════════════════════════════════════════════
async function renderTeamSection(){
  if(S.role!=='admin'){Toast.error('Admin Only','Only admins can manage team');return;}
  await _loadMembers();
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">Team Management</div><div style="font-size:13px;color:var(--text3)">Add teachers & assign their classes</div></div>
        <button class="btn btn-primary" onclick="openMemberModal()">+ Add Member</button>
      </div>
      <div style="background:var(--primary-bg);border:1px solid var(--primary-border);border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:var(--primary)">
        📋 <b>How it works:</b> Teacher first Signs Up on EduManage Pro with their email → Then Admin assigns role & classes here.
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Name / Email</th><th>Role</th><th>Assigned Classes</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="teamBody"></tbody>
      </table></div></div>
    </div>`;
  _renderTeamRows();
}

function _renderTeamRows(){
  const tbody=U.el('teamBody'); if(!tbody) return;
  if(!S.members.length){tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No team members yet</div><div class="empty-desc">Add teachers and viewers to your school</div></div></td></tr>`;return;}
  const roleColor={admin:'badge-primary',teacher:'badge-success',viewer:'badge-gray'};
  tbody.innerHTML=S.members.map(m=>{
    const classes=m.assigned_classes
      ?(Array.isArray(m.assigned_classes)?m.assigned_classes:JSON.parse(m.assigned_classes)).map(c=>`Class ${c}`).join(', ')
      :(m.role==='admin'?'<span style="color:var(--text3)">All Classes</span>':'<span style="color:var(--danger);font-size:12px">⚠️ Not assigned</span>');
    const joined=m.accepted_at?U.fmtDate(m.accepted_at):'<span class="badge badge-warning">Pending</span>';
    const isSelf=m.user_id===S.user.id;
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:800;flex-shrink:0">${U.avatar(m.display_name||m.email||'?')}</div>
          <div><div class="td-primary">${U.esc(m.display_name||'—')}</div><div style="font-size:11px;color:var(--text3)">${U.esc(m.email||'')}</div></div>
        </div>
      </td>
      <td><span class="badge ${roleColor[m.role]||'badge-gray'}">${m.role}</span></td>
      <td style="font-size:13px;max-width:200px">${classes}</td>
      <td style="font-size:12px">${joined} ${isSelf?'<span class="badge badge-primary" style="font-size:10px">You</span>':''}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn-icon" onclick="editMember('${m.id}')" title="Edit" style="width:30px;height:30px">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          ${!isSelf?`<button class="btn-icon btn-icon-danger" onclick="_deleteMember('${m.id}','${U.esc((m.display_name||m.email||'Member').replace(/'/g,"\\'"))}')" title="Remove" style="width:30px;height:30px">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openMemberModal(){
  U.el('editMemberId').value='';
  U.el('memberName').value='';
  U.el('memberEmail').value='';
  U.el('memberRole').value='teacher';
  U.el('memberEmail').disabled=false;
  U.setText('teacherModalTitle','Add Team Member');
  U.el('memberInfoBox').style.display='none';
  _buildClassCheckboxes(null);
  toggleClassAssign();
  openModal('teacherModal');
}

function editMember(id){
  const m=S.members.find(x=>x.id===id); if(!m) return;
  U.el('editMemberId').value=m.id;
  U.el('memberName').value=m.display_name||'';
  U.el('memberEmail').value=m.email||'';
  U.el('memberRole').value=m.role;
  U.el('memberEmail').disabled=true;
  U.setText('teacherModalTitle','Edit Member');
  const existing=m.assigned_classes
    ?(Array.isArray(m.assigned_classes)?m.assigned_classes.map(String):JSON.parse(m.assigned_classes).map(String))
    :[];
  _buildClassCheckboxes(existing);
  toggleClassAssign();
  U.el('memberInfoBox').style.display='block';
  U.el('memberInfoBox').innerHTML='ℹ️ Email is locked for existing members. To change email, remove and re-add.';
  openModal('teacherModal');
}

function _buildClassCheckboxes(selected){
  const c=U.el('classCheckboxes'); if(!c) return;
  c.innerHTML=Array.from({length:12},(_,i)=>{
    const cls=String(i+1);
    return `<label class="class-checkbox-item">
      <input type="checkbox" value="${cls}" ${selected?.includes(cls)?'checked':''} class="cls-chk"/>
      <span>Class ${cls}</span>
    </label>`;
  }).join('');
}

function toggleClassAssign(){
  const role=U.el('memberRole')?.value;
  const grp=U.el('classAssignGroup');
  if(grp) grp.style.display=role==='teacher'?'block':'none';
}

function selectAllClasses(){ document.querySelectorAll('.cls-chk').forEach(c=>c.checked=true); }
function clearAllClasses() { document.querySelectorAll('.cls-chk').forEach(c=>c.checked=false); }

async function saveMember(){
  const memberId=U.el('editMemberId').value;
  const name   =U.el('memberName').value.trim();
  const email  =U.el('memberEmail').value.trim();
  const role   =U.el('memberRole').value;
  const classes=role==='teacher'?Array.from(document.querySelectorAll('.cls-chk:checked')).map(c=>c.value):null;
  if(!name) {Toast.warning('Enter member name');return;}
  if(!memberId&&!email){Toast.warning('Enter email address');return;}
  if(role==='teacher'&&(!classes||!classes.length)){Toast.warning('Assign at least one class to the teacher');return;}
  try{
    if(memberId){
      const{error}=await sb.from('school_members').update({role,display_name:name,assigned_classes:classes}).eq('id',memberId).eq('school_id',S.schoolId);
      if(error) throw error;
      Toast.success('Member Updated ✅',name);
    }else{
      Toast.info('Invite Process','Ask '+email+' to Sign Up on EduManage Pro first. Once they sign up, their account will appear here and you can assign their role.');
      closeModal('teacherModal');return;
    }
    U.el('memberEmail').disabled=false;
    closeModal('teacherModal');
    await _loadMembers();
    _renderTeamRows();
  }catch(err){Toast.error('Save Failed',err.message);}
}

async function _deleteMember(id,name){
  const ok=await showConfirm('Remove Member',`Remove "${name}" from this school?`,'👤');
  if(!ok) return;
  try{
    const{error}=await sb.from('school_members').delete().eq('id',id).eq('school_id',S.schoolId);
    if(error) throw error;
    Toast.warning('Removed',name+' removed from school');
    await _loadMembers(); _renderTeamRows();
  }catch(err){Toast.error('Failed',err.message);}
}

// ══════════════════════════════════════════════════════
// AI ASSISTANT
// ══════════════════════════════════════════════════════
function renderAISection(){
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-header">
        <div><div class="section-title">✨ AI Assistant</div><div style="font-size:13px;color:var(--text3)">Ask anything about your school data</div></div>
        <button class="btn btn-outline btn-sm" id="voiceBtn" onclick="_toggleVoice()">🎤 Voice Input</button>
      </div>
      <div class="card mb-4" style="min-height:300px;max-height:440px;overflow-y:auto" id="aiChatBox">
        <div style="padding:28px 20px;text-align:center;color:var(--text3)">
          <div style="font-size:48px;margin-bottom:12px">🤖</div>
          <div style="font-size:15px;font-weight:700;color:var(--text2)">Hello! I'm your School AI Assistant</div>
          <div style="font-size:13px;margin-top:6px;margin-bottom:20px">Ask me anything about students, fees, attendance, or exams</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
            ${['Total students today','Fee defaulters list','Today\'s attendance','Upcoming exams','Class-wise count','Monthly fee collection','Students without fees'].map(q=>`<button class="btn btn-outline btn-sm" onclick="askAI('${q}')">${q}</button>`).join('')}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <input class="form-control" id="aiInput" placeholder="Ask about students, fees, attendance, exams..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendAI();}"/>
        <button class="btn btn-primary" onclick="sendAI()" style="white-space:nowrap">Send ✈️</button>
      </div>
    </div>`;
}

function askAI(q){ const el=U.el('aiInput'); if(el){el.value=q;sendAI();} }

function sendAI(){
  const input=U.el('aiInput');
  const q=(input?.value||'').trim(); if(!q) return;
  const box=U.el('aiChatBox'); if(!box) return;
  box.innerHTML+=`<div style="padding:10px 16px;background:var(--primary);color:white;border-radius:12px 12px 4px 12px;margin:8px 8px 8px auto;max-width:80%;font-size:13px;line-height:1.5;word-break:break-word">${U.esc(q)}</div>`;
  const ans=_getAIAnswer(q);
  box.innerHTML+=`<div style="padding:12px 16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px 12px 12px 4px;margin:8px auto 8px 8px;max-width:88%;font-size:13px;line-height:1.6">🤖 ${ans}</div>`;
  box.scrollTop=box.scrollHeight;
  if(input) input.value='';
}

function _getAIAnswer(q){
  const ql=q.toLowerCase();
  const active=S.students.filter(s=>s.status==='active');
  const today=U.today();

  if(/total|how many|count.*student|enrolled/.test(ql)){
    const cc={};S.students.forEach(s=>{cc[s.class]=(cc[s.class]||0)+1;});
    const top=Object.entries(cc).sort((a,b)=>b[1]-a[1])[0];
    return `👥 <b>Total Students: ${S.students.length}</b> (Active: ${active.length}, Inactive: ${S.students.length-active.length})<br>${top?`Largest class: <b>Class ${top[0]}</b> (${top[1]} students)`:''}`;
  }
  if(/class.*(wise|count|summary|breakdown)/.test(ql)){
    const cc={};S.students.forEach(s=>{cc[s.class]=(cc[s.class]||0)+1;});
    return '📚 <b>Class-wise Students:</b><br>'+Object.entries(cc).sort((a,b)=>Number(a[0])-Number(b[0])).map(([c,n])=>`Class ${c}: <b>${n} students</b>`).join(' · ')||'No students enrolled yet.';
  }
  if(/default|pending.*fee|fee.*pending|outstanding|due/.test(ql)){
    const defIds=[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))];
    const names=defIds.map(id=>S.students.find(s=>s.id===id)).filter(Boolean);
    const totalPend=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
    return `💸 <b>${defIds.length} defaulters</b> · Total pending: <b style="color:var(--danger)">${U.fmtCurrency(totalPend)}</b><br>${names.slice(0,5).map(s=>`⚠️ ${U.esc(s.name)} (Class ${s.class})`).join('<br>')}${names.length>5?`<br>...and ${names.length-5} more`:''}`;
  }
  if(/fee|collect|paid|revenue/.test(ql)){
    const paid=S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+f.totalAmount,0);
    const pend=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
    const thisMonth=today.slice(0,7);
    const moPaid=S.fees.filter(f=>f.status==='paid'&&f.month===thisMonth).reduce((t,f)=>t+f.totalAmount,0);
    return `💰 Total Collected: <b style="color:var(--success)">${U.fmtCurrency(paid)}</b><br>Pending: <b style="color:var(--danger)">${U.fmtCurrency(pend)}</b><br>This month: <b style="color:var(--primary)">${U.fmtCurrency(moPaid)}</b>`;
  }
  if(/attendance|present|absent|today/.test(ql)){
    let p=0,t=0;
    Object.entries(S.attendance).filter(([k])=>k.startsWith(today+'_')).forEach(([,v])=>Object.values(v).forEach(st=>{t++;if(st==='P')p++;}));
    const pct=t?Math.round(p/t*100):0;
    return `✅ Today's Attendance:<br>Present: <b>${p}</b> / Total: <b>${t}</b><br>Rate: <b style="color:${pct>=75?'var(--success)':pct>=50?'var(--warning)':'var(--danger)'}">${pct}%</b>${!t?'<br><i>No attendance marked today</i>':''}`;
  }
  if(/exam|test|upcoming|schedule/.test(ql)){
    const upcoming=(S.exams||[]).filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
    return `📝 Total Exams: ${(S.exams||[]).length} | Upcoming: ${upcoming.length}<br>${upcoming.slice(0,4).map(e=>`📅 <b>${U.esc(e.name)}</b> — ${U.esc(e.subject)}, Class ${e.class}, ${U.fmtDate(e.date)}`).join('<br>')||'No upcoming exams scheduled.'}`;
  }
  if(/perfect|100%|full attendance/.test(ql)){
    const m={};
    Object.values(S.attendance).forEach(v=>Object.entries(v).forEach(([id,st])=>{if(!m[id])m[id]={p:0,t:0};m[id].t++;if(st==='P')m[id].p++;}));
    const perf=S.students.filter(s=>m[s.id]?.t>0&&m[s.id].p===m[s.id].t);
    return perf.length?`🌟 <b>${perf.length} students with 100% attendance:</b><br>${perf.map(s=>`✅ ${U.esc(s.name)} (Class ${s.class})`).join('<br>')}`:'No students with 100% attendance found in recorded data.';
  }
  if(/hi|hello|namaskar|namaste|hey/.test(ql)){
    return `🙏 Namaskar! I have access to:<br>• <b>${S.students.length}</b> students<br>• <b>${S.fees.length}</b> fee records<br>• <b>${(S.exams||[]).length}</b> exams<br>• <b>${S.alerts.length}</b> sent alerts<br><br>Ask me anything about your school!`;
  }
  return `🤔 I can answer questions about:<br>• <b>Students</b> — "total students", "class-wise count"<br>• <b>Fees</b> — "fee collection", "defaulters"<br>• <b>Attendance</b> — "today attendance", "perfect attendance"<br>• <b>Exams</b> — "upcoming exams"`;
}

function _toggleVoice(){
  const SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
  const btn=U.el('voiceBtn');
  if(!SpeechRec){Toast.warning('Voice Not Supported','Use Chrome or Edge browser');return;}
  if(S._voiceActive){S._voiceActive=false;if(btn){btn.textContent='🎤 Voice Input';btn.style.color='';}return;}
  const rec=new SpeechRec();
  rec.lang='en-IN'; rec.continuous=false; rec.interimResults=false;
  S._voiceActive=true;
  if(btn){btn.textContent='🔴 Listening...';btn.style.color='red';}
  rec.onresult=e=>{
    const t=e.results[0][0].transcript;
    const inp=U.el('aiInput'); if(inp) inp.value=t;
    sendAI();
  };
  rec.onerror=rec.onend=()=>{ S._voiceActive=false; if(btn){btn.textContent='🎤 Voice Input';btn.style.color='';} };
  rec.start();
  Toast.info('Listening...','Speak now');
}

// ══════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════
function renderSettingsSection(){
  const isAdmin=S.role==='admin';
  U.el('contentArea').innerHTML=`
    <div style="animation:fadeIn .2s ease">
      <div class="section-title" style="margin-bottom:20px">Settings</div>
      <div class="card mb-4">
        <div class="card-header"><span class="card-title">🏫 School Details</span>${!isAdmin?'<span class="badge badge-gray">View Only</span>':''}</div>
        <div class="card-body">
          <div class="grid-2">
            <div class="form-group"><label class="form-label">School Name</label><input class="form-control" id="cfgName" value="${U.esc(S.settings.schoolName)}" ${!isAdmin?'disabled':''}/></div>
            <div class="form-group"><label class="form-label">Academic Year</label><input class="form-control" id="cfgYear" value="${U.esc(S.settings.academicYear)}" ${!isAdmin?'disabled':''}/></div>
            <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="cfgPhone" value="${U.esc(S.settings.phone)}" ${!isAdmin?'disabled':''}/></div>
            <div class="form-group"><label class="form-label">Board</label>
              <select class="form-control" id="cfgBoard" ${!isAdmin?'disabled':''}>
                ${['CBSE','ICSE','UP Board','MP Board','Bihar Board','Other'].map(b=>`<option ${S.settings.board===b?'selected':''}>${b}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Address</label><textarea class="form-control" id="cfgAddress" ${!isAdmin?'disabled':''}>${U.esc(S.settings.address)}</textarea></div>
          ${isAdmin?`<button class="btn btn-primary" onclick="saveSettings()">💾 Save Settings</button>`:`<p style="font-size:13px;color:var(--text3);margin-top:4px">⚠️ Only admins can edit school settings.</p>`}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">👤 Your Account</span></div>
        <div class="card-body">
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Email Address</label><input class="form-control" value="${U.esc(S.user?.email||'')}" disabled/></div>
            <div class="form-group"><label class="form-label">Your Role</label><input class="form-control" value="${{admin:'Administrator',teacher:'Teacher',viewer:'Viewer'}[S.role]||S.role}" disabled/></div>
            ${S.role==='teacher'&&S.assignedClasses?.length?`<div class="form-group"><label class="form-label">Assigned Classes</label><input class="form-control" value="${S.assignedClasses.map(c=>'Class '+c).join(', ')}" disabled/></div>`:''}
          </div>
          <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-ghost" onclick="handleLogout()">🚪 Sign Out</button>
            <button class="btn btn-outline btn-sm" onclick="toggleTheme()">🌙 Toggle Theme</button>
          </div>
        </div>
      </div>
    </div>`;
}

async function saveSettings(){
  if(S.role!=='admin'){Toast.error('Admin Only');return;}
  try{
    const name   =U.el('cfgName').value.trim();
    const year   =U.el('cfgYear').value.trim();
    const phone  =U.el('cfgPhone').value.trim();
    const board  =U.el('cfgBoard').value;
    const address=U.el('cfgAddress').value.trim();
    if(!name){Toast.warning('School name is required');return;}
    const{error}=await sb.from('schools').update({name,academic_year:year,phone,board,address}).eq('id',S.schoolId);
    if(error) throw error;
    S.settings={schoolName:name,academicYear:year,phone,board,address};
    U.setText('sidebarSchoolName', name);
    Toast.success('Settings Saved ✅');
  }catch(err){Toast.error('Save Failed',err.message);}
}

// ══════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════
function _exportStudentsExcel(){
  if(!window.XLSX){Toast.warning('Excel library not loaded');return;}
  const data=S.students.map((s,i)=>({'#':i+1,'Name':s.name,'Class':s.class,'Roll':s.roll||'','Father':s.father||'','Phone':s.phone,'Email':s.email||'','Status':s.status,'Conveyance':s.conveyance||0,'Bus Route':s.busRoute||''}));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Students');
  XLSX.writeFile(wb,`Students_${S.settings.schoolName||'School'}_${U.today()}.xlsx`);
  Toast.success('Excel Downloaded ✅');
}

function _exportStudentsPDF(){
  if(!window.jspdf?.jsPDF){Toast.warning('PDF library not loaded');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.setFontSize(16);doc.text(S.settings.schoolName||'School',14,18);
  doc.setFontSize(11);doc.text('Student List — '+U.today(),14,26);
  doc.setFontSize(9);
  const cols=[14,22,70,90,112,140];
  ['#','Name','Class','Roll','Phone','Status'].forEach((h,i)=>doc.text(h,cols[i],36));
  let y=44;
  S.students.forEach((s,i)=>{
    if(y>270){doc.addPage();y=20;}
    [String(i+1),s.name?.slice(0,22)||'','Class '+s.class,s.roll||'—',s.phone,s.status].forEach((v,j)=>doc.text(String(v),cols[j],y));
    y+=7;
  });
  doc.save(`Students_${U.today()}.pdf`);
  Toast.success('PDF Downloaded ✅');
}

function _exportFeesExcel(){
  if(!window.XLSX){Toast.warning('Excel library not loaded');return;}
  const data=S.fees.map(f=>({'Receipt':f.receipt,'Student':f.studentName,'Class':f.studentClass,'Month':f.month,'Amount':f.totalAmount,'Mode':f.mode,'Date':f.date,'Status':f.status}));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Fee Payments');
  XLSX.writeFile(wb,`Fees_${S.settings.schoolName||'School'}_${U.today()}.xlsx`);
  Toast.success('Excel Downloaded ✅');
}

function _exportFeesPDF(){
  if(!window.jspdf?.jsPDF){Toast.warning('PDF library not loaded');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.setFontSize(16);doc.text(S.settings.schoolName||'School',14,18);
  doc.setFontSize(11);doc.text('Fee Report — '+U.today(),14,26);
  doc.setFontSize(9);
  const cols=[14,40,85,110,140,165];
  ['Receipt','Student','Class','Month','Amount','Status'].forEach((h,i)=>doc.text(h,cols[i],36));
  let y=44;
  S.fees.slice(0,50).forEach(f=>{
    if(y>270){doc.addPage();y=20;}
    [String(f.receipt||'').slice(-10),String(f.studentName||'').slice(0,18),'Class '+String(f.studentClass||''),String(f.month||''),'Rs.'+String(f.totalAmount||0),String(f.status||'')].forEach((v,j)=>doc.text(v,cols[j],y));
    y+=7;
  });
  doc.save(`Fees_${U.today()}.pdf`);
  Toast.success('PDF Downloaded ✅');
}

function _exportAttPDF(){
  const cls=U.el('attClassSel')?.value;
  const date=U.el('attDate')?.value||U.today();
  if(!cls){Toast.warning('Select a class first');return;}
  if(!window.jspdf?.jsPDF){Toast.warning('PDF library not loaded');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.setFontSize(16);doc.text(`${S.settings.schoolName||'School'} — Attendance`,14,18);
  doc.setFontSize(11);doc.text(`Class ${cls} · ${U.fmtDate(date)}`,14,26);
  const key=date+'_'+cls;
  const att=S.attendance[key]||{};
  const students=S.students.filter(s=>String(s.class)===cls&&s.status==='active');
  let p=0,a=0,l=0;
  students.forEach(s=>{const st=att[s.id];if(st==='P')p++;else if(st==='A')a++;else if(st==='L')l++;});
  doc.setFontSize(10);doc.text(`Present: ${p}  Absent: ${a}  Late: ${l}  Total: ${students.length}`,14,34);
  doc.setFontSize(9);
  const cols=[14,22,90,118,145];
  ['#','Name','Roll','Phone','Status'].forEach((h,i)=>doc.text(h,cols[i],44));
  let y=52;
  students.forEach((s,i)=>{
    if(y>270){doc.addPage();y=20;}
    const st=att[s.id]||'—';
    [String(i+1),s.name?.slice(0,26)||'',s.roll||'—',s.phone,st].forEach((v,j)=>doc.text(String(v),cols[j],y));
    y+=7;
  });
  doc.save(`Attendance_Class${cls}_${date}.pdf`);
  Toast.success('PDF Downloaded ✅');
}

function _exportTTPDF(){
  const cls=U.el('ttClass')?.value||'1';
  if(!window.jspdf?.jsPDF){Toast.warning('PDF library not loaded');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF('landscape');
  doc.setFontSize(14);doc.text(`${S.settings.schoolName||'School'} — Timetable Class ${cls}`,14,16);
  doc.setFontSize(8);
  const tt=S.timetables[cls]||{};
  const cellW=38,cellH=10,startX=14,startY=26;
  // Header
  ['Period',...DAYS].forEach((d,i)=>{ doc.rect(startX+i*cellW,startY,cellW,cellH);doc.text(d.slice(0,8),startX+i*cellW+2,startY+7); });
  PERIODS.forEach((time,pi)=>{
    const y=startY+(pi+1)*cellH;
    doc.rect(startX,y,cellW,cellH);doc.text(time,startX+2,y+7);
    DAYS.forEach((_,di)=>{
      const x=startX+(di+1)*cellW;
      doc.rect(x,y,cellW,cellH);
      const val=(tt[di]||{})[pi]||'';
      doc.text(val.slice(0,10),x+2,y+7);
    });
  });
  doc.save(`Timetable_Class${cls}.pdf`);
  Toast.success('PDF Downloaded ✅');
}

function _exportFullPDF(){
  if(!window.jspdf?.jsPDF){Toast.warning('PDF library not loaded');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  const school=S.settings.schoolName||'School';
  const paid=S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+f.totalAmount,0);
  const pend=S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
  doc.setFontSize(20);doc.text(school,14,22);
  doc.setFontSize(12);doc.text('Full School Report — '+U.fmtDate(U.today()),14,32);
  doc.setFontSize(10);
  const lines=[
    `Academic Year: ${S.settings.academicYear||'—'} · Board: ${S.settings.board||'—'}`,
    `Total Students: ${S.students.length} (Active: ${S.students.filter(s=>s.status==='active').length})`,
    `Total Exams: ${(S.exams||[]).length} · Alerts Sent: ${S.alerts.length}`,
    `Fee Collected: Rs.${paid} · Outstanding: Rs.${pend}`,
  ];
  lines.forEach((l,i)=>doc.text(l,14,46+i*8));
  doc.save(`Report_${school}_${U.today()}.pdf`);
  Toast.success('PDF Downloaded ✅');
}

function _exportFullExcel(){
  if(!window.XLSX){Toast.warning('Excel library not loaded');return;}
  const wb=XLSX.utils.book_new();
  const stuWs=XLSX.utils.json_to_sheet(S.students.map(s=>({Name:s.name,Class:s.class,Roll:s.roll||'',Phone:s.phone,Father:s.father||'',Status:s.status,Conveyance:s.conveyance||0})));
  XLSX.utils.book_append_sheet(wb,stuWs,'Students');
  const feeWs=XLSX.utils.json_to_sheet(S.fees.map(f=>({Receipt:f.receipt,Student:f.studentName,Class:f.studentClass,Month:f.month,Amount:f.totalAmount,Mode:f.mode,Status:f.status})));
  XLSX.utils.book_append_sheet(wb,feeWs,'Fees');
  const defIds=[...new Set(S.fees.filter(f=>f.status!=='paid').map(f=>f.studentId))];
  const defWs=XLSX.utils.json_to_sheet(defIds.map(id=>{
    const s=S.students.find(x=>x.id===id); if(!s)return{};
    const amt=S.fees.filter(f=>f.studentId===id&&f.status!=='paid').reduce((t,f)=>t+f.totalAmount,0);
    return{Name:s.name,Class:s.class,Phone:s.phone,Pending:amt};
  }));
  XLSX.utils.book_append_sheet(wb,defWs,'Defaulters');
  XLSX.writeFile(wb,`FullReport_${S.settings.schoolName||'School'}_${U.today()}.xlsx`);
  Toast.success('Excel Downloaded ✅');
}

// ══════════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  document.documentElement.dataset.theme=localStorage.getItem('em_theme')||'light';
  if(initSupabase()) _initAuth();
});

console.log('%cEduManage Pro v9 ✓','color:#6366f1;font-weight:bold;font-size:14px');