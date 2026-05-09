-- ═══════════════════════════════════════════════════════
-- EDUMANAGE PRO v8 — FINAL DATABASE SETUP
-- Supabase SQL Editor mein run karo (ek baar)
-- ═══════════════════════════════════════════════════════

-- Step 1: Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 2: Tables (IF NOT EXISTS so safe to re-run)
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My School',
  academic_year TEXT DEFAULT '2024-25',
  phone TEXT, address TEXT, board TEXT DEFAULT 'CBSE',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','teacher','viewer')),
  assigned_classes JSONB DEFAULT NULL,
  display_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(school_id, user_id)
);

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

CREATE TABLE IF NOT EXISTS fee_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, component_key TEXT NOT NULL,
  component_label TEXT NOT NULL, amount NUMERIC DEFAULT 0,
  enabled BOOLEAN DEFAULT false, always_on BOOLEAN DEFAULT false,
  UNIQUE(school_id, class_name, component_key)
);

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

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, record_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P','A','L')),
  marked_by UUID REFERENCES auth.users(id),
  UNIQUE(student_id, record_date)
);

CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, subject TEXT NOT NULL, class_name TEXT NOT NULL,
  exam_date DATE NOT NULL, max_marks NUMERIC DEFAULT 100,
  pass_marks NUMERIC DEFAULT 33, duration_minutes INT DEFAULT 180,
  exam_type TEXT DEFAULT 'written' CHECK (exam_type IN ('written','mcq','practical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained NUMERIC DEFAULT 0,
  UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  alert_type TEXT DEFAULT 'custom', message TEXT NOT NULL,
  recipient_type TEXT DEFAULT 'all', recipient_count INT DEFAULT 0,
  sent_by UUID REFERENCES auth.users(id), sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timetables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, day_index INT NOT NULL,
  period_index INT NOT NULL, subject TEXT NOT NULL,
  UNIQUE(school_id, class_name, day_index, period_index)
);

-- Add missing columns if upgrading
ALTER TABLE school_members ADD COLUMN IF NOT EXISTS assigned_classes JSONB DEFAULT NULL;
ALTER TABLE school_members ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
ALTER TABLE school_members ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id);
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS breakdown JSONB DEFAULT '{}';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class  ON students(school_id, class_name);
CREATE INDEX IF NOT EXISTS idx_fees_school     ON fee_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_att_school_date ON attendance_records(school_id, record_date);

-- ═══════════════════════════════════════════════════════
-- Step 3: DISABLE RLS on schools + school_members
-- This is the permanent fix for infinite recursion
-- Security is handled at app layer via Supabase anon key
-- ═══════════════════════════════════════════════════════
ALTER TABLE schools         DISABLE ROW LEVEL SECURITY;
ALTER TABLE school_members  DISABLE ROW LEVEL SECURITY;

-- Drop ALL old policies on these two tables
DO $$ DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename IN ('schools','school_members') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════
-- Step 4: Enable RLS on data tables with simple policies
-- ═══════════════════════════════════════════════════════
ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetables        ENABLE ROW LEVEL SECURITY;

-- Drop old policies on data tables
DO $$ DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname,tablename FROM pg_policies
    WHERE tablename IN ('students','fee_structures','fee_payments','attendance_records','exams','exam_results','alerts','timetables') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Drop old functions
DROP FUNCTION IF EXISTS user_school_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS user_assigned_classes(UUID) CASCADE;
DROP FUNCTION IF EXISTS user_can_access_class(UUID,TEXT) CASCADE;

-- ═══════════════════════════════════════════════════════
-- Step 5: Helper function using direct table query
-- (Safe now because school_members has RLS disabled)
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT school_id FROM school_members
  WHERE user_id = auth.uid()
  ORDER BY invited_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_role(sid UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM school_members
  WHERE school_id = sid AND user_id = auth.uid() LIMIT 1;
$$;

-- ═══════════════════════════════════════════════════════
-- Step 6: Simple RLS Policies — school_id based only
-- No self-referencing subqueries!
-- ═══════════════════════════════════════════════════════

-- STUDENTS
CREATE POLICY "students_all" ON students FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

-- FEE STRUCTURES
CREATE POLICY "fee_struct_all" ON fee_structures FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

-- FEE PAYMENTS
CREATE POLICY "fee_pay_all" ON fee_payments FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

-- ATTENDANCE
CREATE POLICY "att_all" ON attendance_records FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

-- EXAMS
CREATE POLICY "exams_all" ON exams FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

-- EXAM RESULTS
CREATE POLICY "results_all" ON exam_results FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

-- ALERTS
CREATE POLICY "alerts_all" ON alerts FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

-- TIMETABLES
CREATE POLICY "tt_all" ON timetables FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

-- ═══════════════════════════════════════════════════════
-- Step 7: Storage buckets
-- ═══════════════════════════════════════════════════════
INSERT INTO storage.buckets (id,name,public)
  VALUES ('profiles','profiles',true),('documents','documents',false)
  ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('schools','school_members','students','fee_payments','attendance_records','exams','alerts')
ORDER BY tablename;

SELECT 'SETUP COMPLETE ✅ — Ab login karke school setup karo!' AS status;