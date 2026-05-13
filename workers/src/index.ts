import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  ALLOWED_ORIGIN: string;
}

// ── CORS Headers ──
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
function err(msg: string, status = 400): Response { return json({ error: msg }, status); }
function ok(data: Record<string, unknown>, status = 200): Response { return json({ success: true, ...data }, status); }

// ── Auth + Role Middleware ──
async function authenticate(request: Request, env: Env) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  const { data: { user }, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !user) return null;

  // Get ALL memberships (user could be in multiple schools)
  const { data: memberships } = await sb
    .from('school_members')
    .select('school_id, role, assigned_classes')
    .eq('user_id', user.id)
    .order('invited_at', { ascending: false });

  if (!memberships?.length) return null;

  const m = memberships[0];
  const assignedClasses: string[] | null = m.assigned_classes
    ? (Array.isArray(m.assigned_classes) ? m.assigned_classes.map(String) : JSON.parse(m.assigned_classes).map(String))
    : null;

  return {
    userId:          user.id,
    schoolId:        m.school_id,
    role:            m.role as 'admin' | 'teacher' | 'viewer',
    assignedClasses, // null = all (admin), array = teacher
  };
}

// Check class access for teacher
function canAccessClass(auth: NonNullable<Awaited<ReturnType<typeof authenticate>>>, className: string): boolean {
  if (auth.role === 'admin' || auth.role === 'viewer') return true;
  if (!auth.assignedClasses) return false;
  return auth.assignedClasses.includes(String(className));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
    }

    const url = new URL(request.url);
    const sb  = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    // Public health check
    if (url.pathname === '/api/health') return json({ status: 'ok', version: 'v7' });

    // Auth
    const auth = await authenticate(request, env);
    if (!auth) return err('Unauthorized', 401);
    const { schoolId, role, userId, assignedClasses } = auth;

    try {

      // ══════════════════════════
      // STUDENTS
      // ══════════════════════════
      if (url.pathname === '/api/students' && request.method === 'GET') {
        let query = sb.from('students').select('*').eq('school_id', schoolId).order('class_name').order('name');
        // For teachers, filter to assigned classes only
        if (role === 'teacher' && assignedClasses?.length) {
          query = query.in('class_name', assignedClasses);
        }
        const { data, error } = await query;
        if (error) return err(error.message);
        return ok({ students: data });
      }

      if (url.pathname === '/api/students' && request.method === 'POST') {
        if (role === 'viewer') return err('Forbidden — Viewers cannot add students', 403);
        const body = await request.json() as Record<string, unknown>;
        const className = String(body.class_name || '');
        if (!canAccessClass(auth, className)) return err('Forbidden — You are not assigned to this class', 403);
        const { data, error } = await sb.from('students').insert({ ...body, school_id: schoolId }).select().single();
        if (error) return err(error.message);
        return ok({ student: data }, 201);
      }

      if (url.pathname.match(/^\/api\/students\/[\w-]+$/) && request.method === 'PATCH') {
        if (role === 'viewer') return err('Forbidden', 403);
        const id = url.pathname.split('/').pop();
        const body = await request.json() as Record<string, unknown>;
        // Verify class access
        const { data: existing } = await sb.from('students').select('class_name').eq('id', id).single();
        if (existing && !canAccessClass(auth, existing.class_name)) return err('Forbidden — Not your class', 403);
        const { data, error } = await sb.from('students').update(body).eq('id', id).eq('school_id', schoolId).select().single();
        if (error) return err(error.message);
        return ok({ student: data });
      }

      if (url.pathname.match(/^\/api\/students\/[\w-]+$/) && request.method === 'DELETE') {
        if (role !== 'admin') return err('Forbidden — Only admins can delete students', 403);
        const id = url.pathname.split('/').pop();
        const { error } = await sb.from('students').delete().eq('id', id).eq('school_id', schoolId);
        if (error) return err(error.message);
        return ok({ deleted: true });
      }

      // ══════════════════════════
      // FEES
      // ══════════════════════════
      if (url.pathname === '/api/fees' && request.method === 'GET') {
        let query = sb.from('fee_payments').select('*, students!inner(class_name)').eq('school_id', schoolId).order('created_at', { ascending: false });
        if (role === 'teacher' && assignedClasses?.length) {
          query = query.in('students.class_name', assignedClasses);
        }
        const { data, error } = await query;
        if (error) return err(error.message);
        return ok({ fees: data });
      }

      if (url.pathname === '/api/fees' && request.method === 'POST') {
        if (role === 'viewer') return err('Forbidden', 403);
        const body = await request.json() as Record<string, unknown>;
        // Verify student's class is accessible
        const stuId = String(body.student_id || '');
        if (stuId) {
          const { data: stu } = await sb.from('students').select('class_name').eq('id', stuId).single();
          if (stu && !canAccessClass(auth, stu.class_name)) return err('Forbidden — Student not in your class', 403);
        }
        const { data, error } = await sb.from('fee_payments').insert({ ...body, school_id: schoolId, recorded_by: userId }).select().single();
        if (error) return err(error.message);
        return ok({ fee: data }, 201);
      }

      // ══════════════════════════
      // ATTENDANCE
      // ══════════════════════════
      if (url.pathname === '/api/attendance' && request.method === 'GET') {
        const cls  = url.searchParams.get('class');
        const date = url.searchParams.get('date');
        if (!cls || !date) return err('class and date params required');
        if (!canAccessClass(auth, cls)) return err('Forbidden — Not your class', 403);
        const { data, error } = await sb.from('attendance_records').select('*').eq('school_id', schoolId).eq('class_name', cls).eq('record_date', date);
        if (error) return err(error.message);
        return ok({ records: data });
      }

      if (url.pathname === '/api/attendance' && request.method === 'POST') {
        if (role === 'viewer') return err('Forbidden', 403);
        const body = await request.json() as { records: Array<Record<string,unknown>> };
        // Validate all records belong to accessible classes
        for (const r of body.records) {
          if (!canAccessClass(auth, String(r.class_name||''))) return err(`Forbidden — Class ${r.class_name} not assigned`, 403);
        }
        const records = body.records.map(r => ({ ...r, school_id: schoolId, marked_by: userId }));
        const { error } = await sb.from('attendance_records').upsert(records, { onConflict: 'student_id,record_date' });
        if (error) return err(error.message);
        return ok({ saved: records.length });
      }

      // ══════════════════════════
      // EXAMS
      // ══════════════════════════
      if (url.pathname === '/api/exams' && request.method === 'GET') {
        let query = sb.from('exams').select('*').eq('school_id', schoolId).order('exam_date', { ascending: false });
        if (role === 'teacher' && assignedClasses?.length) {
          query = query.in('class_name', assignedClasses);
        }
        const { data, error } = await query;
        if (error) return err(error.message);
        return ok({ exams: data });
      }

      if (url.pathname === '/api/exams' && request.method === 'POST') {
        if (role === 'viewer') return err('Forbidden', 403);
        const body = await request.json() as Record<string,unknown>;
        if (!canAccessClass(auth, String(body.class_name||''))) return err('Forbidden — Not your class', 403);
        const { data, error } = await sb.from('exams').insert({ ...body, school_id: schoolId }).select().single();
        if (error) return err(error.message);
        return ok({ exam: data }, 201);
      }

      // ══════════════════════════
      // TEAM MEMBERS (admin only)
      // ══════════════════════════
      if (url.pathname === '/api/members' && request.method === 'GET') {
        if (role !== 'admin') return err('Forbidden — Admin only', 403);
        const { data, error } = await sb.from('school_members').select('*').eq('school_id', schoolId);
        if (error) return err(error.message);
        return ok({ members: data });
      }

      if (url.pathname.match(/^\/api\/members\/[\w-]+$/) && request.method === 'PATCH') {
        if (role !== 'admin') return err('Forbidden — Admin only', 403);
        const id = url.pathname.split('/').pop();
        const body = await request.json() as Record<string,unknown>;
        const { data, error } = await sb.from('school_members').update(body).eq('id', id).eq('school_id', schoolId).select().single();
        if (error) return err(error.message);
        return ok({ member: data });
      }

      if (url.pathname.match(/^\/api\/members\/[\w-]+$/) && request.method === 'DELETE') {
        if (role !== 'admin') return err('Forbidden — Admin only', 403);
        const id = url.pathname.split('/').pop();
        // Cannot delete yourself
        const { data: m } = await sb.from('school_members').select('user_id').eq('id', id).single();
        if (m?.user_id === userId) return err('Cannot remove yourself', 400);
        const { error } = await sb.from('school_members').delete().eq('id', id).eq('school_id', schoolId);
        if (error) return err(error.message);
        return ok({ deleted: true });
      }

      // ══════════════════════════
      // DASHBOARD STATS
      // ══════════════════════════
      if (url.pathname === '/api/dashboard' && request.method === 'GET') {
        const today = new Date().toISOString().split('T')[0];
        let stuQuery = sb.from('students').select('id,status', { count: 'exact' }).eq('school_id', schoolId);
        if (role === 'teacher' && assignedClasses?.length) stuQuery = stuQuery.in('class_name', assignedClasses);

        const [stu, fees, att] = await Promise.all([
          stuQuery,
          sb.from('fee_payments').select('total_amount,status').eq('school_id', schoolId),
          sb.from('attendance_records').select('status').eq('school_id', schoolId).eq('record_date', today)
        ]);

        return ok({
          stats: {
            totalStudents: stu.count || 0,
            paidFees:    fees.data?.filter(f => f.status === 'paid').reduce((t,f) => t + Number(f.total_amount), 0) || 0,
            pendingFees: fees.data?.filter(f => f.status !== 'paid').reduce((t,f) => t + Number(f.total_amount), 0) || 0,
            todayPresent: att.data?.filter(a => a.status === 'P').length || 0,
          }
        });
      }

      return err('Route not found', 404);

    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('Worker error:', message);
      return err('Internal Server Error: ' + message, 500);
    }
  }
};
// Simple in-memory rate limiter
const rateLimitMap = new Map<string, {count: number, resetAt: number}>();

function checkRateLimit(key: string, limit: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  
  if (entry.count >= limit) return false; // blocked
  
  entry.count++;
  return true; // allowed
}

// fetch() handler mein use karo:
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    // 100 requests per minute per IP
    if (!checkRateLimit(ip, 100, 60000)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
      });
    }
    // ... rest of handler
  }
};