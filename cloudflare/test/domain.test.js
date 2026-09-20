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
  for (let i=0;i<30;i++) advance(room, i*1000, () => 0);
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
test('random buyers vary size and position and never cross rows or reuse seats', () => {
  const room = emptyRoom();
  start(room, {buyers: 30, intervalSeconds: 1, seatsPerBuyer: 0}, 0);
  const sizes = new Set();
  for (let i=0;i<30;i++) {
    let draw = 0;
    advance(room, i*1000, () => draw++ === 0 ? (i%3 + 0.1)/3 : 0.79);
    const ids = room.attempts[0].seatIds;
    if (ids.length) {
      sizes.add(ids.length);
      assert.equal(Math.floor((ids[0]-1)/10), Math.floor((ids.at(-1)-1)/10));
      assert.equal(ids.at(-1)-ids[0], ids.length-1);
    }
  }
  assert.deepEqual([...sizes].sort(), [1,2,3]);
  assert.notEqual(room.holds[0].seatIds[0], 1);
  const assigned = room.holds.flatMap(h => h.seatIds);
  assert.equal(new Set(assigned).size, assigned.length);
});
