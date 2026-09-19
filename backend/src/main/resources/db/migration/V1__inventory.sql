CREATE TABLE demo_session (
    id uuid PRIMARY KEY,
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '1 day')
);

CREATE TABLE event (
    id varchar(32) PRIMARY KEY,
    name text NOT NULL,
    venue text NOT NULL,
    starts_at timestamptz NOT NULL,
    price_cents integer NOT NULL CHECK (price_cents > 0)
);
INSERT INTO event VALUES ('nocturna', 'NOCTURNA / Sesión 01', 'Sala Horizonte · Madrid', '2027-06-19 21:00:00+02', 2400);

CREATE TABLE seat (
    id integer PRIMARY KEY,
    row_label varchar(2) NOT NULL,
    number integer NOT NULL,
    UNIQUE(row_label, number)
);
INSERT INTO seat SELECT n, chr(65 + (n - 1) / 10), (n - 1) % 10 + 1 FROM generate_series(1, 60) n;

CREATE TABLE reservation (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES demo_session(id),
    event_id varchar(32) NOT NULL REFERENCES event(id),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > created_at),
    UNIQUE(id, session_id, event_id)
);

CREATE TABLE event_seat (
    session_id uuid NOT NULL REFERENCES demo_session(id),
    event_id varchar(32) NOT NULL REFERENCES event(id),
    seat_id integer NOT NULL REFERENCES seat(id),
    reservation_id uuid,
    PRIMARY KEY(session_id, event_id, seat_id),
    FOREIGN KEY(reservation_id, session_id, event_id) REFERENCES reservation(id, session_id, event_id)
);
CREATE TABLE reservation_seat (
    reservation_id uuid NOT NULL REFERENCES reservation(id),
    seat_id integer NOT NULL REFERENCES seat(id),
    PRIMARY KEY(reservation_id, seat_id)
);
CREATE INDEX reservation_session_idx ON reservation(session_id);
