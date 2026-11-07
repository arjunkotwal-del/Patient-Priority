-- Patient medical history. Safe to run more than once: it only adds what is missing.

CREATE TABLE IF NOT EXISTS patients (
  id            TEXT PRIMARY KEY,
  auth0_user_id TEXT UNIQUE,
  allergies     TEXT[] NOT NULL DEFAULT '{}',
  current_meds  TEXT[] NOT NULL DEFAULT '{}',
  conditions    TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS doctors (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  license_number TEXT,
  auth0_user_id  TEXT UNIQUE
);

-- One row per case, from check-in until the doctor resolves it.
CREATE TABLE IF NOT EXISTS past_visits (
  id         BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  complaint  TEXT NOT NULL,
  summary    TEXT NOT NULL,
  plan       TEXT NOT NULL
);

ALTER TABLE past_visits ALTER COLUMN visit_date SET DEFAULT CURRENT_DATE;
ALTER TABLE past_visits ALTER COLUMN summary DROP NOT NULL;
ALTER TABLE past_visits ALTER COLUMN plan DROP NOT NULL;
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'resolved'
  CHECK (status IN ('interviewing', 'waiting_for_doctor', 'doctor_asked', 'resolved', 'escalated'));
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS doctor_id TEXT REFERENCES doctors(id);
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS diagnosis TEXT;
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS suggested_ctas SMALLINT CHECK (suggested_ctas BETWEEN 1 AND 5);
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS confirmed_ctas SMALLINT CHECK (confirmed_ctas BETWEEN 1 AND 5);
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS red_flags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS soap JSONB;
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- A doctor claims a case so two doctors don't answer the same patient.
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS assigned_doctor_id TEXT REFERENCES doctors(id);
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
-- Why the doctor changed the AI's suggested CTAS, if they did.
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS ctas_override_reason TEXT;
-- Anything newer than these counts as unread for that side.
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS patient_read_at TIMESTAMPTZ;
ALTER TABLE past_visits ADD COLUMN IF NOT EXISTS doctor_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS past_visits_patient_date ON past_visits (patient_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS past_visits_queue ON past_visits (status, suggested_ctas, started_at);
CREATE INDEX IF NOT EXISTS past_visits_patient_started ON past_visits (patient_id, started_at DESC);

-- Every message in a visit: AI questions, patient answers, doctor questions and plans.
CREATE TABLE IF NOT EXISTS visit_messages (
  id       BIGSERIAL PRIMARY KEY,
  visit_id BIGINT NOT NULL REFERENCES past_visits(id) ON DELETE CASCADE,
  sender   TEXT NOT NULL CHECK (sender IN ('patient', 'ai', 'doctor')),
  kind     TEXT NOT NULL CHECK (kind IN ('question', 'answer', 'plan')),
  text     TEXT NOT NULL,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_messages_visit_sent ON visit_messages (visit_id, sent_at, id);

CREATE TABLE IF NOT EXISTS prescriptions (
  id            BIGSERIAL PRIMARY KEY,
  visit_id      BIGINT NOT NULL REFERENCES past_visits(id) ON DELETE CASCADE,
  doctor_id     TEXT NOT NULL REFERENCES doctors(id),
  medication    TEXT NOT NULL,
  dose          TEXT NOT NULL,
  frequency     TEXT NOT NULL,
  duration      TEXT NOT NULL,
  instructions  TEXT NOT NULL DEFAULT '',
  prescribed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prescriptions_visit ON prescriptions (visit_id);

-- Tests, imaging and referrals the doctor orders.
CREATE TABLE IF NOT EXISTS orders (
  id           BIGSERIAL PRIMARY KEY,
  visit_id     BIGINT NOT NULL REFERENCES past_visits(id) ON DELETE CASCADE,
  doctor_id    TEXT NOT NULL REFERENCES doctors(id),
  type         TEXT NOT NULL CHECK (type IN ('lab', 'imaging', 'referral', 'other')),
  name         TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  ordered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_visit ON orders (visit_id);

-- Private notes for doctors only. Never shown to the patient or sent to the AI.
CREATE TABLE IF NOT EXISTS doctor_notes (
  id         BIGSERIAL PRIMARY KEY,
  visit_id   BIGINT NOT NULL REFERENCES past_visits(id) ON DELETE CASCADE,
  doctor_id  TEXT NOT NULL REFERENCES doctors(id),
  text       TEXT NOT NULL,
  written_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doctor_notes_visit ON doctor_notes (visit_id, written_at);
