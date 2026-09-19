import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { mutateRoom } from '../src/store.js';
import { emptyRoom, reserve } from '../src/domain.js';
import { admit } from '../src/index.js';

test('D1 concurrent CAS rejects duplicate seat and commits disjoint seats', async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', d1Databases: ['DB'] });
  try {
    const db = await mf.getD1Database('DB');
    const sql = await readFile(new URL('../migrations/0001_demo.sql', import.meta.url), 'utf8');
    for (const statement of sql.replace(/^--.*$/gm, '').split(';').filter(s => s.trim())) await db.prepare(statement).run();
    await db.prepare('INSERT INTO room(token_hash,data,expires_at) VALUES (?,?,unixepoch()+3600)').bind('session', JSON.stringify(emptyRoom())).run();
    const same = await Promise.allSettled([1,2].map(() => mutateRoom(db, 'session', (room, now) => reserve(room, [1], now))));
    assert.equal(same.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(same.find(r => r.status === 'rejected').reason.status, 409);
    await Promise.all([2,3].map(id => mutateRoom(db, 'session', (room, now) => reserve(room, [id], now))));
    const stored = await db.prepare('SELECT data FROM room WHERE token_hash = ?').bind('session').first();
    assert.equal(JSON.parse(stored.data).holds.length, 3);
    await assert.rejects(mutateRoom(db, 'foreign', () => null), { status: 401 });
    const day = new Date().toISOString().slice(0,10);
    await db.prepare('INSERT INTO budget(day,requests,sessions) VALUES (?,1499,19)').bind(day).run();
    const admission = await Promise.allSettled([admit(db, true), admit(db, true)]);
    assert.equal(admission.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(admission.find(r => r.status === 'rejected').reason.status, 429);
    const budget = await db.prepare('SELECT requests,sessions FROM budget WHERE day=?').bind(day).first();
    assert.deepEqual(budget, {requests: 1500, sessions: 20});
  } finally { await mf.dispose(); }
});
