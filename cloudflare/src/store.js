import { Problem } from './domain.js';

export async function readRoom(db, hash) {
  const record = await db.prepare('SELECT revision, data FROM room WHERE token_hash = ? AND expires_at > unixepoch()').bind(hash).first();
  if (!record) throw new Problem(401, 'La sesión ha caducado. Recarga la página.');
  return { revision: record.revision, room: JSON.parse(record.data) };
}
// A stale writer must recompute against the latest room, never reuse its draft.
export async function mutateRoom(db, hash, transform) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { revision, room } = await readRoom(db, hash);
    const result = transform(room, Date.now());
    if (result?.unchanged) return result.value;
    const updated = await db.prepare('UPDATE room SET data = ?, revision = revision + 1 WHERE token_hash = ? AND revision = ? AND expires_at > unixepoch()')
      .bind(JSON.stringify(room), hash, revision).run();
    if (updated.meta.changes === 1) return result;
  }
  throw new Problem(409, 'La sala ha cambiado. Actualiza e inténtalo otra vez.');
}
