import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface Env { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; ALLOWED_ORIGIN: string; }

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
}
function error(msg: string, status = 400): Response { return json({ error: msg }, status); }
function success(data: any, status = 200): Response { return json({ success: true, ...data }, status); }

async function authenticate(request: Request, env: Env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: membership } = await sb.from('school_members').select('school_id, role').eq('user_id', user.id).single();
  return { userId: user.id, schoolId: membership?.school_id, role: membership?.role || 'viewer' };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Max-Age': '86400' } });
    
    const url = new URL(request.url);
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    // Public routes
    if (url.pathname === '/api/health') return json({ status: 'ok' });

    // Auth Middleware
    const auth = await authenticate(request, env);
    if (!auth) return error('Unauthorized', 401);
    const { schoolId, role, userId } = auth;

    try {
      // ── STUDENTS ──
      if (url.pathname === '/api/students' && request.method === 'GET') {
        const { data } = await sb.from('students').select('*').eq('school_id', schoolId).order('created_at', { ascending: false });
        return success({ students: data });
      }
      if (url.pathname === '/api/students' && request.method === 'POST') {
        if (role === 'viewer') return error('Forbidden', 403);
        const body = await request.json();
        const { data, error: err } = await sb.from('students').insert({ ...body, school_id: schoolId }).select().single();
        if (err) return error(err.message);
        return success({ student: data }, 201);
      }
      if (url.pathname.match(/^\/api\/students\/[\w-]+$/) && request.method === 'PATCH') {
        if (role === 'viewer') return error('Forbidden', 403);
        const id = url.pathname.split('/').pop();
        const body = await request.json();
        const { data, error: err } = await sb.from('students').update(body).eq('id', id).eq('school_id', schoolId).select().single();
        if (err) return error(err.message);
        return success({ student: data });
      }
      if (url.pathname.match(/^\/api\/students\/[\w-]+$/) && request.method === 'DELETE') {
        if (role !== 'admin') return error('Forbidden', 403);
        const id = url.pathname.split('/').pop();
        await sb.from('students').delete().eq('id', id).eq('school_id', schoolId);
        return success({ deleted: true });
      }

      // ── FEES ──
      if (url.pathname === '/api/fees' && request.method === 'GET') {
        const { data } = await sb.from('fee_payments').select('*').eq('school_id', schoolId).order('created_at', { ascending: false });
        return success({ fees: data });
      }
      if (url.pathname === '/api/fees' && request.method === 'POST') {
        if (role === 'viewer') return error('Forbidden', 403);
        const body = await request.json();
        const { data, error: err } = await sb.from('fee_payments').insert({ ...body, school_id: schoolId }).select().single();
        if (err) return error(err.message);
        return success({ fee: data }, 201);
      }

      // ── ATTENDANCE ──
      if (url.pathname === '/api/attendance' && request.method === 'POST') {
        if (role === 'viewer') return error('Forbidden', 403);
        const body = await request.json();
        const records = body.records.map((r: any) => ({ ...r, school_id: schoolId, marked_by: userId }));
        const { error: err } = await sb.from('attendance_records').upsert(records, { onConflict: 'student_id,record_date' });
        if (err) return error(err.message);
        return success({ saved: records.length });
      }

      // ── DASHBOARD ──
      if (url.pathname === '/api/dashboard' && request.method === 'GET') {
        const [stu, fees, att] = await Promise.all([
          sb.from('students').select('id, status', { count: 'exact' }).eq('school_id', schoolId),
          sb.from('fee_payments').select('total_amount, status').eq('school_id', schoolId),
          sb.from('attendance_records').select('status').eq('school_id', schoolId).eq('record_date', new Date().toISOString().split('T')[0])
        ]);
        return success({
          stats: {
            totalStudents: stu.count || 0,
            paidFees: fees.data?.filter(f => f.status === 'paid').reduce((t, f) => t + Number(f.total_amount), 0) || 0,
            pendingFees: fees.data?.filter(f => f.status !== 'paid').reduce((t, f) => t + Number(f.total_amount), 0) || 0,
            todayPresent: att.data?.filter(a => a.status === 'P').length || 0
          }
        });
      }

      return error('Not Found', 404);
    } catch (err: any) {
      return error('Internal Server Error', 500);
    }
  }
};