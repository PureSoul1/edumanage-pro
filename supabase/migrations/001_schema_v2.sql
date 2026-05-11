-- ═══════════════════════════════════════════════════════
-- EDUMANAGE PRO v10 — COMPLETE DATABASE SETUP
-- Supabase SQL Editor mein run karo
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── SCHOOLS ──
CREATE TABLE IF NOT EXISTS schools (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'My School',
  academic_year TEXT DEFAULT '2024-25',
  phone        TEXT DEFAULT '',
  address      TEXT DEFAULT '',
  board        TEXT DEFAULT 'CBSE',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── SCHOOL MEMBERS ──
CREATE TABLE IF NOT EXISTS school_members (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','teacher','viewer')),
  assigned_classes JSONB DEFAULT NULL,
  display_name     TEXT DEFAULT '',
  email            TEXT DEFAULT '',
  invited_at       TIMESTAMPTZ DEFAULT NOW(),
  accepted_at      TIMESTAMPTZ,
  UNIQUE(school_id, user_id)
);

-- ── STUDENTS ──
CREATE TABLE IF NOT EXISTS students (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  class_name     TEXT NOT NULL DEFAULT '',
  roll_number    TEXT DEFAULT '',
  dob            DATE,
  father_name    TEXT DEFAULT '',
  mother_name    TEXT DEFAULT '',
  phone          TEXT NOT NULL,
  email          TEXT DEFAULT '',
  address        TEXT DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  conveyance_fee NUMERIC DEFAULT 0,
  bus_route      TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── FEE STRUCTURE ──
CREATE TABLE IF NOT EXISTS fee_structures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name      TEXT NOT NULL,
  component_key   TEXT NOT NULL,
  component_label TEXT NOT NULL,
  amount          NUMERIC DEFAULT 0,
  enabled         BOOLEAN DEFAULT false,
  always_on       BOOLEAN DEFAULT false,
  UNIQUE(school_id, class_name, component_key)
);

-- ── FEE PAYMENTS ──
CREATE TABLE IF NOT EXISTS fee_payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  month          TEXT NOT NULL,
  total_amount   NUMERIC DEFAULT 0,
  breakdown      JSONB DEFAULT '{}',
  payment_mode   TEXT DEFAULT 'cash',
  payment_date   DATE DEFAULT CURRENT_DATE,
  status         TEXT DEFAULT 'paid' CHECK (status IN ('paid','pending','partial')),
  notes          TEXT DEFAULT '',
  recorded_by    UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── ATTENDANCE ──
CREATE TABLE IF NOT EXISTS attendance_records (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_name  TEXT NOT NULL,
  record_date DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('P','A','L')),
  marked_by   UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, record_date)
);

-- ── EXAMS ──
CREATE TABLE IF NOT EXISTS exams (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  subject          TEXT NOT NULL,
  class_name       TEXT NOT NULL,
  exam_date        DATE NOT NULL,
  max_marks        NUMERIC DEFAULT 100,
  pass_marks       NUMERIC DEFAULT 33,
  duration_minutes INT DEFAULT 180,
  exam_type        TEXT DEFAULT 'written' CHECK (exam_type IN ('written','mcq','practical')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── EXAM RESULTS (DB persisted) ──
CREATE TABLE IF NOT EXISTS exam_results (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id        UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained NUMERIC DEFAULT 0,
  grade          TEXT DEFAULT '',
  recorded_by    UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, student_id)
);

-- ── TIMETABLES (DB persisted) ──
CREATE TABLE IF NOT EXISTS timetables (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name   TEXT NOT NULL,
  day_index    INT NOT NULL,   -- 0=Monday … 5=Saturday
  period_index INT NOT NULL,   -- 0-7
  subject      TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, class_name, day_index, period_index)
);

-- ── ALERTS ──
CREATE TABLE IF NOT EXISTS alerts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  alert_type     TEXT DEFAULT 'custom',
  message        TEXT NOT NULL,
  recipient_type TEXT DEFAULT 'all',
  recipient_count INT DEFAULT 0,
  sent_by        UUID REFERENCES auth.users(id),
  sent_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── ADD MISSING COLUMNS (safe upgrade) ──
ALTER TABLE school_members  ADD COLUMN IF NOT EXISTS assigned_classes JSONB DEFAULT NULL;
ALTER TABLE school_members  ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
ALTER TABLE school_members  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE fee_payments     ADD COLUMN IF NOT EXISTS breakdown JSONB DEFAULT '{}';
ALTER TABLE fee_payments     ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE fee_payments     ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id);
ALTER TABLE exam_results     ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '';
ALTER TABLE exam_results     ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id);

-- ── INDEXES ──
CREATE INDEX IF NOT EXISTS idx_students_school    ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class     ON students(school_id, class_name);
CREATE INDEX IF NOT EXISTS idx_fees_school        ON fee_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_fees_student       ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_att_school_date    ON attendance_records(school_id, record_date);
CREATE INDEX IF NOT EXISTS idx_att_student        ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_results_exam       ON exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_timetable_school   ON timetables(school_id, class_name);

-- ═══════════════════════════════════════════════════════
-- RLS — PERMANENT FIX
-- schools + school_members: RLS OFF (no recursion possible)
-- All data tables: simple school_id check via SECURITY DEFINER fn
-- ═══════════════════════════════════════════════════════

ALTER TABLE schools          DISABLE ROW LEVEL SECURITY;
ALTER TABLE school_members   DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DO $$ DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE tablename IN (
      'schools','school_members','students','fee_structures','fee_payments',
      'attendance_records','exams','exam_results','timetables','alerts'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Drop old helper functions
DROP FUNCTION IF EXISTS user_school_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS user_assigned_classes(UUID) CASCADE;
DROP FUNCTION IF EXISTS user_can_access_class(UUID,TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_my_school_id() CASCADE;
DROP FUNCTION IF EXISTS get_my_role(UUID) CASCADE;

-- New SECURITY DEFINER function — safe, no recursion
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT school_id FROM school_members
  WHERE user_id = auth.uid()
  ORDER BY invited_at DESC
  LIMIT 1;
$$;

-- Enable RLS on data tables
ALTER TABLE students           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetables         ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts             ENABLE ROW LEVEL SECURITY;

-- Simple school_id-based policies (no self-reference)
CREATE POLICY "students_policy"    ON students           FOR ALL USING (school_id = get_user_school_id()) WITH CHECK (school_id = get_user_school_id());
CREATE POLICY "fee_struct_policy"  ON fee_structures     FOR ALL USING (school_id = get_user_school_id()) WITH CHECK (school_id = get_user_school_id());
CREATE POLICY "fee_pay_policy"     ON fee_payments       FOR ALL USING (school_id = get_user_school_id()) WITH CHECK (school_id = get_user_school_id());
CREATE POLICY "att_policy"         ON attendance_records FOR ALL USING (school_id = get_user_school_id()) WITH CHECK (school_id = get_user_school_id());
CREATE POLICY "exams_policy"       ON exams              FOR ALL USING (school_id = get_user_school_id()) WITH CHECK (school_id = get_user_school_id());
CREATE POLICY "results_policy"     ON exam_results       FOR ALL USING (school_id = get_user_school_id()) WITH CHECK (school_id = get_user_school_id());
CREATE POLICY "timetables_policy"  ON timetables         FOR ALL USING (school_id = get_user_school_id()) WITH CHECK (school_id = get_user_school_id());
CREATE POLICY "alerts_policy"      ON alerts             FOR ALL USING (school_id = get_user_school_id()) WITH CHECK (school_id = get_user_school_id());

-- ── STORAGE BUCKETS ──
INSERT INTO storage.buckets (id,name,public)
  VALUES ('profiles','profiles',true),('documents','documents',false)
  ON CONFLICT DO NOTHING;
-- Students table pe index already hai, ye bhi add karo
CREATE INDEX IF NOT EXISTS idx_fees_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_att_student ON attendance_records(student_id);
-- ── VERIFY ──
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN (
  'schools','school_members','students','fee_payments',
  'attendance_records','exams','exam_results','timetables','alerts'
)
ORDER BY tablename;

SELECT 'DATABASE SETUP COMPLETE ✅' AS status;
