CREATE TABLE experiment (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES demo_session(id),
    buyers integer NOT NULL CHECK (buyers BETWEEN 1 AND 30),
    interval_seconds integer NOT NULL CHECK (interval_seconds IN (1, 2, 5)),
    seats_per_buyer integer NOT NULL CHECK (seats_per_buyer IN (1, 2)),
    completed integer NOT NULL DEFAULT 0 CHECK (completed >= 0 AND completed <= buyers),
    status varchar(16) NOT NULL CHECK (status IN ('RUNNING','COMPLETED','STOPPED','FAILED')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    finished_at timestamptz,
    UNIQUE(id, session_id)
);
CREATE UNIQUE INDEX one_running_experiment_per_session ON experiment(session_id) WHERE status = 'RUNNING';
ALTER TABLE reservation ADD COLUMN experiment_id uuid;
ALTER TABLE reservation ADD COLUMN buyer_number integer;
ALTER TABLE reservation ADD CONSTRAINT reservation_experiment_scope FOREIGN KEY(experiment_id, session_id) REFERENCES experiment(id, session_id);
ALTER TABLE reservation ADD CONSTRAINT reservation_actor CHECK ((experiment_id IS NULL AND buyer_number IS NULL) OR (experiment_id IS NOT NULL AND buyer_number BETWEEN 1 AND 30));
CREATE UNIQUE INDEX one_reservation_per_buyer ON reservation(experiment_id, buyer_number) WHERE experiment_id IS NOT NULL;
CREATE TABLE experiment_attempt (
    experiment_id uuid NOT NULL REFERENCES experiment(id),
    buyer_number integer NOT NULL,
    outcome varchar(20) NOT NULL CHECK(outcome IN ('RESERVED','NO_AVAILABILITY','CONFLICT','ERROR')),
    reservation_id uuid REFERENCES reservation(id),
    duration_ms bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(experiment_id, buyer_number)
);
