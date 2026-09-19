import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyRoom, reserve, start, advance, stop, snapshot } from '../src/domain.js';

test('overlap rejects the whole selection and expiry releases seats', () => {
  const room = emptyRoom();
  reserve(room, [1,2], 1000);
  assert.throws(() => reserve(room, [2,3], 1001), { status: 409 });
  assert.equal(snapshot(room, 1001).counts.heldSeats, 2);
  reserve(room, [2,3], 301001);
  assert.equal(snapshot(room, 301001).counts.heldSeats, 2);
});
test('thirty pairs fill sixty seats without crossing rows', () => {
  const room = emptyRoom();
  start(room, { buyers: 30, intervalSeconds: 1, seatsPerBuyer: 2 }, 0);
  for (let i=0;i<30;i++) advance(room, i*1000);
  const view = snapshot(room, 30000);
  assert.equal(view.counts.heldSeats, 60);
  assert.equal(view.counts.automated, 30);
  assert.equal(view.reservations.length, 0);
  assert.equal(room.run.status, 'COMPLETED');
  for (const h of room.holds) assert.equal(Math.floor((h.seatIds[0]-1)/10), Math.floor((h.seatIds[1]-1)/10));
});
test('duplicate ticks, stop, and invalid selections do not consume seats', () => {
  const room = emptyRoom();
  for (const ids of [[1,1],[null],[],[61]]) assert.throws(() => reserve(room, ids, 0), { status: 400 });
  start(room, { buyers: 30, intervalSeconds: 5, seatsPerBuyer: 1 }, 0);
  assert.equal(advance(room, 0), true);
  assert.equal(advance(room, 0), false);
  assert.throws(() => stop(room, 'foreign'), { status: 404 });
  stop(room, room.run.id);
  assert.equal(advance(room, 10000), false);
  assert.equal(room.holds.length, 1);
});
