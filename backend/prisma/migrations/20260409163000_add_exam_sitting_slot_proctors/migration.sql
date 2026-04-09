CREATE TABLE IF NOT EXISTS exam_sitting_slot_proctors (
    id SERIAL PRIMARY KEY,
    slot_key TEXT NOT NULL UNIQUE,
    sitting_id INTEGER NOT NULL REFERENCES exam_sittings(id) ON DELETE CASCADE,
    academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    exam_type TEXT NOT NULL,
    semester TEXT,
    room_name TEXT NOT NULL,
    start_time TIMESTAMP(3) NOT NULL,
    end_time TIMESTAMP(3) NOT NULL,
    period_number INTEGER,
    session_id INTEGER REFERENCES exam_program_sessions(id) ON DELETE SET NULL,
    session_label TEXT,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    subject_name TEXT,
    proctor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS exam_sitting_slot_proctors_scope_idx
    ON exam_sitting_slot_proctors (academic_year_id, exam_type, start_time);

CREATE INDEX IF NOT EXISTS exam_sitting_slot_proctors_proctor_idx
    ON exam_sitting_slot_proctors (proctor_id, start_time);

CREATE INDEX IF NOT EXISTS exam_sitting_slot_proctors_sitting_idx
    ON exam_sitting_slot_proctors (sitting_id, start_time);
