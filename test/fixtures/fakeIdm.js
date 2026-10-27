// -----------------------------------------------------------------------------
// A fake iDM NAVIGATOR behind the injected `connect` (no network), on the
// timers of the test clock: Modbus TCP framing (MBAP), function 4 reads and
// function 16 writes, answers after a delay. Like the NAVIGATOR as iDM
// documents it, a read must start on a documented data point and cover whole
// data points only (else exception 2), and each data point is answered from
// its own start (the humidity FLOAT at 1392 and the mode of circuit A at
// 1393 overlap in the iDM table); a write must cover exactly one writable
// data point. It counts the connections open at once (the
// integration must never open a second one). Values made up, never from a
// real heat pump.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { BLOCKS, CIRCUITS, CIRCUIT_POINTS } from '../../src/constants.js';

export const HOST = '192.168.1.60';
export const NOW = Date.UTC(2026, 9, 27, 10, 0, 0);

/** Every documented data point: address -> type. */
export const POINTS = new Map([
  ...BLOCKS.flatMap((b) => b.points.map(([address, type]) => [address, type])),
  ...CIRCUIT_POINTS.flatMap((p) => CIRCUITS.map((_, i) => [p.base + i * p.step, p.type])),
  [1033, 'uchar'],
  [1034, 'uchar'],
]);
const WRITABLE = new Set([
  1005,
  1032,
  ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) => [1393 + i, 1401 + 2 * i]),
]);
const size = (type) => (type === 'float' ? 2 : 1);

export function floatWords(value) {
  const b = Buffer.alloc(4);
  b.writeFloatBE(value, 0);
  return [b.readUInt16BE(2), b.readUInt16BE(0)];
}

function wordsFloat([lo, hi]) {
  const b = Buffer.alloc(4);
  b.writeUInt16BE(hi ?? 0, 0);
  b.writeUInt16BE(lo ?? 0, 2);
  return b.readFloatBE(0);
}

/** A heat pump in automatic, heating, circuit A on its time program. */
export function defaultValues() {
  const v = {
    1000: 4.5,
    1002: 6.2,
    1004: 0,
    1005: 1,
    1008: 35.1,
    1010: -1,
    1012: 44,
    1014: 48.3,
    1030: 47,
    1032: 48,
    1033: 46,
    1034: 50,
    1050: 35.2,
    1052: 30.1,
    1054: 60,
    1056: 8.2,
    1058: 5.1,
    1060: -1,
    1090: 1,
    1099: 0,
    1100: 1,
    1101: 0,
    1102: 0,
    1103: 0,
    1104: 65,
    1392: -1,
    1850: -1,
    1852: -1,
    1854: -1,
    4122: 2.15,
  };
  const circuitA = { 1350: 33, 1364: 21.5, 1378: 34, 1393: 1, 1401: 22, 1498: 1 };
  Object.assign(v, circuitA);
  for (let i = 1; i < 7; i += 1) {
    v[1350 + 2 * i] = -1;
    v[1364 + 2 * i] = -1;
    v[1378 + 2 * i] = -1;
    v[1393 + i] = 0xffff;
    v[1401 + 2 * i] = -1;
    v[1498 + i] = 0xffff;
  }
  return v;
}

class FakeSocket extends EventEmitter {
  constructor(hp) {
    super();
    this.hp = hp;
    this.destroyed = false;
  }

  write(bytes) {
    if (this.destroyed) throw new Error('write after destroy');
    this.hp.handle(this, Buffer.from(bytes));
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.hp.open.delete(this);
    setImmediate(() => this.emit('close'));
  }

  setNoDelay() {}
}

export function fakeIdm({ timers, values = defaultValues(), unitId = 1 } = {}) {
  const map = new Map();
  const hp = {
    map,
    unitId,
    open: new Set(),
    maxOpen: 0,
    /** Every request: { fc, address, count, words? }. */
    log: [],
    connections: 0,
    refused: 0,
    down: false,
    connectDelay: 5,
    delay: 10,
    /** Addresses (start of a request) that never answer, or answer an exception. */
    silent: new Set(),
    exceptions: new Map(),
    /** Writes acknowledged but not applied, or applied after `applyDelay` ms. */
    ignoreWrites: false,
    applyDelay: 0,
    /** Writes applied even when their connection closed before the answer. */
    applyClosedWrites: false,
    badEcho: false,
    /** The words of a data point, by its start address. */
    set(address, value) {
      map.set(
        address,
        POINTS.get(address) === 'float' ? floatWords(value) : [value < 0 ? value + 0x10000 : value],
      );
    },
    get(address) {
      const words = map.get(address);
      if (!words) return undefined;
      return POINTS.get(address) === 'float' ? wordsFloat(words) : words[0];
    },
    /** Whether a read covers whole documented data points, from a documented start. */
    documented(address, count) {
      let at = address;
      while (at < address + count) {
        const type = POINTS.get(at);
        if (!type) return false;
        at += size(type);
      }
      return at === address + count;
    },
    apply(address, words) {
      map.set(address, [...words]);
    },
    handle(socket, frame) {
      const tid = frame.readUInt16BE(0);
      const uid = frame[6];
      const pdu = frame.subarray(7);
      const fc = pdu[0];
      const address = pdu.readUInt16BE(1);
      const count = pdu.readUInt16BE(3);
      const words = [];
      if (fc === 16) {
        for (let i = 0; i < count; i += 1) words.push(pdu.readUInt16BE(6 + i * 2));
      }
      hp.log.push(fc === 16 ? { fc, address, count, words } : { fc, address, count });
      if (hp.silent.has(address)) return;
      timers.setTimeout(() => {
        if (socket.destroyed) {
          if (fc === 16 && hp.applyClosedWrites && !hp.ignoreWrites) hp.apply(address, words);
          return;
        }
        let answer;
        const exception = hp.exceptions.get(address);
        if (exception) {
          answer = Buffer.from([fc | 0x80, exception]);
        } else if (fc === 4) {
          if (!hp.documented(address, count)) {
            answer = Buffer.from([fc | 0x80, 2]);
          } else {
            answer = Buffer.alloc(2 + count * 2);
            answer[0] = fc;
            answer[1] = count * 2;
            let at = address;
            while (at < address + count) {
              const n = size(POINTS.get(at));
              const words = map.get(at) ?? new Array(n).fill(0);
              for (let i = 0; i < n; i += 1)
                answer.writeUInt16BE(words[i] ?? 0, 2 + (at - address + i) * 2);
              at += n;
            }
          }
        } else if (fc === 16) {
          const type = POINTS.get(address);
          if (!WRITABLE.has(address) || !type || size(type) !== count) {
            answer = Buffer.from([fc | 0x80, 2]);
          } else {
            if (!hp.ignoreWrites) {
              if (hp.applyDelay > 0)
                timers.setTimeout(() => hp.apply(address, words), hp.applyDelay);
              else hp.apply(address, words);
            }
            answer = Buffer.from(pdu.subarray(0, 5));
            if (hp.badEcho) answer[4] ^= 1;
          }
        } else {
          answer = Buffer.from([fc | 0x80, 1]);
        }
        const out = Buffer.alloc(7 + answer.length);
        out.writeUInt16BE(tid, 0);
        out.writeUInt16BE(0, 2);
        out.writeUInt16BE(answer.length + 1, 4);
        out[6] = uid;
        answer.copy(out, 7);
        socket.emit('data', out);
      }, hp.delay);
    },
    connect() {
      const socket = new FakeSocket(hp);
      hp.connections += 1;
      timers.setTimeout(() => {
        if (socket.destroyed) return;
        if (hp.down) {
          hp.refused += 1;
          socket.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
          return;
        }
        hp.open.add(socket);
        hp.maxOpen = Math.max(hp.maxOpen, hp.open.size);
        socket.emit('connect');
      }, hp.connectDelay);
      return socket;
    },
    writes: () => hp.log.filter((r) => r.fc === 16),
    reads: () => hp.log.filter((r) => r.fc === 4),
  };
  for (const [address, value] of Object.entries(values)) hp.set(Number(address), value);
  hp.connectFn = () => hp.connect();
  return hp;
}
