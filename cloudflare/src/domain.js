export class Problem extends Error {
  constructor(status, detail) { super(detail); this.status = status; }
}
export const emptyRoom = () => ({ holds: [], run: null, attempts: [], runs: 0, manual: 0 });
const iso = (now) => new Date(now).toISOString();
export function reserve(room, seatIds, now, source = 'YOU') {
  if (!Array.isArray(seatIds) || seatIds.length < 1 || seatIds.length > 6 ||
      new Set(seatIds).size !== seatIds.length ||
      seatIds.some(id => !Number.isInteger(id) || id < 1 || id > 60)) {
    throw new Problem(400, 'Selecciona entre uno y seis asientos distintos.');
  }
  if (source === 'YOU' && room.manual >= 10) throw new Problem(429, 'Has alcanzado las diez reservas de esta sesión de demostración.');
  const occupied = new Set(room.holds.filter(h => h.until > now).flatMap(h => h.seatIds));
  if (seatIds.some(id => occupied.has(id))) throw new Problem(409, 'Alguno de los asientos ya está ocupado.');
  const hold = { id: crypto.randomUUID(), seatIds: [...seatIds].sort((a,b) => a-b), until: now + 300000, source };
  room.holds.push(hold);
  if (source === 'YOU') room.manual++;
  return hold;
}
export function start(room, config, now) {
  const { buyers, intervalSeconds, seatsPerBuyer } = config;
  if (!Number.isInteger(buyers) || buyers < 1 || buyers > 30 ||
      ![1,2,5].includes(intervalSeconds) || ![0,1,2].includes(seatsPerBuyer)) {
    throw new Problem(400, 'Usa de 1 a 30 compradores, intervalos de 1, 2 o 5 segundos y grupos aleatorios, de uno o de dos.');
  }
  if (room.run?.status === 'RUNNING' && now - room.run.startedAt < 300000) throw new Problem(409, 'Ya hay una prueba en curso.');
  if (room.runs >= 3) throw new Problem(429, 'Límite de tres pruebas por sesión de demostración.');
  room.runs++;
  room.run = { id: crypto.randomUUID(), buyers, intervalSeconds, seatsPerBuyer, completed: 0, status: 'RUNNING', startedAt: now, nextAt: now };
  room.attempts = [];
  return { ...room.run };
}
export function advance(room, now, random = Math.random) {
  const run = room.run;
  if (!run || run.status !== 'RUNNING') return false;
  if (now - run.startedAt >= 300000) { run.status = 'STOPPED'; return true; }
  if (now < run.nextAt) return false;
  const occupied = new Set(room.holds.filter(h => h.until > now).flatMap(h => h.seatIds));
  const size = run.seatsPerBuyer === 0 ? 1 + Math.floor(random() * 3) : run.seatsPerBuyer;
  const candidates = [];
  for (let id = 1; id <= 60; id++) {
    if ((id - 1) % 10 + size > 10) continue;
    const group = Array.from({length: size}, (_, offset) => id + offset);
    if (group.every(seat => !occupied.has(seat))) candidates.push(group);
  }
  const ids = candidates.length ? candidates[Math.floor(random() * candidates.length)] : [];
  if (ids.length) reserve(room, ids, now, 'AUTOMATED');
  run.completed++;
  room.attempts.unshift({ buyer: run.completed, outcome: ids.length ? 'RESERVED' : 'NO_AVAILABILITY', seatIds: ids, durationMs: 0, createdAt: iso(now) });
  run.nextAt = now + run.intervalSeconds * 1000;
  if (run.completed === run.buyers) run.status = 'COMPLETED';
  return true;
}
export function stop(room, id) {
  if (room.run?.id !== id) throw new Problem(404, 'Prueba no encontrada.');
  if (room.run.status === 'RUNNING') room.run.status = 'STOPPED';
}
export function holdView(hold, now) {
  return { id: hold.id, seatIds: hold.seatIds, expiresAt: iso(hold.until), serverTime: iso(now), source: hold.source, state: hold.until > now ? 'ACTIVE' : 'EXPIRED' };
}
export function snapshot(room, now) {
  const active = room.holds.filter(h => h.until > now);
  const occupied = new Set(active.flatMap(h => h.seatIds));
  return {
    inventory: { serverTime: iso(now), seats: Array.from({ length: 60 }, (_, i) => ({ id: i+1, row: String.fromCharCode(65+Math.floor(i/10)), number: i%10+1, state: occupied.has(i+1) ? 'HELD' : 'AVAILABLE' })) },
    reservations: room.holds.filter(h => h.source === 'YOU').slice(-30).reverse().map(h => holdView(h, now)),
    experiment: { run: room.run, attempts: room.attempts },
    counts: { total: active.length, yours: active.filter(h => h.source === 'YOU').length, automated: active.filter(h => h.source === 'AUTOMATED').length, heldSeats: occupied.size }
  };
}
