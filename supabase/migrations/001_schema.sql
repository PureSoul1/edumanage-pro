-- Enable UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══ SCHOOLS ═══
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My School',
  academic_year TEXT DEFAULT '2024-25',
  phone TEXT, address TEXT, board TEXT DEFAULT 'CBSE',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ SCHOOL MEMBERSHIP ═══
CREATE TABLE school_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','teacher','viewer')),
  invited_at TIMESTAMPTZ DEFAULT NOW(), accepted_at TIMESTAMPTZ,
  UNIQUE(school_id, user_id)
);

-- ═══ STUDENTS ═══
CREATE TABLE students (
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
CREATE INDEX idx_students_school ON students(school_id);

-- ═══ FEE STRUCTURE ═══
CREATE TABLE fee_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, component_key TEXT NOT NULL,
  component_label TEXT NOT NULL, amount NUMERIC DEFAULT 0,
  enabled BOOLEAN DEFAULT false, always_on BOOLEAN DEFAULT false,
  UNIQUE(school_id, class_name, component_key)
);

-- ═══ FEE PAYMENTS ═══
CREATE TABLE fee_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL, month TEXT NOT NULL,
  total_amount NUMERIC DEFAULT 0, breakdown JSONB DEFAULT '{}',
  payment_mode TEXT DEFAULT 'cash', payment_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid','pending','partial')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fees_school ON fee_payments(school_id);

-- ═══ ATTENDANCE ═══
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, record_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P','A','L')),
  marked_by UUID REFERENCES auth.users(id),
  UNIQUE(student_id, record_date)
);

-- ═══ EXAMS ═══
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, subject TEXT NOT NULL, class_name TEXT NOT NULL,
  exam_date DATE NOT NULL, max_marks NUMERIC DEFAULT 100,
  pass_marks NUMERIC DEFAULT 33, duration_minutes INT DEFAULT 180,
  exam_type TEXT DEFAULT 'written' CHECK (exam_type IN ('written','mcq','practical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ EXAM RESULTS ═══
CREATE TABLE exam_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained NUMERIC DEFAULT 0,
  UNIQUE(exam_id, student_id)
);

-- ═══ ALERTS ═══
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  alert_type TEXT DEFAULT 'custom', message TEXT NOT NULL,
  recipient_type TEXT DEFAULT 'all', recipient_count INT DEFAULT 0,
  sent_by UUID REFERENCES auth.users(id), sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ TIMETABLES ═══
CREATE TABLE timetables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL, day_index INT NOT NULL,
  period_index INT NOT NULL, subject TEXT NOT NULL,
  UNIQUE(school_id, class_name, day_index, period_index)
);

-- ═══ ACTIVITY LOG ═══
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id), action TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id UUID, details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ ROW LEVEL SECURITY (RLS) ═══
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

-- Helper function to check role
CREATE OR REPLACE FUNCTION user_school_role(check_school_id UUID) RETURNS TEXT AS $$   SELECT role FROM school_members WHERE school_id = check_school_id AND user_id = auth.uid() LIMIT 1;
 $$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Policies (Secure by School ID and Role)
CREATE POLICY "Members see own schools" ON schools FOR SELECT USING (id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Owners insert schools" ON schools FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update schools" ON schools FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Members read" ON school_members FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admins invite" ON school_members FOR INSERT WITH CHECK (user_school_role(school_id) = 'admin');

CREATE POLICY "Members read students" ON students FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write students" ON students FOR ALL USING (user_school_role(school_id) IN ('admin','teacher'));

CREATE POLICY "Members read fees" ON fee_structures FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin manage fee structures" ON fee_structures FOR ALL USING (user_school_role(school_id) = 'admin');

CREATE POLICY "Members read fee_payments" ON fee_payments FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write fee_payments" ON fee_payments FOR ALL USING (user_school_role(school_id) IN ('admin','teacher'));

CREATE POLICY "Members read attendance" ON attendance_records FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write attendance" ON attendance_records FOR ALL USING (user_school_role(school_id) IN ('admin','teacher'));

CREATE POLICY "Members read exams" ON exams FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write exams" ON exams FOR ALL USING (user_school_role(school_id) IN ('admin','teacher'));

CREATE POLICY "Members read results" ON exam_results FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write results" ON exam_results FOR ALL USING (user_school_role(school_id) IN ('admin','teacher'));

CREATE POLICY "Members read alerts" ON alerts FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write alerts" ON alerts FOR ALL USING (user_school_role(school_id) IN ('admin','teacher'));

CREATE POLICY "Members read timetables" ON timetables FOR SELECT USING (school_id IN (SELECT school_id FROM school_members WHERE user_id = auth.uid()));
CREATE POLICY "Admin/Teacher write timetables" ON timetables FOR ALL USING (user_school_role(school_id) IN ('admin','teacher'));

-- ═══ STORAGE BUCKETS ═══
INSERT INTO storage.buckets (id, name, public) VALUES ('profiles', 'profiles', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);