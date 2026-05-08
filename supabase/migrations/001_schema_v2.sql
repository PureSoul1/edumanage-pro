-- ═══════════════════════════════════════════════════════════════
-- EDUMANAGE PRO v2 — SCHEMA UPDATE
-- Run this in Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══ SCHOOLS ═══
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My School',
  academic_year TEXT DEFAULT '2024-25',
  phone TEXT, address TEXT, board TEXT DEFAULT 'CBSE',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ SCHOOL MEMBERSHIP ═══
-- assigned_classes: JSON array like ["1","2","5"] — null means all classes (for admin)
CREATE TABLE IF NOT EXISTS school_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','teacher','viewer')),
  assigned_classes JSONB DEFAULT NULL,   -- NULL = all classes (admin), array for teacher
  display_name TEXT DEFAULT '',          -- teacher ka naam for admin panel
  email TEXT DEFAULT '',                 -- invite email
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(school_id, user_id)
);

-- ═══ STUDENTS ═══
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT '',
  roll_number TEXT DEFAULT '', dob DATE,
  father_name TEXT DEFAULT '', mother_name TEXT DEFAULT '',
  phone TEXT NOT NULL, email TEXT DEFAULT '', address TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  conveyance_fee NUMERIC DEFAULT 0, bus_route TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(school_id, class_name);

-- ═══ FEE STRUCTURE ═══
CREATE TABLE IF NOT EXISTS fee_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, component_key TEXT NOT NULL,
  component_label TEXT NOT NULL, amount NUMERIC DEFAULT 0,
  enabled BOOLEAN DEFAULT false, always_on BOOLEAN DEFAULT false,
  UNIQUE(school_id, class_name, component_key)
);

-- ═══ FEE PAYMENTS ═══
CREATE TABLE IF NOT EXISTS fee_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL, month TEXT NOT NULL,
  total_amount NUMERIC DEFAULT 0, breakdown JSONB DEFAULT '{}',
  payment_mode TEXT DEFAULT 'cash', payment_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid','pending','partial')),
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fees_school ON fee_payments(school_id);

-- ═══ ATTENDANCE ═══
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, record_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P','A','L')),
  marked_by UUID REFERENCES auth.users(id),
  UNIQUE(student_id, record_date)
);
CREATE INDEX IF NOT EXISTS idx_att_school_date ON attendance_records(school_id, record_date);

-- ═══ EXAMS ═══
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, subject TEXT NOT NULL, class_name TEXT NOT NULL,
  exam_date DATE NOT NULL, max_marks NUMERIC DEFAULT 100,
  pass_marks NUMERIC DEFAULT 33, duration_minutes INT DEFAULT 180,
  exam_type TEXT DEFAULT 'written' CHECK (exam_type IN ('written','mcq','practical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ EXAM RESULTS ═══
CREATE TABLE IF NOT EXISTS exam_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained NUMERIC DEFAULT 0,
  UNIQUE(exam_id, student_id)
);

-- ═══ ALERTS ═══
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  alert_type TEXT DEFAULT 'custom', message TEXT NOT NULL,
  recipient_type TEXT DEFAULT 'all', recipient_count INT DEFAULT 0,
  sent_by UUID REFERENCES auth.users(id), sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ TIMETABLES ═══
CREATE TABLE IF NOT EXISTS timetables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, day_index INT NOT NULL,
  period_index INT NOT NULL, subject TEXT NOT NULL,
  UNIQUE(school_id, class_name, day_index, period_index)
);

-- ═══ ACTIVITY LOG ═══
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id), action TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id UUID, details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════
-- IF TABLE ALREADY EXISTS — ADD MISSING COLUMNS
-- (Run this if upgrading from v1)
-- ════════════════════════════════════════════
ALTER TABLE school_members ADD COLUMN IF NOT EXISTS assigned_classes JSONB DEFAULT NULL;
ALTER TABLE school_members ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
ALTER TABLE school_members ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id);

-- ═══ ROW LEVEL SECURITY ═══
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- ═══ HELPER FUNCTIONS ═══

-- Get current user's role in a school
CREATE OR REPLACE FUNCTION user_school_role(check_school_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM school_members
  WHERE school_id = check_school_id AND user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get current user's assigned classes (returns NULL for admin = all classes)
CREATE OR REPLACE FUNCTION user_assigned_classes(check_school_id UUID)
RETURNS JSONB AS $$
  SELECT assigned_classes FROM school_members
  WHERE school_id = check_school_id AND user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if teacher can access a specific class
CREATE OR REPLACE FUNCTION user_can_access_class(check_school_id UUID, check_class TEXT)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN user_school_role(check_school_id) = 'admin' THEN true
    WHEN user_school_role(check_school_id) = 'viewer' THEN true
    WHEN user_assigned_classes(check_school_id) IS NULL THEN true
    ELSE user_assigned_classes(check_school_id) ? check_class
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══ DROP OLD POLICIES (if upgrading) ═══
DROP POLICY IF EXISTS "Members see own schools" ON schools;
DROP POLICY IF EXISTS "Owners insert schools" ON schools;
DROP POLICY IF EXISTS "Owners update schools" ON schools;
DROP POLICY IF EXISTS "Members read" ON school_members;
DROP POLICY IF EXISTS "Admins invite" ON school_members;
DROP POLICY IF EXISTS "Members read students" ON students;
DROP POLICY IF EXISTS "Admin/Teacher write students" ON students;
DROP POLICY IF EXISTS "Members read fees" ON fee_structures;
DROP POLICY IF EXISTS "Admin manage fee structures" ON fee_structures;
DROP POLICY IF EXISTS "Members read fee_payments" ON fee_payments;
DROP POLICY IF EXISTS "Admin/Teacher write fee_payments" ON fee_payments;
DROP POLICY IF EXISTS "Members read attendance" ON attendance_records;
DROP POLICY IF EXISTS "Admin/Teacher write attendance" ON attendance_records;
DROP POLICY IF EXISTS "Members read exams" ON exams;
DROP POLICY IF EXISTS "Admin/Teacher write exams" ON exams;
DROP POLICY IF EXISTS "Members read results" ON exam_results;
DROP POLICY IF EXISTS "Admin/Teacher write results" ON exam_results;
DROP POLICY IF EXISTS "Members read alerts" ON alerts;
DROP POLICY IF EXISTS "Admin/Teacher write alerts" ON alerts;
DROP POLICY IF EXISTS "Members read timetables" ON timetables;
DROP POLICY IF EXISTS "Admin/Teacher write timetables" ON timetables;

-- ═══ NEW POLICIES ═══

-- SCHOOLS
CREATE POLICY "Members see own schools" ON schools FOR SELECT
  USING (id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Owners insert schools" ON schools FOR INSERT
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update schools" ON schools FOR UPDATE
  USING (owner_id = auth.uid());

-- SCHOOL MEMBERS
CREATE POLICY "Members read own school_members" ON school_members FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admins manage members" ON school_members FOR INSERT
  WITH CHECK (user_school_role(school_id) = 'admin');
CREATE POLICY "Admins update members" ON school_members FOR UPDATE
  USING (user_school_role(school_id) = 'admin');
CREATE POLICY "Admins delete members" ON school_members FOR DELETE
  USING (user_school_role(school_id) = 'admin' AND user_id != auth.uid()); -- can't delete self

-- STUDENTS — Teacher sees only assigned classes
CREATE POLICY "Members read students by class" ON students FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid())
    AND user_can_access_class(school_id, class_name)
  );
CREATE POLICY "Admin full student access" ON students FOR ALL
  USING (user_school_role(school_id) = 'admin');
CREATE POLICY "Teacher write students in own class" ON students FOR INSERT
  WITH CHECK (
    user_school_role(school_id) = 'teacher'
    AND user_can_access_class(school_id, class_name)
  );
CREATE POLICY "Teacher update students in own class" ON students FOR UPDATE
  USING (
    user_school_role(school_id) = 'teacher'
    AND user_can_access_class(school_id, class_name)
  );

-- FEE STRUCTURES
CREATE POLICY "Members read fee_structures" ON fee_structures FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin manage fee_structures" ON fee_structures FOR ALL
  USING (user_school_role(school_id) = 'admin');

-- FEE PAYMENTS
CREATE POLICY "Members read fee_payments by class" ON fee_payments FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_id
      AND user_can_access_class(school_id, s.class_name)
    )
  );
CREATE POLICY "Admin/Teacher write fee_payments" ON fee_payments FOR INSERT
  WITH CHECK (user_school_role(school_id) IN ('admin','teacher'));
CREATE POLICY "Admin/Teacher update fee_payments" ON fee_payments FOR UPDATE
  USING (user_school_role(school_id) IN ('admin','teacher'));

-- ATTENDANCE
CREATE POLICY "Members read attendance by class" ON attendance_records FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid())
    AND user_can_access_class(school_id, class_name)
  );
CREATE POLICY "Admin/Teacher write attendance" ON attendance_records FOR INSERT
  WITH CHECK (
    user_school_role(school_id) IN ('admin','teacher')
    AND user_can_access_class(school_id, class_name)
  );
CREATE POLICY "Admin/Teacher update attendance" ON attendance_records FOR UPDATE
  USING (
    user_school_role(school_id) IN ('admin','teacher')
    AND user_can_access_class(school_id, class_name)
  );

-- EXAMS
CREATE POLICY "Members read exams by class" ON exams FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid())
    AND user_can_access_class(school_id, class_name)
  );
CREATE POLICY "Admin/Teacher write exams" ON exams FOR INSERT
  WITH CHECK (
    user_school_role(school_id) IN ('admin','teacher')
    AND user_can_access_class(school_id, class_name)
  );
CREATE POLICY "Admin/Teacher update exams" ON exams FOR UPDATE
  USING (
    user_school_role(school_id) IN ('admin','teacher')
    AND user_can_access_class(school_id, class_name)
  );

-- EXAM RESULTS
CREATE POLICY "Members read exam_results" ON exam_results FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write exam_results" ON exam_results FOR ALL
  USING (user_school_role(school_id) IN ('admin','teacher'));

-- ALERTS
CREATE POLICY "Members read alerts" ON alerts FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write alerts" ON alerts FOR ALL
  USING (user_school_role(school_id) IN ('admin','teacher'));

-- TIMETABLES
CREATE POLICY "Members read timetables" ON timetables FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write timetables" ON timetables FOR ALL
  USING (user_school_role(school_id) IN ('admin','teacher'));

-- ACTIVITY LOG
CREATE POLICY "Members read own activity" ON activity_log FOR SELECT
  USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Members write activity" ON activity_log FOR INSERT
  WITH CHECK (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));

-- ═══ STORAGE BUCKETS ═══
INSERT INTO storage.buckets (id, name, public) VALUES ('profiles', 'profiles', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;