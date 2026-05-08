// ═══════════════════════════════════════════════════════
// EDUMANAGE PRO v7 — PREMIUM EDITION
// Roles: admin (full) | teacher (assigned classes) | viewer (read-only)
// ═══════════════════════════════════════════════════════

'use strict';

let sb = null;
function initSupabase() {
  if (!window.ENV?.SUPABASE_URL || !window.ENV?.SUPABASE_ANON_KEY) {
    document.getElementById('loginPage').innerHTML = `<div class="login-card"><div class="login-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L2 7l10 5 10-5L22 7l-10-5z"/></svg></div><h2 style="margin-top:16px">⚙️ Setup Required</h2><p style="margin-top:10px;color:var(--text3)">Please fill your Supabase keys in <b>env.js</b> and reload.</p></div>`;
    return false;
  }
  sb = window.supabase.createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);
  return true;
}

// ══ GLOBAL STATE ══
const S = {
  user: null,
  role: 'viewer',
  schoolId: '',
  assignedClasses: null,   // null = all (admin), array = teacher's classes
  members: [],             // school_members list (admin only)
  students: [],
  fees: [],
  exams: [],
  settings: { schoolName: '', academicYear: '2024-25', phone: '', address: '', board: 'CBSE' },
  currentSection: 'dashboard',
  tempAtt: {}
};

// ══ UTILITIES ══
const U = {
  today: () => new Date().toISOString().split('T')[0],
  esc: s => s == null ? '' : String(s).replace(/[&<>'"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c] || c)),
  fmtCurrency: n => '₹' + Number(n || 0).toLocaleString('en-IN'),
  el: id => document.getElementById(id),
  avatar: name => { const w = String(name || '').trim().split(' '); return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : (String(name || '?').slice(0, 2)).toUpperCase(); },
  // Check if current user (teacher) can see this class
  canAccessClass: cls => {
    if (S.role === 'admin' || S.role === 'viewer') return true;
    if (!S.assignedClasses || S.assignedClasses.length === 0) return false;
    return S.assignedClasses.includes(String(cls));
  },
  // Classes list for dropdowns (teacher sees only assigned, admin sees all 1-12)
  classOptions: () => {
    const all = Array.from({length:12},(_,i)=>String(i+1));
    const allowed = (S.role === 'teacher' && S.assignedClasses?.length)
      ? S.assignedClasses.map(String)
      : all;
    return allowed.map(c => `<option value="${c}">Class ${c}</option>`).join('');
  },
  isReadOnly: () => S.role === 'viewer',
};

// ══ TOAST NOTIFICATIONS ══
const Toast = {
  show(title, msg = '', type = 'info', duration = 4000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const c = U.el('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<div class="toast-icon">${icons[type]||'ℹ️'}</div>
      <div class="toast-content">
        <div class="toast-title">${U.esc(title)}</div>
        ${msg ? `<div class="toast-msg">${U.esc(msg)}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
    c.appendChild(t);
    setTimeout(() => {
      if (t.parentNode) {
        t.style.animation = 'toastOut .3s ease forwards';
        setTimeout(() => t.parentNode && t.remove(), 300);
      }
    }, duration);
  },
  success: (t, m) => Toast.show(t, m, 'success'),
  error:   (t, m) => Toast.show(t, m, 'error', 6000),
  warning: (t, m) => Toast.show(t, m, 'warning'),
  info:    (t, m) => Toast.show(t, m, 'info'),
};

// ══ CONFIRM DIALOG ══
let _confirmResolve = null;
function showConfirm(title, msg, icon = '⚠️', danger = true) {
  return new Promise(res => {
    _confirmResolve = res;
    U.el('confirmIcon').textContent = icon;
    U.el('confirmTitle').textContent = title;
    U.el('confirmMsg').textContent = msg;
    const okBtn = U.el('confirmOkBtn');
    if (okBtn) { okBtn.className = danger ? 'btn btn-danger w-full' : 'btn btn-primary w-full'; }
    U.el('confirmOverlay').style.display = 'flex';
  });
}
function resolveConfirm(result) {
  U.el('confirmOverlay').style.display = 'none';
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

// ══ THEME ══
function toggleTheme() {
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('em_theme', html.dataset.theme);
}

// ══ NAVIGATION ══
const TITLES = {
  dashboard:'Dashboard', students:'Student Management', fees:'Fee Management',
  attendance:'Attendance', exams:'Exams & Results', reports:'Reports & Analytics',
  team:'Team Management', settings:'Settings'
};

function showSection(id) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`[data-section="${id}"]`);
  if (nav) nav.classList.add('active');
  U.el('pageTitle').textContent = TITLES[id] || id;
  S.currentSection = id;
  closeSidebar();
  renderSection(id);
}
function toggleSidebar()  { U.el('sidebar').classList.toggle('show'); U.el('sidebarOverlay').classList.toggle('show'); }
function closeSidebar()   { U.el('sidebar').classList.remove('show'); U.el('sidebarOverlay').classList.remove('show'); }
function openModal(id)    { U.el(id)?.classList.remove('hidden'); }
function closeModal(id)   { U.el(id)?.classList.add('hidden'); }

// ══ AUTH PANEL TOGGLE ══
function toggleAuthPanel(type) {
  const loginPanel  = U.el('loginFormPanel');
  const signupPanel = U.el('signupFormPanel');
  const errBox      = U.el('loginError');
  if (!loginPanel || !signupPanel) return;
  if (type === 'signup') {
    loginPanel.style.display  = 'none';
    signupPanel.style.display = 'block';
  } else {
    signupPanel.style.display = 'none';
    loginPanel.style.display  = 'block';
  }
  if (errBox) { errBox.textContent = ''; errBox.style.display = 'none'; }
}

// ══ DATA MAPPERS ══
function mapStudent(s) {
  return {
    id: s.id, name: s.name, class: s.class_name,
    roll: s.roll_number, father: s.father_name,
    phone: s.phone, conveyance: s.conveyance_fee,
    status: s.status, email: s.email || '',
    address: s.address || ''
  };
}
function mapFee(f) {
  const stu = S.students.find(s => s.id === f.student_id);
  return {
    id: f.id, receipt: f.receipt_number,
    studentId: f.student_id,
    studentName: stu?.name || 'Unknown',
    studentClass: stu?.class || '',
    month: f.month, amount: f.total_amount,
    totalAmount: f.total_amount,
    mode: f.payment_mode, status: f.status
  };
}
function mapExam(e) {
  return {
    id: e.id, name: e.name, subject: e.subject,
    class: e.class_name, date: e.exam_date,
    maxMarks: e.max_marks, passMarks: e.pass_marks,
    type: e.exam_type
  };
}

// ═══════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════
async function signInWithGoogle() {
  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  } catch (err) { Toast.error('Google Sign-in Failed', err.message); }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = U.el('loginBtn');
  const errBox = U.el('loginError');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';
  errBox.style.display = 'none';
  try {
    const email = U.el('loginEmail').value.trim();
    const password = U.el('loginPassword').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    S.user = data.user;
    await initApp();
  } catch (err) {
    errBox.textContent = '⚠️ ' + err.message;
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const btn = U.el('signupBtn');
  const errBox = U.el('loginError');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating...';
  errBox.style.display = 'none';

  const name   = U.el('signupName').value.trim();
  const school = U.el('signupSchool').value.trim();
  const email  = U.el('signupEmail').value.trim();
  const password = U.el('signupPassword').value;

  try {
    // 1. Create Supabase auth user
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    });
    if (error) throw error;

    // 2. If auto-confirmed, create school + membership immediately
    if (data.user && data.session) {
      await _createSchoolForNewUser(data.user.id, school);
      S.user = data.user;
      await initApp();
    } else {
      // Email confirmation required
      Toast.success('Account Created! ✅', 'Check your email to verify, then Sign In.');
      toggleAuthPanel('login');
    }
  } catch (err) {
    errBox.textContent = '⚠️ ' + err.message;
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Admin Account';
  }
}

async function _createSchoolForNewUser(userId, schoolName) {
  const { data: school, error: schoolErr } = await sb.from('schools')
    .insert({ name: schoolName, owner_id: userId, academic_year: '2024-25', board: 'CBSE' })
    .select().single();
  if (schoolErr) throw schoolErr;

  const { error: memberErr } = await sb.from('school_members').insert({
    school_id: school.id, user_id: userId,
    role: 'admin', accepted_at: new Date().toISOString(),
    display_name: '', assigned_classes: null
  });
  if (memberErr) throw memberErr;

  // Seed default fee structures
  const feeInserts = [];
  Array.from({length:12}, (_,i) => String(i+1)).forEach(cls => {
    [
      { key:'tuition',     label:'Tuition Fee',       amt:3000, en:true,  ao:true  },
      { key:'computer',    label:'Computer Lab Fee',   amt:200,  en:true,  ao:false },
      { key:'science',     label:'Science Lab Fee',    amt:150,  en:false, ao:false },
      { key:'sports',      label:'Sports Fee',         amt:100,  en:true,  ao:false },
      { key:'library',     label:'Library Fee',        amt:50,   en:true,  ao:false },
      { key:'exam',        label:'Exam Fee',           amt:100,  en:false, ao:false },
      { key:'development', label:'Development Fund',   amt:100,  en:true,  ao:false },
      { key:'conveyance',  label:'Conveyance',         amt:0,    en:false, ao:false },
    ].forEach(comp => feeInserts.push({
      school_id: school.id, class_name: cls,
      component_key: comp.key, component_label: comp.label,
      amount: comp.amt, enabled: comp.en, always_on: comp.ao
    }));
  });
  await sb.from('fee_structures').insert(feeInserts);
  return school;
}

async function handleLogout() {
  const ok = await showConfirm('Sign Out', 'Are you sure you want to sign out?', '👋', false);
  if (!ok) return;
  await sb.auth.signOut();
  location.reload();
}

// ══ SESSION & APP INIT ══
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { S.user = session.user; await initApp(); }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) { S.user = session.user; await initApp(); }
    else if (event === 'SIGNED_OUT') {
      U.el('loginPage').style.display = 'flex';
      U.el('appPage').classList.remove('active');
    }
  });
}

async function initApp() {
  try {
    // Get membership (could be in multiple schools — take first/latest)
    const { data: memberships, error: memErr } = await sb
      .from('school_members')
      .select('school_id, role, assigned_classes, display_name, email')
      .eq('user_id', S.user.id)
      .order('invited_at', { ascending: false });

    if (memErr) throw memErr;

    if (!memberships || memberships.length === 0) {
      // Brand new user — show school setup wizard
      showSchoolSetup();
      return;
    }

    const membership = memberships[0];
    S.schoolId       = membership.school_id;
    S.role           = membership.role;
    S.assignedClasses = membership.assigned_classes
      ? (Array.isArray(membership.assigned_classes)
          ? membership.assigned_classes.map(String)
          : JSON.parse(membership.assigned_classes).map(String))
      : null;

    // Load school info
    const { data: school } = await sb.from('schools').select('*').eq('id', S.schoolId).single();
    if (school) {
      S.settings = {
        schoolName:   school.name,
        academicYear: school.academic_year,
        phone:        school.phone || '',
        address:      school.address || '',
        board:        school.board || 'CBSE'
      };
    }

    // Update UI identity
    const name = S.user.user_metadata?.full_name || membership.display_name || S.user.email.split('@')[0];
    U.el('userName').textContent    = U.esc(name);
    U.el('userAvatar').textContent  = U.avatar(name);
    U.el('userRole').textContent    = _roleLabel(S.role);
    U.el('sidebarSchoolName').textContent = U.esc(S.settings.schoolName || 'My School');

    // Role badge in topbar
    const badges = {
      admin:   '<span class="badge badge-primary">👨‍💼 Admin</span>',
      teacher: '<span class="badge badge-success">👩‍🏫 Teacher</span>',
      viewer:  '<span class="badge badge-gray">👁️ Viewer</span>'
    };
    U.el('topbarRoleBadge').innerHTML = badges[S.role] || '';

    // Inject admin-only nav items
    _buildNav();

    // Hide pages
    U.el('loginPage').style.display = 'none';
    U.el('appPage').classList.add('active');

    // Start realtime + load dashboard
    setupRealtime();
    showSection('dashboard');
    Toast.success('Welcome back!', name);

  } catch (err) {
    console.error('initApp error:', err);
    Toast.error('Login Error', err.message);
  }
}

function _roleLabel(role) {
  return { admin: 'Administrator', teacher: 'Teacher', viewer: 'Viewer' }[role] || role;
}

function _buildNav() {
  const adminNav = U.el('adminNavItems');
  if (!adminNav) return;
  if (S.role === 'admin') {
    adminNav.innerHTML = `
      <div class="nav-item" data-section="team" onclick="showSection('team')">
        <div class="nav-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div>
        Team Management
      </div>`;
  } else {
    adminNav.innerHTML = '';
  }
  // Teacher class info pill
  if (S.role === 'teacher' && S.assignedClasses?.length) {
    const pill = document.createElement('div');
    pill.className = 'nav-class-pill';
    pill.innerHTML = `<span>Your Classes: ${S.assignedClasses.map(c=>`<b>Class ${c}</b>`).join(', ')}</span>`;
    adminNav.appendChild(pill);
  }
}

// ══ FIRST-TIME SCHOOL SETUP ══
function showSchoolSetup() {
  const name = S.user.user_metadata?.full_name || S.user.email.split('@')[0];
  U.el('loginPage').style.display = 'none';
  U.el('appPage').classList.add('active');
  U.el('sidebarSchoolName').textContent = 'Setting up...';

  U.el('contentArea').innerHTML = `
    <div class="section active" style="max-width:500px;margin:60px auto;text-align:center">
      <div style="font-size:64px;margin-bottom:16px">🏫</div>
      <div class="section-title" style="margin-bottom:8px">Welcome, ${U.esc(name)}!</div>
      <p style="color:var(--text3);margin-bottom:28px;font-size:15px">Set up your school to get started with EduManage Pro.</p>
      <div class="card" style="text-align:left">
        <div class="card-body">
          <div class="form-group"><label class="form-label">School Name *</label><input class="form-control" id="setupSchoolName" placeholder="e.g. Sunrise Public School"/></div>
          <div class="form-group"><label class="form-label">Academic Year</label><input class="form-control" id="setupYear" value="2024-25"/></div>
          <div class="form-group"><label class="form-label">Board</label>
            <select class="form-control" id="setupBoard">
              <option>CBSE</option><option>ICSE</option><option>UP Board</option><option>MP Board</option><option>Other</option>
            </select>
          </div>
          <button class="btn btn-primary w-full" style="padding:13px;font-size:15px" onclick="completeSchoolSetup()">🚀 Create & Enter Dashboard</button>
        </div>
      </div>
    </div>`;
}

async function completeSchoolSetup() {
  const schoolName = U.el('setupSchoolName')?.value.trim();
  if (!schoolName) { Toast.warning('School name is required'); return; }
  try {
    await _createSchoolForNewUser(S.user.id, schoolName);
    Toast.success('School Created!', 'Welcome to EduManage Pro 🎉');
    await initApp();
  } catch (err) {
    Toast.error('Setup Failed', err.message);
    console.error(err);
  }
}

// ══ REALTIME SUBSCRIPTIONS ══
function setupRealtime() {
  if (!S.schoolId) return;
  sb.channel('school-updates-' + S.schoolId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `school_id=eq.${S.schoolId}` },
        () => { if (S.currentSection === 'students') loadStudents(); else updateDashboardCounts(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fee_payments', filter: `school_id=eq.${S.schoolId}` },
        () => { if (S.currentSection === 'fees') loadFees(); else updateDashboardCounts(); })
    .subscribe();
}

// ═══════════════════════════════════════════════════════
// DATA LOADING (with class filter for teachers)
// ═══════════════════════════════════════════════════════
async function loadStudents() {
  let query = sb.from('students').select('*').eq('school_id', S.schoolId).order('class_name').order('name');
  // RLS already filters by class for teachers; this is a UI-level double-check
  const { data, error } = await query;
  if (error) { console.error('loadStudents:', error); return; }
  S.students = (data || [])
    .filter(s => U.canAccessClass(s.class_name))
    .map(mapStudent);
  if (S.currentSection === 'students') renderStudents();
  updateDashboardCounts();
}

async function loadFees() {
  const { data, error } = await sb.from('fee_payments').select('*').eq('school_id', S.schoolId).order('created_at', { ascending: false });
  if (error) { console.error('loadFees:', error); return; }
  // Filter fees to only relevant students (teacher class filter)
  const allowedStudentIds = new Set(S.students.map(s => s.id));
  S.fees = (data || []).filter(f => allowedStudentIds.has(f.student_id)).map(mapFee);
  if (S.currentSection === 'fees') renderFees();
  updateDashboardCounts();
}

async function loadExams() {
  const { data, error } = await sb.from('exams').select('*').eq('school_id', S.schoolId).order('exam_date', { ascending: false });
  if (error) { console.error('loadExams:', error); return; }
  S.exams = (data || []).filter(e => U.canAccessClass(e.class_name)).map(mapExam);
}

async function loadMembers() {
  if (S.role !== 'admin') return;
  const { data, error } = await sb.from('school_members').select('*').eq('school_id', S.schoolId);
  if (error) { console.error('loadMembers:', error); return; }
  S.members = data || [];
}

// ═══════════════════════════════════════════════════════
// SECTION ROUTING
// ═══════════════════════════════════════════════════════
function renderSection(id) {
  const map = {
    dashboard:  () => renderDashboard(),
    students:   async () => { await loadStudents(); renderStudents(); },
    fees:       async () => { await loadStudents(); await loadFees(); renderFees(); },
    attendance: () => renderAttendance(),
    exams:      async () => { await loadExams(); renderExams(); },
    reports:    () => renderReports(),
    team:       async () => { if (S.role !== 'admin') { Toast.error('Admin Only'); return; } await loadMembers(); renderTeam(); },
    settings:   () => renderSettings(),
  };
  if (map[id]) map[id]();
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
async function updateDashboardCounts() {
  if (!sb || !S.schoolId) return;
  const today = U.today();
  const [stuRes, feeRes, attRes] = await Promise.all([
    sb.from('students').select('id,status', { count: 'exact' }).eq('school_id', S.schoolId),
    sb.from('fee_payments').select('total_amount,status').eq('school_id', S.schoolId),
    sb.from('attendance_records').select('status').eq('school_id', S.schoolId).eq('record_date', today)
  ]);

  // Teacher: filter counts to own classes
  const stuData = (stuRes.data || []).filter(s => {
    const stu = S.students.find(x => x.id === s.id);
    return stu ? U.canAccessClass(stu.class) : S.role === 'admin';
  });

  const total   = S.role === 'admin' ? (stuRes.count || 0) : stuData.length;
  const feeData = (feeRes.data || []);
  const paid    = feeData.filter(f => f.status === 'paid').reduce((t,f) => t + Number(f.total_amount), 0);
  const pending = feeData.filter(f => f.status !== 'paid').reduce((t,f) => t + Number(f.total_amount), 0);
  const present = (attRes.data || []).filter(a => a.status === 'P').length;

  const set = (id, v) => { const el = U.el(id); if (el) el.textContent = v; };
  set('dashStudents', total);
  set('dashPaid',     U.fmtCurrency(paid));
  set('dashPending',  U.fmtCurrency(pending));
  set('dashPresent',  present);
  set('navStudentCount', total);
}

async function renderDashboard() {
  const roleInfo = S.role === 'teacher' && S.assignedClasses?.length
    ? `<div class="banner-note">📚 Your classes: ${S.assignedClasses.map(c=>`Class ${c}`).join(', ')}</div>` : '';

  U.el('contentArea').innerHTML = `
    <div class="section active">
      <div class="welcome-banner">
        <div class="banner-content">
          <div class="banner-title">Namaskar, ${U.esc(S.user?.user_metadata?.full_name || 'User')}! 🙏</div>
          <div class="banner-sub">Today's overview — ${U.today()} &nbsp;|&nbsp; ${_roleLabel(S.role)}</div>
          ${roleInfo}
          <div class="banner-chips">
            <div class="banner-chip"><div class="chip-label">Students</div><div class="chip-value" id="dashStudents">—</div></div>
            <div class="banner-chip"><div class="chip-label">Present Today</div><div class="chip-value" id="dashPresent">—</div></div>
            <div class="banner-chip"><div class="chip-label">Fees Collected</div><div class="chip-value" id="dashPaid">—</div></div>
            <div class="banner-chip"><div class="chip-label">Fees Pending</div><div class="chip-value" id="dashPending">—</div></div>
          </div>
        </div>
      </div>
      <div class="quick-grid">
        <div class="quick-card" onclick="showSection('students')"><div class="quick-icon">👨‍🎓</div><div class="quick-title">Students</div><div class="quick-desc">Add, edit or view student records</div></div>
        <div class="quick-card" onclick="showSection('fees')"><div class="quick-icon">💰</div><div class="quick-title">Fee Management</div><div class="quick-desc">Track & record payments</div></div>
        <div class="quick-card" onclick="showSection('attendance')"><div class="quick-icon">✅</div><div class="quick-title">Attendance</div><div class="quick-desc">Mark today's attendance</div></div>
        <div class="quick-card" onclick="showSection('exams')"><div class="quick-icon">📝</div><div class="quick-title">Exams</div><div class="quick-desc">Schedule & manage results</div></div>
        ${S.role === 'admin' ? `<div class="quick-card" onclick="showSection('team')"><div class="quick-icon">👥</div><div class="quick-title">Team</div><div class="quick-desc">Manage teachers & roles</div></div>` : ''}
        <div class="quick-card" onclick="showSection('reports')"><div class="quick-icon">📊</div><div class="quick-title">Reports</div><div class="quick-desc">Analytics & insights</div></div>
      </div>
    </div>`;
  await updateDashboardCounts();
}

// ═══════════════════════════════════════════════════════
// STUDENTS
// ═══════════════════════════════════════════════════════
function renderStudents() {
  const canWrite = !U.isReadOnly();
  const area = U.el('contentArea');

  // Build class filter (teacher sees only own)
  const classFilterOpts = `<option value="">All Classes</option>` + (
    S.role === 'teacher' && S.assignedClasses?.length
      ? S.assignedClasses.map(c => `<option value="${c}">Class ${c}</option>`).join('')
      : Array.from({length:12},(_,i)=>`<option value="${i+1}">Class ${i+1}</option>`).join('')
  );

  area.innerHTML = `
    <div class="section active">
      <div class="section-header">
        <div>
          <div class="section-title">Student Management</div>
          <div style="font-size:13px;color:var(--text3);margin-top:2px">${S.students.length} students</div>
        </div>
        ${canWrite ? `<button class="btn btn-primary" onclick="openStudentModal()">+ Add Student</button>` : `<span class="badge badge-gray">👁️ View Only</span>`}
      </div>
      <div class="card mb-4">
        <div class="card-body-sm" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input class="form-control" id="stuSearch" placeholder="🔍 Search by name, roll, phone..." style="max-width:280px" oninput="filterStudentTable()"/>
          <select class="form-control" id="stuClassFilter" style="width:150px" onchange="filterStudentTable()">
            ${classFilterOpts}
          </select>
          <select class="form-control" id="stuStatusFilter" style="width:140px" onchange="filterStudentTable()">
            <option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Name</th><th>Class</th><th>Roll</th><th>Phone</th><th>Conveyance</th><th>Status</th>${canWrite?'<th>Actions</th>':''}</tr></thead>
            <tbody id="studentsBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  _renderStudentRows(S.students);
}

function _renderStudentRows(list) {
  const canWrite = !U.isReadOnly();
  const tbody = U.el('studentsBody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="${canWrite?8:7}"><div class="empty-state"><div class="empty-icon">👨‍🎓</div><div class="empty-title">No students found</div><div class="empty-desc">Add your first student to get started</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((s, i) => `
    <tr>
      <td class="td-mono" style="color:var(--text3)">${i+1}</td>
      <td class="td-primary">${U.esc(s.name)}</td>
      <td><span class="badge badge-primary">Class ${U.esc(s.class)}</span></td>
      <td class="td-mono">${U.esc(s.roll || '—')}</td>
      <td>${U.esc(s.phone)}</td>
      <td>${s.conveyance > 0 ? U.fmtCurrency(s.conveyance) : '<span style="color:var(--text3)">—</span>'}</td>
      <td><span class="badge ${s.status==='active'?'badge-success':'badge-danger'}">${s.status}</span></td>
      ${canWrite ? `<td>
        <button class="btn btn-xs btn-outline" onclick="editStudent('${s.id}')">✏️ Edit</button>
        ${S.role==='admin'?`<button class="btn btn-xs btn-outline text-danger" onclick="deleteStudent('${s.id}','${U.esc(s.name)}')">🗑️</button>`:''}
      </td>` : ''}
    </tr>`).join('');
}

function filterStudentTable() {
  const q   = (U.el('stuSearch')?.value || '').toLowerCase();
  const cls = U.el('stuClassFilter')?.value || '';
  const st  = U.el('stuStatusFilter')?.value || '';
  const filtered = S.students.filter(s =>
    (!q  || s.name.toLowerCase().includes(q) || (s.roll||'').toLowerCase().includes(q) || s.phone.includes(q)) &&
    (!cls || String(s.class) === String(cls)) &&
    (!st  || s.status === st)
  );
  _renderStudentRows(filtered);
}

function populateClassSelects() {
  const opts = U.classOptions();
  ['stuClass', 'examClass', 'attClass'].forEach(id => {
    const el = U.el(id);
    if (el) el.innerHTML = '<option value="">Select Class</option>' + opts;
  });
}

function openStudentModal(id = null) {
  if (U.isReadOnly()) { Toast.error('Access Denied', 'Viewers cannot add students'); return; }
  U.el('editStuId').value = '';
  ['stuName','stuRoll','stuPhone','stuFather','stuConveyance'].forEach(f => { const el = U.el(f); if (el) el.value = ''; });
  if (U.el('stuStatus')) U.el('stuStatus').value = 'active';
  populateClassSelects();

  if (id) {
    const s = S.students.find(x => x.id === id);
    if (!s) return;
    U.el('editStuId').value       = s.id;
    U.el('stuName').value         = s.name;
    U.el('stuClass').value        = s.class;
    U.el('stuRoll').value         = s.roll || '';
    U.el('stuPhone').value        = s.phone;
    U.el('stuFather').value       = s.father || '';
    U.el('stuConveyance').value   = s.conveyance || 0;
    U.el('stuStatus').value       = s.status;
    U.el('studentModalTitle').textContent = 'Edit Student';
  } else {
    U.el('studentModalTitle').textContent = 'Add New Student';
  }
  openModal('studentModal');
}

function editStudent(id) { openStudentModal(id); }

async function saveStudent() {
  if (U.isReadOnly()) { Toast.error('Access Denied'); return; }

  const name   = U.el('stuName').value.trim();
  const cls    = U.el('stuClass').value;
  const phone  = U.el('stuPhone').value.trim();

  // Validation
  if (!name)  { Toast.warning('Name is required'); return; }
  if (!cls)   { Toast.warning('Please select a class'); return; }
  if (!phone) { Toast.warning('Phone number is required'); return; }
  if (!/^\d{10}$/.test(phone.replace(/\s/g,''))) { Toast.warning('Enter a valid 10-digit phone number'); return; }

  // Teacher can only save to own assigned class
  if (S.role === 'teacher' && !U.canAccessClass(cls)) {
    Toast.error('Access Denied', `You are not assigned to Class ${cls}`);
    return;
  }

  const payload = {
    name,
    class_name:     cls,
    roll_number:    U.el('stuRoll').value.trim(),
    father_name:    U.el('stuFather').value.trim(),
    phone:          phone,
    conveyance_fee: Number(U.el('stuConveyance').value || 0),
    status:         U.el('stuStatus').value,
    school_id:      S.schoolId          // ← BUG FIX: was missing in some cases
  };

  const id = U.el('editStuId').value;
  try {
    if (id) {
      const { error } = await sb.from('students').update(payload).eq('id', id).eq('school_id', S.schoolId);
      if (error) throw error;
      Toast.success('Student Updated ✅', name);
    } else {
      const { error } = await sb.from('students').insert(payload);
      if (error) throw error;
      Toast.success('Student Added ✅', name);
    }
    closeModal('studentModal');
    await loadStudents();
  } catch (err) {
    console.error('saveStudent:', err);
    Toast.error('Save Failed', err.message);
  }
}

async function deleteStudent(id, name) {
  if (S.role !== 'admin') { Toast.error('Admin Only', 'Only admins can delete students'); return; }
  const ok = await showConfirm('Delete Student', `Permanently delete "${name}"? This will also remove fees & attendance records.`, '🗑️');
  if (!ok) return;
  try {
    const { error } = await sb.from('students').delete().eq('id', id).eq('school_id', S.schoolId);
    if (error) throw error;
    Toast.warning('Deleted', `${name} removed`);
    await loadStudents();
  } catch (err) { Toast.error('Delete Failed', err.message); }
}

// ═══════════════════════════════════════════════════════
// FEE MANAGEMENT
// ═══════════════════════════════════════════════════════
function renderFees() {
  const canWrite = !U.isReadOnly();
  const collected = S.fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.totalAmount),0);
  const pending   = S.fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.totalAmount),0);

  U.el('contentArea').innerHTML = `
    <div class="section active">
      <div class="section-header">
        <div><div class="section-title">Fee Management</div></div>
        ${canWrite ? `<button class="btn btn-primary" onclick="openFeeModal()">+ Record Payment</button>` : `<span class="badge badge-gray">👁️ View Only</span>`}
      </div>
      <div class="grid-3 mb-6">
        <div class="stat-card"><div class="stat-value" style="color:var(--success)">${U.fmtCurrency(collected)}</div><div class="stat-label">Total Collected</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${U.fmtCurrency(pending)}</div><div class="stat-label">Pending</div></div>
        <div class="stat-card"><div class="stat-value">${S.fees.length}</div><div class="stat-label">Total Records</div></div>
      </div>
      <div class="card mb-4">
        <div class="card-body-sm" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input class="form-control" id="feeSearch" placeholder="🔍 Search student name..." style="max-width:260px" oninput="filterFeeTable()"/>
          <select class="form-control" id="feeClassFilter" style="width:150px" onchange="filterFeeTable()">
            <option value="">All Classes</option>${U.classOptions()}
          </select>
          <select class="form-control" id="feeStatusFilter" style="width:150px" onchange="filterFeeTable()">
            <option value="">All Status</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="partial">Partial</option>
          </select>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table><thead><tr><th>Receipt</th><th>Student</th><th>Class</th><th>Month</th><th>Amount</th><th>Mode</th><th>Status</th></tr></thead>
          <tbody id="feesBody"></tbody></table>
        </div>
      </div>
    </div>`;
  _renderFeeRows(S.fees);
}

function _renderFeeRows(list) {
  const tbody = U.el('feesBody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">No fee records found</div></div></td></tr>`;
    return;
  }
  const modeIcon = { cash:'💵', upi:'📱', bank:'🏦', cheque:'📄' };
  tbody.innerHTML = list.map(f => `
    <tr>
      <td class="td-mono">${U.esc((f.receipt||'').slice(-12)||'—')}</td>
      <td class="td-primary">${U.esc(f.studentName)}</td>
      <td><span class="badge badge-primary">Class ${U.esc(f.studentClass)}</span></td>
      <td>${U.esc(f.month)}</td>
      <td style="font-weight:800;color:var(--text1)">${U.fmtCurrency(f.totalAmount)}</td>
      <td>${modeIcon[f.mode]||''} ${U.esc(f.mode)}</td>
      <td><span class="badge ${f.status==='paid'?'badge-success':f.status==='partial'?'badge-warning':'badge-danger'}">${f.status}</span></td>
    </tr>`).join('');
}

function filterFeeTable() {
  const q   = (U.el('feeSearch')?.value||'').toLowerCase();
  const cls = U.el('feeClassFilter')?.value||'';
  const st  = U.el('feeStatusFilter')?.value||'';
  const filtered = S.fees.filter(f =>
    (!q  || f.studentName.toLowerCase().includes(q)) &&
    (!cls || String(f.studentClass) === String(cls)) &&
    (!st  || f.status === st)
  );
  _renderFeeRows(filtered);
}

function openFeeModal() {
  if (U.isReadOnly()) { Toast.error('Access Denied'); return; }
  const students = S.students.filter(s => s.status === 'active');
  U.el('feeStu').innerHTML = '<option value="">Select student...</option>' +
    students.map(s => `<option value="${s.id}">${U.esc(s.name)} — Class ${U.esc(s.class)}</option>`).join('');
  U.el('feeMonth').value  = new Date().toISOString().slice(0,7);
  U.el('feeAmount').value = '';
  U.el('feeStatus').value = 'paid';
  U.el('feeMode').value   = 'cash';
  openModal('feeModal');
}

async function saveFee() {
  if (U.isReadOnly()) { Toast.error('Access Denied'); return; }
  const stuId  = U.el('feeStu').value;
  const month  = U.el('feeMonth').value;
  const amount = Number(U.el('feeAmount').value || 0);
  if (!stuId)  { Toast.warning('Select a student'); return; }
  if (!month)  { Toast.warning('Select a month'); return; }
  if (!amount) { Toast.warning('Enter fee amount'); return; }

  const receipt = `RCP-${month.replace('-','')}-${String(Date.now()).slice(-6)}`;
  try {
    const { error } = await sb.from('fee_payments').insert({
      school_id:    S.schoolId,
      student_id:   stuId,
      receipt_number: receipt,
      month,
      total_amount: amount,
      payment_mode: U.el('feeMode').value,
      status:       U.el('feeStatus').value,
      recorded_by:  S.user.id
    });
    if (error) throw error;
    Toast.success('Payment Recorded ✅', U.fmtCurrency(amount));
    closeModal('feeModal');
    await loadFees();
  } catch (err) {
    console.error('saveFee:', err);
    Toast.error('Failed to Save', err.message);
  }
}

// ═══════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════
async function renderAttendance() {
  const area = U.el('contentArea');
  const today = U.today();
  const classOpts = `<option value="">Select Class...</option>` + U.classOptions();

  area.innerHTML = `
    <div class="section active">
      <div class="section-header"><div class="section-title">Attendance Tracking</div></div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-body-sm" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
          <select class="form-control" id="attClass" style="width:160px">${classOpts}</select>
          <input type="date" class="form-control" id="attDate" value="${today}" style="width:170px" max="${today}"/>
          <button class="btn btn-primary" onclick="loadAttendanceUI()">Load Students</button>
          ${!U.isReadOnly() ? `<button class="btn btn-success" onclick="saveAttendance()" id="saveAttBtn" style="display:none">💾 Save Attendance</button>` : ''}
        </div>
      </div>
      <div id="attSummary"></div>
      <div class="card"><div class="card-body" id="attList">
        <div class="empty-state"><div class="empty-icon">📋</div><div class="empty-desc">Select a class and date, then click "Load Students"</div></div>
      </div></div>
    </div>`;
}

async function loadAttendanceUI() {
  const cls  = U.el('attClass').value;
  const date = U.el('attDate').value;
  if (!cls) { Toast.warning('Please select a class'); return; }
  if (!U.canAccessClass(cls)) { Toast.error('Access Denied', `Not assigned to Class ${cls}`); return; }

  const students = S.students.filter(s => String(s.class) === cls && s.status === 'active');
  if (!students.length) {
    U.el('attList').innerHTML = `<div class="empty-state"><div class="empty-icon">🤷</div><div class="empty-desc">No active students in Class ${cls}</div></div>`;
    return;
  }

  const { data: existing } = await sb.from('attendance_records').select('student_id, status').eq('school_id', S.schoolId).eq('class_name', cls).eq('record_date', date);
  S.tempAtt = {};
  (existing || []).forEach(r => S.tempAtt[r.student_id] = r.status);

  const saveBtn = U.el('saveAttBtn');
  if (saveBtn) saveBtn.style.display = 'inline-flex';

  // Summary
  const P = Object.values(S.tempAtt).filter(v=>v==='P').length;
  const A = Object.values(S.tempAtt).filter(v=>v==='A').length;
  U.el('attSummary').innerHTML = `
    <div class="att-summary-bar">
      <span class="att-chip att-chip-p">✅ Present: <b>${P}</b></span>
      <span class="att-chip att-chip-a">❌ Absent: <b>${A}</b></span>
      <span class="att-chip att-chip-n">⬜ Not Marked: <b>${students.length - P - A}</b></span>
    </div>`;

  const readOnly = U.isReadOnly();
  U.el('attList').innerHTML = `
    <div class="att-grid">
      ${students.map(s => `
        <div class="att-row" id="row-${s.id}">
          <div class="att-info">
            <div class="att-name">${U.esc(s.name)}</div>
            <div class="att-roll">Roll: ${U.esc(s.roll || '—')}</div>
          </div>
          <div class="att-btns">
            <button class="att-btn ${S.tempAtt[s.id]==='P'?'present':''}" onclick="${readOnly?'':'markAtt(\''+s.id+'\',\'P\')'}" ${readOnly?'disabled':''}>P</button>
            <button class="att-btn ${S.tempAtt[s.id]==='A'?'absent':''}" onclick="${readOnly?'':'markAtt(\''+s.id+'\',\'A\')'}" ${readOnly?'disabled':''}>A</button>
            <button class="att-btn ${S.tempAtt[s.id]==='L'?'leave':''}" onclick="${readOnly?'':'markAtt(\''+s.id+'\',\'L\')'}" ${readOnly?'disabled':''}>L</button>
          </div>
        </div>`).join('')}
    </div>
    ${!readOnly ? `<div style="margin-top:16px;display:flex;gap:10px">
      <button class="btn btn-outline btn-sm" onclick="markAllAtt('P')">✅ Mark All Present</button>
      <button class="btn btn-ghost btn-sm" onclick="markAllAtt('A')">❌ Mark All Absent</button>
    </div>` : ''}`;
}

function markAtt(stuId, status) {
  if (U.isReadOnly()) return;
  S.tempAtt[stuId] = status;
  const row = document.getElementById('row-' + stuId);
  if (row) {
    row.querySelectorAll('.att-btn').forEach(b => b.classList.remove('present','absent','leave'));
    const map = { P: 0, A: 1, L: 2 };
    if (map[status] !== undefined) {
      const cls = { P:'present', A:'absent', L:'leave' };
      row.querySelectorAll('.att-btn')[map[status]]?.classList.add(cls[status]);
    }
  }
  // Update summary counts live
  const cls = U.el('attClass')?.value;
  const students = S.students.filter(s => String(s.class) === cls && s.status === 'active');
  const P = Object.values(S.tempAtt).filter(v=>v==='P').length;
  const A = Object.values(S.tempAtt).filter(v=>v==='A').length;
  const summary = U.el('attSummary');
  if (summary) summary.innerHTML = `
    <div class="att-summary-bar">
      <span class="att-chip att-chip-p">✅ Present: <b>${P}</b></span>
      <span class="att-chip att-chip-a">❌ Absent: <b>${A}</b></span>
      <span class="att-chip att-chip-n">⬜ Not Marked: <b>${students.length - P - A}</b></span>
    </div>`;
}

function markAllAtt(status) {
  const cls = U.el('attClass')?.value;
  if (!cls) return;
  S.students.filter(s => String(s.class) === cls && s.status === 'active').forEach(s => markAtt(s.id, status));
}

async function saveAttendance() {
  if (U.isReadOnly()) return;
  const cls  = U.el('attClass')?.value;
  const date = U.el('attDate')?.value;
  if (!cls || !date) { Toast.warning('Select class and date'); return; }
  if (!Object.keys(S.tempAtt).length) { Toast.warning('No attendance to save'); return; }

  const upserts = Object.entries(S.tempAtt).map(([studentId, status]) => ({
    school_id: S.schoolId, student_id: studentId,
    class_name: cls, record_date: date,
    status, marked_by: S.user.id
  }));
  try {
    const { error } = await sb.from('attendance_records').upsert(upserts, { onConflict: 'student_id,record_date' });
    if (error) throw error;
    Toast.success('Attendance Saved ✅', `Class ${cls} — ${date} (${upserts.length} students)`);
  } catch (err) {
    console.error('saveAttendance:', err);
    Toast.error('Save Failed', err.message);
  }
}

// ═══════════════════════════════════════════════════════
// EXAMS
// ═══════════════════════════════════════════════════════
async function renderExams() {
  const canWrite = !U.isReadOnly();
  U.el('contentArea').innerHTML = `
    <div class="section active">
      <div class="section-header">
        <div><div class="section-title">Exams & Results</div></div>
        ${canWrite ? `<button class="btn btn-primary" onclick="openExamModal()">+ Create Exam</button>` : `<span class="badge badge-gray">👁️ View Only</span>`}
      </div>
      <div class="card">
        <div class="table-wrap">
          <table><thead><tr><th>Exam Name</th><th>Subject</th><th>Class</th><th>Date</th><th>Max Marks</th><th>Type</th></tr></thead>
          <tbody id="examsBody"></tbody></table>
        </div>
      </div>
    </div>`;

  const tbody = U.el('examsBody');
  if (!S.exams.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📝</div><div class="empty-desc">No exams scheduled yet</div></div></td></tr>`;
    return;
  }
  const typeColor = { written:'badge-primary', mcq:'badge-success', practical:'badge-warning' };
  tbody.innerHTML = S.exams.map(e => `
    <tr>
      <td class="td-primary">${U.esc(e.name)}</td>
      <td>${U.esc(e.subject)}</td>
      <td><span class="badge badge-primary">Class ${U.esc(e.class)}</span></td>
      <td>${U.esc(e.date)}</td>
      <td>${U.esc(e.maxMarks)}</td>
      <td><span class="badge ${typeColor[e.type]||'badge-gray'}">${e.type}</span></td>
    </tr>`).join('');
}

function openExamModal() {
  if (U.isReadOnly()) { Toast.error('Access Denied'); return; }
  populateClassSelects();
  U.el('examDate').value = U.today();
  openModal('examModal');
}

async function saveExam() {
  if (U.isReadOnly()) { Toast.error('Access Denied'); return; }
  const name    = U.el('examName').value.trim();
  const subject = U.el('examSubject').value.trim();
  const cls     = U.el('examClass').value;
  const date    = U.el('examDate').value;
  if (!name||!subject||!cls||!date) { Toast.warning('Fill all required fields'); return; }
  if (!U.canAccessClass(cls)) { Toast.error('Access Denied', `Not assigned to Class ${cls}`); return; }

  try {
    const { error } = await sb.from('exams').insert({
      school_id: S.schoolId, name, subject,
      class_name: cls, exam_date: date,
      max_marks:  Number(U.el('examMaxMarks')?.value || 100),
      pass_marks: Number(U.el('examPassMarks')?.value || 33),
      exam_type:  U.el('examType')?.value || 'written'
    });
    if (error) throw error;
    Toast.success('Exam Created ✅', name);
    closeModal('examModal');
    await loadExams();
    renderExams();
  } catch (err) { Toast.error('Failed', err.message); }
}

// ═══════════════════════════════════════════════════════
// TEAM MANAGEMENT (Admin Only)
// ═══════════════════════════════════════════════════════
async function renderTeam() {
  if (S.role !== 'admin') { Toast.error('Admin Only'); return; }
  U.el('contentArea').innerHTML = `
    <div class="section active">
      <div class="section-header">
        <div>
          <div class="section-title">Team Management</div>
          <div style="font-size:13px;color:var(--text3);margin-top:2px">Manage teachers, viewers and their class access</div>
        </div>
        <button class="btn btn-primary" onclick="openMemberModal()">+ Add Member</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table><thead><tr><th>Name / Email</th><th>Role</th><th>Assigned Classes</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody id="teamBody"></tbody></table>
        </div>
      </div>
    </div>`;
  _renderTeamRows();
}

function _renderTeamRows() {
  const tbody = U.el('teamBody');
  if (!tbody) return;
  if (!S.members.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No team members yet</div><div class="empty-desc">Add teachers and viewers to your school</div></div></td></tr>`;
    return;
  }
  const roleColors = { admin:'badge-primary', teacher:'badge-success', viewer:'badge-gray' };
  tbody.innerHTML = S.members.map(m => {
    const classes = m.assigned_classes
      ? (Array.isArray(m.assigned_classes) ? m.assigned_classes : JSON.parse(m.assigned_classes)).map(c=>`Class ${c}`).join(', ')
      : (m.role === 'admin' ? '<span style="color:var(--text3)">All Classes</span>' : '<span style="color:var(--danger)">None assigned</span>');
    const joined = m.accepted_at ? new Date(m.accepted_at).toLocaleDateString('en-IN') : '<span style="color:var(--text3)">Pending</span>';
    const isSelf = m.user_id === S.user.id;
    return `<tr>
      <td>
        <div class="td-primary">${U.esc(m.display_name || '—')}</div>
        <div style="font-size:12px;color:var(--text3)">${U.esc(m.email || '')}</div>
      </td>
      <td><span class="badge ${roleColors[m.role]||'badge-gray'}">${m.role}</span></td>
      <td style="font-size:13px">${classes}</td>
      <td style="font-size:13px;color:var(--text3)">${joined}</td>
      <td>
        <button class="btn btn-xs btn-outline" onclick="editMember('${m.id}')">✏️ Edit</button>
        ${!isSelf ? `<button class="btn btn-xs btn-outline text-danger" onclick="deleteMember('${m.id}','${U.esc(m.display_name||m.email||'Member')}')">🗑️</button>` : '<span style="font-size:11px;color:var(--text3);margin-left:8px">You</span>'}
      </td>
    </tr>`;
  }).join('');
}

function openMemberModal() {
  U.el('editMemberId').value = '';
  U.el('memberName').value  = '';
  U.el('memberEmail').value = '';
  U.el('memberRole').value  = 'teacher';
  U.el('teacherModalTitle').textContent = 'Add Team Member';
  U.el('memberInfoBox').style.display = 'none';
  _buildClassCheckboxes(null);
  toggleClassAssign();
  openModal('teacherModal');
}

function editMember(id) {
  const m = S.members.find(x => x.id === id);
  if (!m) return;
  U.el('editMemberId').value = m.id;
  U.el('memberName').value   = m.display_name || '';
  U.el('memberEmail').value  = m.email || '';
  U.el('memberRole').value   = m.role;
  U.el('teacherModalTitle').textContent = 'Edit Member';

  const existing = m.assigned_classes
    ? (Array.isArray(m.assigned_classes) ? m.assigned_classes.map(String) : JSON.parse(m.assigned_classes).map(String))
    : [];
  _buildClassCheckboxes(existing);
  toggleClassAssign();

  const infoBox = U.el('memberInfoBox');
  infoBox.style.display = 'block';
  infoBox.innerHTML = `<span>ℹ️ Editing existing member. Email cannot be changed here.</span>`;
  U.el('memberEmail').disabled = true;
  openModal('teacherModal');
}

function _buildClassCheckboxes(selected) {
  const container = U.el('classCheckboxes');
  if (!container) return;
  container.innerHTML = Array.from({length:12}, (_,i) => {
    const cls = String(i+1);
    const checked = selected && selected.includes(cls) ? 'checked' : '';
    return `<label class="class-checkbox-item">
      <input type="checkbox" value="${cls}" ${checked} class="cls-chk"/>
      <span>Class ${cls}</span>
    </label>`;
  }).join('');
}

function toggleClassAssign() {
  const role = U.el('memberRole')?.value;
  const grp  = U.el('classAssignGroup');
  if (!grp) return;
  // Show class assignment only for teacher role
  grp.style.display = role === 'teacher' ? 'block' : 'none';
}

function selectAllClasses() {
  document.querySelectorAll('.cls-chk').forEach(c => c.checked = true);
}
function clearAllClasses() {
  document.querySelectorAll('.cls-chk').forEach(c => c.checked = false);
}

function _getSelectedClasses() {
  return Array.from(document.querySelectorAll('.cls-chk:checked')).map(c => c.value);
}

async function saveMember() {
  const memberId = U.el('editMemberId').value;
  const name     = U.el('memberName').value.trim();
  const email    = U.el('memberEmail').value.trim();
  const role     = U.el('memberRole').value;
  const classes  = role === 'teacher' ? _getSelectedClasses() : null;

  if (!name)  { Toast.warning('Enter member name'); return; }
  if (!memberId && !email) { Toast.warning('Enter email address'); return; }
  if (role === 'teacher' && (!classes || classes.length === 0)) {
    Toast.warning('Assign at least one class to the teacher');
    return;
  }

  try {
    if (memberId) {
      // Update existing member
      const { error } = await sb.from('school_members').update({
        role, display_name: name,
        assigned_classes: classes
      }).eq('id', memberId).eq('school_id', S.schoolId);
      if (error) throw error;
      Toast.success('Member Updated ✅', name);
    } else {
      // Check if user exists in auth by looking up via email
      // We insert a placeholder — user must sign up themselves
      // Admin sets role+classes; when teacher logs in, they'll be in school_members
      // For now, we need the user's UUID — flow: teacher signs up → admin assigns role
      Toast.info('Invite Flow', `Ask ${email} to sign up on EduManage Pro. Then find them in the members list and assign their role & classes.`);
      closeModal('teacherModal');
      return;
    }
    U.el('memberEmail').disabled = false;
    closeModal('teacherModal');
    await loadMembers();
    _renderTeamRows();
  } catch (err) {
    console.error('saveMember:', err);
    Toast.error('Save Failed', err.message);
  }
}

async function deleteMember(id, name) {
  const ok = await showConfirm('Remove Member', `Remove "${name}" from this school?`, '👤');
  if (!ok) return;
  try {
    const { error } = await sb.from('school_members').delete().eq('id', id).eq('school_id', S.schoolId);
    if (error) throw error;
    Toast.warning('Removed', `${name} removed from school`);
    await loadMembers();
    _renderTeamRows();
  } catch (err) { Toast.error('Failed', err.message); }
}

// ═══════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════
async function renderReports() {
  const area = U.el('contentArea');
  area.innerHTML = `<div class="section active"><div class="section-header"><div class="section-title">Reports & Analytics</div></div><div class="card"><div class="card-body" id="reportsBody"><div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-desc">Loading report data...</div></div></div></div></div>`;

  try {
    // Load fresh data
    const today = U.today();
    const thisMonth = today.slice(0,7);
    const [stuRes, feeRes, attRes, examRes] = await Promise.all([
      sb.from('students').select('class_name, status').eq('school_id', S.schoolId),
      sb.from('fee_payments').select('total_amount, status, month').eq('school_id', S.schoolId),
      sb.from('attendance_records').select('status, record_date').eq('school_id', S.schoolId),
      sb.from('exams').select('class_name, exam_date').eq('school_id', S.schoolId)
    ]);

    const students = (stuRes.data||[]).filter(s => U.canAccessClass(s.class_name));
    const fees     = feeRes.data||[];
    const atts     = attRes.data||[];

    const activeCount   = students.filter(s=>s.status==='active').length;
    const totalFee      = fees.filter(f=>f.status==='paid').reduce((t,f)=>t+Number(f.total_amount),0);
    const thisMonthFee  = fees.filter(f=>f.status==='paid'&&f.month===thisMonth).reduce((t,f)=>t+Number(f.total_amount),0);
    const todayAtt      = atts.filter(a=>a.record_date===today);
    const presentToday  = todayAtt.filter(a=>a.status==='P').length;
    const attRate       = todayAtt.length ? Math.round((presentToday/todayAtt.length)*100) : 0;

    // Class-wise student count
    const byClass = {};
    students.forEach(s => { byClass[s.class_name] = (byClass[s.class_name]||0)+1; });
    const classRows = Object.entries(byClass).sort((a,b)=>Number(a[0])-Number(b[0]))
      .map(([cls,cnt])=>`<tr><td><span class="badge badge-primary">Class ${cls}</span></td><td>${cnt}</td><td>${Math.round((cnt/Math.max(activeCount,1))*100)}%</td></tr>`).join('');

    U.el('reportsBody').innerHTML = `
      <div class="grid-3" style="margin-bottom:28px">
        <div class="stat-card"><div class="stat-value">${activeCount}</div><div class="stat-label">Active Students</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--success)">${U.fmtCurrency(thisMonthFee)}</div><div class="stat-label">This Month's Collection</div></div>
        <div class="stat-card"><div class="stat-value">${attRate}%</div><div class="stat-label">Today's Attendance Rate</div></div>
      </div>
      <div class="grid-2">
        <div>
          <div style="font-weight:600;margin-bottom:12px;color:var(--text1)">📚 Class-wise Students</div>
          <div class="table-wrap"><table><thead><tr><th>Class</th><th>Students</th><th>Share</th></tr></thead><tbody>${classRows||'<tr><td colspan="3" style="text-align:center;color:var(--text3)">No data</td></tr>'}</tbody></table></div>
        </div>
        <div>
          <div style="font-weight:600;margin-bottom:12px;color:var(--text1)">💰 Fee Summary</div>
          <div class="stat-card" style="margin-bottom:12px"><div class="stat-label">Total Collected (All Time)</div><div class="stat-value" style="color:var(--success)">${U.fmtCurrency(totalFee)}</div></div>
          <div class="stat-card"><div class="stat-label">Pending Fees</div><div class="stat-value" style="color:var(--danger)">${U.fmtCurrency(fees.filter(f=>f.status!=='paid').reduce((t,f)=>t+Number(f.total_amount),0))}</div></div>
        </div>
      </div>`;
  } catch (err) {
    U.el('reportsBody').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-desc">Could not load reports: ${U.esc(err.message)}</div></div>`;
  }
}

// ═══════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════
function renderSettings() {
  const isAdmin = S.role === 'admin';
  U.el('contentArea').innerHTML = `
    <div class="section active">
      <div class="section-header"><div class="section-title">Settings</div></div>
      <div class="card mb-4">
        <div class="card-header"><span class="card-title">🏫 School Details</span></div>
        <div class="card-body">
          <div class="grid-2">
            <div class="form-group"><label class="form-label">School Name</label><input class="form-control" id="cfgSchoolName" value="${U.esc(S.settings.schoolName)}" ${!isAdmin?'disabled':''}/></div>
            <div class="form-group"><label class="form-label">Academic Year</label><input class="form-control" id="cfgYear" value="${U.esc(S.settings.academicYear)}" ${!isAdmin?'disabled':''}/></div>
          </div>
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="cfgPhone" value="${U.esc(S.settings.phone)}" ${!isAdmin?'disabled':''}/></div>
            <div class="form-group"><label class="form-label">Board</label>
              <select class="form-control" id="cfgBoard" ${!isAdmin?'disabled':''}>
                ${['CBSE','ICSE','UP Board','MP Board','Other'].map(b=>`<option ${S.settings.board===b?'selected':''}>${b}</option>`).join('')}
              </select>
            </div>
          </div>
          ${isAdmin ? `<button class="btn btn-primary mt-2" onclick="saveSettings()">💾 Save Settings</button>` : `<p style="color:var(--text3);font-size:13px;margin-top:8px">⚠️ Only admins can edit school settings.</p>`}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">👤 Your Account</span></div>
        <div class="card-body">
          <div class="form-group"><label class="form-label">Email</label><input class="form-control" value="${U.esc(S.user?.email||'')}" disabled/></div>
          <div class="form-group"><label class="form-label">Role</label><input class="form-control" value="${_roleLabel(S.role)}" disabled/></div>
          ${S.role === 'teacher' && S.assignedClasses?.length ? `<div class="form-group"><label class="form-label">Assigned Classes</label><input class="form-control" value="${S.assignedClasses.map(c=>'Class '+c).join(', ')}" disabled/></div>` : ''}
          <div style="margin-top:14px"><button class="btn btn-ghost" onclick="handleLogout()">🚪 Sign Out</button></div>
        </div>
      </div>
    </div>`;
}

async function saveSettings() {
  if (S.role !== 'admin') { Toast.error('Admin Only'); return; }
  try {
    const name  = U.el('cfgSchoolName').value.trim();
    const year  = U.el('cfgYear').value.trim();
    const phone = U.el('cfgPhone').value.trim();
    const board = U.el('cfgBoard').value;
    const { error } = await sb.from('schools').update({ name, academic_year: year, phone, board }).eq('id', S.schoolId);
    if (error) throw error;
    S.settings.schoolName   = name;
    S.settings.academicYear = year;
    S.settings.phone        = phone;
    S.settings.board        = board;
    U.el('sidebarSchoolName').textContent = U.esc(name);
    Toast.success('Settings Saved ✅');
  } catch (err) { Toast.error('Save Failed', err.message); }
}

// ═══════════════════════════════════════════════════════
// APP BOOTSTRAP
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.theme = localStorage.getItem('em_theme') || 'light';
  if (initSupabase()) {
    initAuth();
  }
});