-- Patient medical history. Safe to run more than once.
CREATE TABLE IF NOT EXISTS patients (
  id            TEXT PRIMARY KEY,
  auth0_user_id TEXT UNIQUE,
  allergies     TEXT[] NOT NULL DEFAULT '{}',
  current_meds  TEXT[] NOT NULL DEFAULT '{}',
  conditions    TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS past_visits (
  id         BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  complaint  TEXT NOT NULL,
  summary    TEXT NOT NULL,
  plan       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS past_visits_patient_date ON past_visits (patient_id, visit_date DESC);
