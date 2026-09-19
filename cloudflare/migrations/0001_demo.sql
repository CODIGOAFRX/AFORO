-- A room belongs to a visitor session. A CAS update commits the complete room
-- atomically; revision prevents two writers from accepting the same seat.
CREATE TABLE room (
  token_hash TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL CHECK(json_valid(data) AND length(data) <= 65536),
  expires_at INTEGER NOT NULL
);
CREATE INDEX room_expiry ON room(expires_at);
CREATE TABLE budget (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0
);
