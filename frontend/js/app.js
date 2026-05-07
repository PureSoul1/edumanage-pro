// ═══════════════════════════════════════════════════════
// EDUMANAGE PRO v6 — SUPABASE + CLOUDFLARE WORKERS
// ═══════════════════════════════════════════════════════

let sb = null;
function initSupabase() {
  if (!window.ENV?.SUPABASE_URL) { alert('Setup env.js first!'); return false; }
  sb = window.supabase.createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);
  return true;
}

// ── STATE ──
const S = {
  user: null, role: 'admin', schoolId: '',
  students: [], fees: [], exams: [], alerts: [],
  settings: { schoolName: '', academicYear: '2024-25', phone: '', address: '', board: 'CBSE' },
  currentSection: 'dashboard', tempAtt: {}
};

// ── UTILS ──
const U = {
  today: () => new Date().toISOString().split('T')[0],
  esc: s => s == null ? '' : String(s).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c] || c)),
  fmtCurrency: n => '₹' + Number(n || 0).toLocaleString('en-IN'),
  el: id => document.getElementById(id),
  avatar: name => { const w = String(name || '').trim().split(' '); return w.length >= 2 ? w[0][0] + w[1][0] : (name || '?').slice(0, 2); },
};

// ── TOAST ──
const Toast = {
  show(title, msg = '', type = 'info', duration = 4000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const c = U.el('toastContainer'); const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<div class="toast-icon">${icons[type]}</div><div class="toast-content"><div class="toast-title">${U.esc(title)}</div>${msg ? `<div class="toast-msg">${U.esc(msg)}</div>` : ''}</div><button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
    c.appendChild(t); setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, duration);
  },
  success: (t, m) => Toast.show(t, m, 'success'), error: (t, m) => Toast.show(t, m, 'error', 5000), warning: (t, m) => Toast.show(t, m, 'warning'), info: (t, m) => Toast.show(t, m, 'info')
};

// ── CONFIRM ──
let confirmResolve = null;
function showConfirm(title, msg, icon = '⚠️', danger = true) {
  return new Promise(res => { confirmResolve = res; U.el('confirmIcon').textContent = icon; U.el('confirmTitle').textContent = title; U.el('confirmMsg').textContent = msg; U.el('confirmOverlay').style.display = 'flex'; });
}
function resolveConfirm(result) { U.el('confirmOverlay').style.display = 'none'; if (confirmResolve) { confirmResolve(result); confirmResolve = null; } }

// ── THEME & NAVIGATION ──
function toggleTheme() { const html = document.documentElement; html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('em_theme', html.dataset.theme); }
const TITLES = { dashboard:'Dashboard', students:'Student Management', fees:'Fee Management', attendance:'Attendance', exams:'Exams & Results', reports:'Reports & Analytics', settings:'Settings' };
function showSection(id) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`[data-section="${id}"]`); if (nav) nav.classList.add('active');
  U.el('pageTitle').textContent = TITLES[id] || id; S.currentSection = id; closeSidebar(); renderSection(id);
}
function toggleSidebar() { U.el('sidebar').classList.toggle('show'); U.el('sidebarOverlay').classList.toggle('show'); }
function closeSidebar() { U.el('sidebar').classList.remove('show'); U.el('sidebarOverlay').classList.remove('show'); }
function openModal(id) { U.el(id)?.classList.remove('hidden'); }
function closeModal(id) { U.el(id)?.classList.add('hidden'); }

// ═══════════════════════════════════════════════════════
// DATA MAPPERS (DB snake_case → UI camelCase)
// ═══════════════════════════════════════════════════════
function mapStudent(s) { return { id:s.id, name:s.name, class:s.class_name, roll:s.roll_number, father:s.father_name, phone:s.phone, conveyance:s.conveyance_fee, status:s.status }; }
function mapFee(f) { const stu = S.students.find(s => s.id === f.student_id); return { id:f.id, receipt:f.receipt_number, studentId:f.student_id, studentName:stu?.name||'Unknown', studentClass:stu?.class||'', month:f.month, amount:f.total_amount, totalAmount:f.total_amount, mode:f.payment_mode, status:f.status }; }
function mapExam(e) { return { id:e.id, name:e.name, subject:e.subject, class:e.class_name, date:e.exam_date, maxMarks:e.max_marks, passMarks:e.pass_marks, type:e.exam_type }; }
function mapAlert(a) { return { id:a.id, type:a.alert_type, message:a.message, recipients:a.recipient_type, recipientCount:a.recipient_count, sentAt:a.sent_at }; }

// ═══════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════
async function signInWithGoogle() { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); if (error) Toast.error('Google Sign-in Failed', error.message); }

function toggleAuthPanel(type) {
  if(type === 'signup') {
    U.el('loginFormPanel').style.display = 'none';
    U.el('signupFormPanel').style.display = 'block';
  } else {
    U.el('signupFormPanel').style.display = 'none';
    U.el('loginFormPanel').style.display = 'block';
  }
  U.el('loginError').style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault(); const btn = U.el('loginBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { const { data, error } = await sb.auth.signInWithPassword({ email: U.el('loginEmail').value, password: U.el('loginPassword').value }); if (error) throw error; S.user = data.user; await initApp(); }
  catch (err) { U.el('loginError').textContent = '⚠️ ' + err.message; U.el('loginError').style.display = 'block'; }
  finally { btn.disabled = false; btn.textContent = 'Sign In'; }
}

async function handleSignup(e) {
  e.preventDefault();
  const btn = U.el('signupBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  const email = U.el('signupEmail').value.trim();
  const password = U.el('signupPassword').value;
  const name = U.el('signupName').value.trim();
  const school = U.el('signupSchool').value.trim();

  try {
    // 1. Create Auth User
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) throw error;

    // 2. Create School & Membership
    if (data.user) {
      const { data: schoolData } = await sb.from('schools').insert({ name: school, owner_id: data.user.id }).select().single();
      if (schoolData) {
        await sb.from('school_members').insert({ school_id: schoolData.id, user_id: data.user.id, role: 'admin', accepted_at: new Date().toISOString() });
      }
    }
    
    Toast.success('Account Created!', 'Please Sign In now with your credentials.');
    toggleAuthPanel('login'); // Switch back to login form
  } catch (err) {
    U.el('loginError').textContent = '⚠️ ' + err.message; U.el('loginError').style.display = 'block';
  } finally { btn.disabled = false; btn.textContent = 'Create Account'; }
}

async function handleLogout() { const ok = await showConfirm('Sign Out', 'Are you sure?', '👋', false); if (!ok) return; await sb.auth.signOut(); location.reload(); }

// ── SESSION & INIT ──
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession(); if (session) { S.user = session.user; await initApp(); }
  sb.auth.onAuthStateChange(async (event, session) => { if (event === 'SIGNED_IN' && session) { S.user = session.user; await initApp(); } else if (event === 'SIGNED_OUT') { U.el('loginPage').style.display = 'flex'; U.el('appPage').classList.remove('active'); } });
}

async function initApp() {
  // Check for school membership
  const { data: membership } = await sb.from('school_members').select('school_id, role').eq('user_id', S.user.id).single();
  
  if (!membership) {
    // No school found — show setup screen instead of error
    showSchoolSetup();
    return;
  }
  
  S.schoolId = membership.school_id; S.role = membership.role;
  const { data: school } = await sb.from('schools').select('*').eq('id', S.schoolId).single();
  if (school) S.settings = { schoolName: school.name, academicYear: school.academic_year, phone: school.phone, address: school.address, board: school.board };
  const name = S.user.user_metadata?.full_name || S.user.email.split('@')[0];
  U.el('userName').textContent = U.esc(name); U.el('userAvatar').textContent = U.esc(U.avatar(name).toUpperCase()); U.el('userRole').textContent = S.role;
  U.el('sidebarSchoolName').textContent = U.esc(S.settings.schoolName);
  const badges = { admin: '<span class="badge badge-primary">👨‍💼 Admin</span>', teacher: '<span class="badge badge-success">👩‍🏫 Teacher</span>', viewer: '<span class="badge badge-gray">👁️ Viewer</span>' };
  U.el('topbarRoleBadge').innerHTML = badges[S.role] || '';
  U.el('loginPage').style.display = 'none'; U.el('appPage').classList.add('active');
  setupRealtime(); showSection('dashboard'); Toast.success('Welcome back!', name);
}

// ── SCHOOL SETUP (First time users) ──
function showSchoolSetup() {
  const name = S.user.user_metadata?.full_name || S.user.email.split('@')[0];
  U.el('loginPage').style.display = 'none';
  U.el('appPage').classList.add('active');
  
  const area = U.el('contentArea');
  area.innerHTML = `
    <div class="section active" style="max-width:500px;margin:60px auto;text-align:center">
      <div style="font-size:64px;margin-bottom:16px">🏫</div>
      <div class="section-title" style="margin-bottom:8px">Welcome, ${U.esc(name)}!</div>
      <p style="color:var(--text3);margin-bottom:28px;font-size:15px">Set up your school to get started with EduManage Pro.</p>
      <div class="card" style="text-align:left">
        <div class="card-body">
          <div class="form-group"><label class="form-label">School Name *</label><input class="form-control" id="setupSchoolName" placeholder="e.g. Sunrise Public School"/></div>
          <div class="form-group"><label class="form-label">Academic Year</label><input class="form-control" id="setupYear" value="2024-25"/></div>
          <div class="form-group"><label class="form-label">Board</label><select class="form-control" id="setupBoard"><option>CBSE</option><option>ICSE</option><option>UP Board</option><option>Other</option></select></div>
          <button class="btn btn-primary w-full" style="padding:13px;font-size:15px" onclick="completeSchoolSetup()">🚀 Create & Enter Dashboard</button>
        </div>
      </div>
    </div>`;
  
  // Hide sidebar stuff until setup is done
  U.el('sidebarSchoolName').textContent = 'Setting up...';
}

async function completeSchoolSetup() {
  const schoolName = U.el('setupSchoolName').value.trim();
  if (!schoolName) { Toast.warning('Enter school name'); return; }
  
  try {
    // 1. Create School
    const { data: school, error: schoolErr } = await sb.from('schools').insert({
      name: schoolName,
      academic_year: U.el('setupYear').value.trim() || '2024-25',
      board: U.el('setupBoard').value,
      owner_id: S.user.id
    }).select().single();
    
    if (schoolErr) throw schoolErr;
    
    // 2. Create Membership
    const { error: memberErr } = await sb.from('school_members').insert({
      school_id: school.id,
      user_id: S.user.id,
      role: 'admin',
      accepted_at: new Date().toISOString()
    });
    
    if (memberErr) throw memberErr;
    
    // 3. Seed default fee structure for this school
    const feeInserts = [];
    Array.from({length:12}, (_,i) => String(i+1)).forEach(cls => {
      [
        { key: 'tuition', label: 'Tuition Fee', amt: 3000, en: true, ao: true },
        { key: 'computer', label: 'Computer Lab Fee', amt: 200, en: true, ao: false },
        { key: 'science', label: 'Science Lab Fee', amt: 150, en: false, ao: false },
        { key: 'sports', label: 'Sports Fee', amt: 100, en: true, ao: false },
        { key: 'library', label: 'Library Fee', amt: 50, en: true, ao: false },
        { key: 'exam', label: 'Exam Fee', amt: 100, en: false, ao: false },
        { key: 'development', label: 'Development Fund', amt: 100, en: true, ao: false },
        { key: 'conveyance', label: 'Conveyance', amt: 0, en: false, ao: false },
      ].forEach(comp => {
        feeInserts.push({ school_id: school.id, class_name: cls, component_key: comp.key, component_label: comp.label, amount: comp.amt, enabled: comp.en, always_on: comp.ao });
      });
    });
    await sb.from('fee_structures').insert(feeInserts);
    
    Toast.success('School Created!', 'Welcome to EduManage Pro');
    
    // 4. Re-initialize app
    await initApp();
    
  } catch (err) {
    Toast.error('Setup Failed', err.message);
    console.error(err);
  }
}

function setupRealtime() {
  sb.channel('school-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `school_id=eq.${S.schoolId}` }, () => loadStudents())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'fee_payments', filter: `school_id=eq.${S.schoolId}` }, () => loadFees()).subscribe();
}

// ═══════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════
async function loadStudents() { const { data } = await sb.from('students').select('*').eq('school_id', S.schoolId).order('created_at', { ascending: false }); S.students = (data || []).map(mapStudent); if (S.currentSection === 'students') renderStudents(); updateDashboard(); }
async function loadFees() { const { data } = await sb.from('fee_payments').select('*').eq('school_id', S.schoolId).order('created_at', { ascending: false }); S.fees = (data || []).map(mapFee); if (S.currentSection === 'fees') renderFees(); updateDashboard(); }
async function loadExams() { const { data } = await sb.from('exams').select('*').eq('school_id', S.schoolId).order('exam_date', { ascending: false }); S.exams = (data || []).map(mapExam); }
async function loadAlerts() { const { data } = await sb.from('alerts').select('*').eq('school_id', S.schoolId).order('sent_at', { ascending: false }); S.alerts = (data || []).map(mapAlert); }

// ═══════════════════════════════════════════════════════
// UI RENDERING & SECTION ROUTING
// ═══════════════════════════════════════════════════════
function renderSection(id) {
  const area = U.el('contentArea');
  const initMap = { dashboard: renderDashboard, students: async () => { await loadStudents(); renderStudents(); }, fees: async () => { await loadFees(); renderFees(); }, attendance: renderAttendance, exams: renderExams, reports: renderReports, settings: renderSettings };
  if (initMap[id]) initMap[id]();
}

// ── DASHBOARD ──
async function updateDashboard() {
  if (!sb || !S.schoolId || !U.el('dashStudents')) return;
  const today = U.today();
  const [stuRes, feeRes, attRes] = await Promise.all([sb.from('students').select('id, status', { count: 'exact' }).eq('school_id', S.schoolId), sb.from('fee_payments').select('total_amount, status').eq('school_id', S.schoolId), sb.from('attendance_records').select('status').eq('school_id', S.schoolId).eq('record_date', today)]);
  const total = stuRes.count || 0; const paid = feeRes.data?.filter(f => f.status === 'paid').reduce((t, f) => t + Number(f.total_amount), 0) || 0; const pending = feeRes.data?.filter(f => f.status !== 'paid').reduce((t, f) => t + Number(f.total_amount), 0) || 0; const present = attRes.data?.filter(a => a.status === 'P').length || 0;
  U.el('dashStudents').textContent = total; U.el('dashPaid').textContent = U.fmtCurrency(paid); U.el('dashPending').textContent = U.fmtCurrency(pending); U.el('dashPresent').textContent = present; U.el('navStudentCount').textContent = total;
}
async function renderDashboard() {
  U.el('contentArea').innerHTML = `
    <div class="section active">
      <div class="welcome-banner"><div class="banner-content"><div class="banner-title">Namaskar, ${U.esc(S.user?.user_metadata?.full_name || 'Admin')}! 🙏</div><div class="banner-sub">Today's overview — ${U.today()}</div>
      <div class="banner-chips"><div class="banner-chip"><div class="chip-label">Students</div><div class="chip-value" id="dashStudents">0</div></div><div class="banner-chip"><div class="chip-label">Present Today</div><div class="chip-value" id="dashPresent">0</div></div><div class="banner-chip"><div class="chip-label">Fees Paid</div><div class="chip-value" id="dashPaid">₹0</div></div><div class="banner-chip"><div class="chip-label">Fees Pending</div><div class="chip-value" id="dashPending">₹0</div></div></div></div></div>
      <div class="quick-grid" style="max-width:800px">
        <div class="quick-card" onclick="showSection('students')"><div class="quick-icon">👨‍🎓</div><div class="quick-title">Manage Students</div><div class="quick-desc">Add, edit or view students</div></div>
        <div class="quick-card" onclick="showSection('fees')"><div class="quick-icon">💰</div><div class="quick-title">Record Fees</div><div class="quick-desc">Track fee payments</div></div>
        <div class="quick-card" onclick="showSection('attendance')"><div class="quick-icon">✅</div><div class="quick-title">Mark Attendance</div><div class="quick-desc">Today's presence</div></div>
        <div class="quick-card" onclick="showSection('exams')"><div class="quick-icon">📝</div><div class="quick-title">Exams</div><div class="quick-desc">Schedule & results</div></div>
      </div>
    </div>`;
  await updateDashboard();
}

// ── STUDENTS ──
function renderStudents() {
  const area = U.el('contentArea');
  area.innerHTML = `<div class="section active"><div class="section-header"><div><div class="section-title">Student Management</div></div><button class="btn btn-primary" onclick="openStudentModal()">+ Add Student</button></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Class</th><th>Roll</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody id="studentsBody"></tbody></table></div></div></div>`;
  const tbody = U.el('studentsBody');
  if (!S.students.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👨‍🎓</div><div class="empty-title">No students</div></div></td></tr>'; return; }
  tbody.innerHTML = S.students.map(s => `<tr>
    <td class="td-primary">${U.esc(s.name)}</td><td><span class="badge badge-primary">Class ${U.esc(s.class)}</span></td><td class="td-mono">${U.esc(s.roll || '—')}</td><td>${U.esc(s.phone)}</td>
    <td><span class="badge ${s.status==='active'?'badge-success':'badge-danger'}">${s.status}</span></td>
    <td><button class="btn btn-xs btn-outline" onclick="editStudent('${s.id}')">✏️</button> <button class="btn btn-xs btn-outline text-danger" onclick="deleteStudent('${s.id}','${U.esc(s.name)}')">🗑️</button></td>
  </tr>`).join('');
}
function populateClassSelects() {
  const opts = Array.from({length:12},(_,i)=>`<option value="${i+1}">Class ${i+1}</option>`).join('');
  ['stuClass'].forEach(id => { const el = U.el(id); if(el) el.innerHTML = '<option value="">Select Class</option>' + opts; });
}
function openStudentModal(id=null) {
  if(S.role==='viewer'){Toast.error('Access Denied');return;} U.el('editStuId').value=''; ['stuName','stuRoll','stuPhone','stuFather','stuConveyance'].forEach(f=>{if(U.el(f))U.el(f).value='';}); U.el('stuStatus').value='active'; populateClassSelects();
  if(id){ const s=S.students.find(x=>x.id===id); if(!s)return; U.el('editStuId').value=s.id; U.el('stuName').value=s.name; U.el('stuClass').value=s.class; U.el('stuRoll').value=s.roll||''; U.el('stuPhone').value=s.phone; U.el('stuFather').value=s.father||''; U.el('stuConveyance').value=s.conveyance||0; U.el('stuStatus').value=s.status; U.el('studentModalTitle').textContent='Edit Student'; }
  else { U.el('studentModalTitle').textContent='Add New Student'; } openModal('studentModal');
}
function editStudent(id) { openStudentModal(id); }
async function saveStudent() {
  const id = U.el('editStuId').value;
  const payload = { name: U.el('stuName').value.trim(), class_name: U.el('stuClass').value, roll_number: U.el('stuRoll').value.trim(), father_name: U.el('stuFather').value.trim(), phone: U.el('stuPhone').value.trim(), conveyance_fee: Number(U.el('stuConveyance').value||0), status: U.el('stuStatus').value, school_id: S.schoolId };
  try { if (id) { await sb.from('students').update(payload).eq('id', id); Toast.success('Student Updated'); } else { await sb.from('students').insert(payload); Toast.success('Student Added'); } closeModal('studentModal'); loadStudents(); }
  catch (err) { Toast.error('Save Failed', err.message); }
}
async function deleteStudent(id, name) { const ok = await showConfirm('Delete Student', `Delete "${name}"?`, '🗑️'); if(!ok) return; try { await sb.from('students').delete().eq('id', id); Toast.warning('Deleted', `${name} removed`); loadStudents(); } catch (err) { Toast.error('Failed', err.message); } }

// ── FEES ──
function renderFees() {
  const area = U.el('contentArea');
  area.innerHTML = `<div class="section active"><div class="section-header"><div><div class="section-title">Fee Management</div></div><button class="btn btn-primary" onclick="openFeeModal()">+ Record Payment</button></div>
  <div class="grid-3 mb-6">
    <div class="stat-card"><div class="stat-value" style="color:var(--success)">${U.fmtCurrency(S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.totalAmount),0))}</div><div class="stat-label">Collected</div></div>
    <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${U.fmtCurrency(S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount),0))}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-value">${S.fees.length}</div><div class="stat-label">Total Records</div></div>
  </div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Student</th><th>Month</th><th>Amount</th><th>Mode</th><th>Status</th></tr></thead><tbody id="feesBody"></tbody></table></div></div></div>`;
  const tbody = U.el('feesBody');
  if (!S.fees.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">No fees</div></div></td></tr>'; return; }
  tbody.innerHTML = S.fees.map(f => `<tr><td class="td-mono">${U.esc(f.receipt?.slice(-10)||'—')}</td><td class="td-primary">${U.esc(f.studentName)}</td><td>${U.esc(f.month)}</td><td style="font-weight:800">${U.fmtCurrency(f.totalAmount)}</td><td>${U.esc(f.mode)}</td><td><span class="badge ${f.status==='paid'?'badge-success':'badge-danger'}">${f.status}</span></td></tr>`).join('');
}
function openFeeModal() {
  if(S.role==='viewer'){Toast.error('Access Denied');return;} U.el('feeStu').innerHTML = '<option value="">Select...</option>' + S.students.map(s=>`<option value="${s.id}">${U.esc(s.name)} (Class ${s.class})</option>`).join('');
  U.el('feeMonth').value = new Date().toISOString().slice(0,7); U.el('feeAmount').value=''; U.el('feeStatus').value='paid'; openModal('feeModal');
}
async function saveFee() {
  const stuId = U.el('feeStu').value; const month = U.el('feeMonth').value; const amount = Number(U.el('feeAmount').value||0);
  if(!stuId||!month||!amount){Toast.warning('Fill all fields');return;}
  const receipt = `RCP-${month.replace('-','')}-${String(S.fees.length+1).padStart(4,'0')}`;
  try { await sb.from('fee_payments').insert({ school_id:S.schoolId, student_id:stuId, receipt_number:receipt, month, total_amount:amount, payment_mode:U.el('feeMode').value, status:U.el('feeStatus').value }); Toast.success('Payment Recorded', U.fmtCurrency(amount)); closeModal('feeModal'); loadFees(); }
  catch(err){Toast.error('Failed',err.message);}
}

// ── ATTENDANCE ──
async function renderAttendance() {
  const area = U.el('contentArea'); const today = U.today();
  const classes = Array.from({length:12},(_,i)=>i+1);
  area.innerHTML = `<div class="section active"><div class="section-header"><div class="section-title">Attendance Tracking</div></div>
  <div class="card" style="margin-bottom:20px"><div class="card-body-sm" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
    <select class="form-control" id="attClass" style="width:150px"><option value="">Select Class...</option>${classes.map(c=>`<option value="${c}">Class ${c}</option>`).join('')}</select>
    <input type="date" class="form-control" id="attDate" value="${today}" style="width:170px"/>
    <button class="btn btn-primary" onclick="loadAttendanceUI()">Load Students</button>
    <button class="btn btn-success" onclick="saveAttendance()" id="saveAttBtn" disabled>💾 Save Attendance</button>
  </div></div>
  <div class="card"><div class="card-body" id="attList"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-desc">Select class and date above</div></div></div></div></div>`;
}
async function loadAttendanceUI() {
  const cls = U.el('attClass').value; const date = U.el('attDate').value; if(!cls) return;
  const students = S.students.filter(s=>String(s.class)===cls&&s.status==='active');
  const { data: existing } = await sb.from('attendance_records').select('student_id, status').eq('school_id', S.schoolId).eq('class_name', cls).eq('record_date', date);
  S.tempAtt = {}; (existing||[]).forEach(r => S.tempAtt[r.student_id] = r.status);
  U.el('saveAttBtn').disabled = S.role === 'viewer';
  U.el('attList').innerHTML = students.map(s => `
    <div class="att-row" id="row-${s.id}"><div style="flex:1"><div class="att-name">${U.esc(s.name)}</div><div style="font-size:12px;color:var(--text3)">Roll: ${U.esc(s.roll||'—')}</div></div>
    <div class="att-btns">
      <button class="att-btn ${S.tempAtt[s.id]==='P'?'present':''}" onclick="markAtt('${s.id}','P')">P</button>
      <button class="att-btn ${S.tempAtt[s.id]==='A'?'absent':''}" onclick="markAtt('${s.id}','A')">A</button>
    </div></div>`).join('');
}
function markAtt(stuId, status) {
  S.tempAtt[stuId] = status; const row = document.getElementById('row-'+stuId);
  if(row){row.querySelectorAll('.att-btn').forEach(b=>b.classList.remove('present','absent')); const idx={P:0,A:1}; row.querySelectorAll('.att-btn')[idx[status]]?.classList.add(status==='P'?'present':'absent');}
}
async function saveAttendance() {
  if(S.role==='viewer') return; const cls=U.el('attClass').value; const date=U.el('attDate').value; if(!cls) return;
  const upserts = Object.entries(S.tempAtt).map(([studentId, status]) => ({ school_id:S.schoolId, student_id:studentId, class_name:cls, record_date:date, status:status, marked_by:S.user.id }));
  try { await sb.from('attendance_records').upsert(upserts, { onConflict: 'student_id,record_date' }); Toast.success('Attendance Saved', `Class ${cls}`); }
  catch(err){Toast.error('Failed',err.message);}
}

// ── EXAMS ──
async function renderExams() { await loadExams(); const area = U.el('contentArea');
  area.innerHTML = `<div class="section active"><div class="section-header"><div class="section-title">Exams & Results</div><button class="btn btn-primary" onclick="openExamModal()">+ Create Exam</button></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Subject</th><th>Class</th><th>Date</th><th>Type</th></tr></thead><tbody id="examsBody"></tbody></table></div></div></div>`;
  const tbody = U.el('examsBody');
  if(!S.exams.length){tbody.innerHTML='<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📝</div><div class="empty-desc">No exams scheduled</div></div></td></tr>';return;}
  tbody.innerHTML = S.exams.map(e=>`<tr><td class="td-primary">${U.esc(e.name)}</td><td>${U.esc(e.subject)}</td><td><span class="badge badge-primary">Class ${U.esc(e.class)}</span></td><td>${U.esc(e.date)}</td><td><span class="badge badge-gray">${e.type}</span></td></tr>`).join('');
}
async function openExamModal() {
  const name=prompt("Exam Name:"); const subject=prompt("Subject:"); const cls=prompt("Class:"); const date=prompt("Date (YYYY-MM-DD):"); const type=prompt("Type (written/mcq):")||'written';
  if(!name||!subject||!cls||!date) return;
  try{await sb.from('exams').insert({school_id:S.schoolId, name, subject, class_name:cls, exam_date:date, exam_type:type}); Toast.success('Exam Created'); renderExams();}catch(err){Toast.error('Failed',err.message);}
}

// ── REPORTS ──
function renderReports() { U.el('contentArea').innerHTML = `<div class="section active"><div class="section-header"><div class="section-title">Reports & Analytics</div></div><div class="card"><div class="card-body"><div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Analytics Dashboard</div><div class="empty-desc">Student and fee analytics sync in real-time via Supabase.</div></div></div></div></div>`; }

// ── SETTINGS ──
function renderSettings() { U.el('contentArea').innerHTML = `<div class="section active"><div class="section-header"><div class="section-title">Settings</div></div>
  <div class="card"><div class="card-header"><span class="card-title">🏫 School Details</span></div><div class="card-body">
    <div class="grid-2"><div class="form-group"><label class="form-label">School Name</label><input class="form-control" id="cfgSchoolName" value="${U.esc(S.settings.schoolName)}"/></div><div class="form-group"><label class="form-label">Academic Year</label><input class="form-control" id="cfgYear" value="${U.esc(S.settings.academicYear)}"/></div></div>
    <button class="btn btn-primary mt-2" onclick="saveSettings()">💾 Save Settings</button>
  </div></div></div>`;
}
async function saveSettings() {
  try { await sb.from('schools').update({ name: U.el('cfgSchoolName').value.trim(), academic_year: U.el('cfgYear').value.trim() }).eq('id', S.schoolId); S.settings.schoolName = U.el('cfgSchoolName').value.trim(); U.el('sidebarSchoolName').textContent = U.esc(S.settings.schoolName); Toast.success('Settings Saved'); }
  catch(err) { Toast.error('Failed', err.message); }
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.theme = localStorage.getItem('em_theme') || 'light';
  if (initSupabase()) initAuth(); else U.el('loginPage').innerHTML = `<div class="login-card" style="max-width:600px"><h2>⚙️ Setup Required</h2><p style="margin-top:12px">Configure env.js with Supabase keys.</p></div>`;
});