// -----------------------------------------------------------------------------
// The Modbus PDUs (pure): the blocks against the iDM table, the FLOAT word
// order, the special values, the write requests and their bounds.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, LIMITS } from '../src/constants.js';
import { interpret, operatingState } from '../src/model.js';
import {
  circuitBlocks,
  decodeBlock,
  floatOf,
  floatWords,
  isWriteEcho,
  parseRead,
  pollBlocks,
  readRequest,
  sizeOf,
  spanOf,
  writeRequest,
} from '../src/modbus/protocol.js';

test('every block is a run of contiguous data points, 32 registers at most', () => {
  for (const block of pollBlocks(['a', 'b', 'c', 'd', 'e', 'f', 'g'])) {
    let next = block.points[0][0];
    for (const [address, type] of block.points) {
      assert.equal(address, next, `${block.key}: ${address} follows the previous point`);
      next = address + sizeOf(type);
    }
    assert.ok(spanOf(block).count <= LIMITS.registersPerRead, block.key);
  }
});

test('the iDM addresses (NAVIGATOR 10 table 2025-06-18, hacs-idm-heatpump v0.14.0)', () => {
  const at = Object.fromEntries(BLOCKS.flatMap((b) => b.points.map(([a, t, k]) => [k, [a, t]])));
  assert.deepEqual(at.outdoor, [1000, 'float']);
  assert.deepEqual(at.systemMode, [1005, 'uchar']);
  assert.deepEqual(at.dhwSetpoint, [1032, 'uchar']);
  assert.deepEqual(at.operating, [1090, 'uchar']);
  assert.deepEqual(at.fault, [1099, 'uchar']);
  assert.deepEqual(at.chargePump, [1104, 'word']);
  assert.deepEqual(at.humidity, [1392, 'float']);
  assert.deepEqual(at.power, [4122, 'float']);
  const blocks = Object.fromEntries(circuitBlocks(['a', 'c']).map((b) => [b.key, b.points]));
  assert.deepEqual(
    blocks['circuit-mode'].map(([a]) => a),
    [1393, 1394, 1395],
  );
  assert.deepEqual(
    blocks['circuit-setpoint'].map(([a]) => a),
    [1401, 1403, 1405],
  );
  assert.deepEqual(
    blocks['circuit-flow'].map(([a]) => a),
    [1350, 1352, 1354],
  );
  assert.deepEqual(
    blocks['circuit-active'].map(([a]) => a),
    [1498, 1499, 1500],
  );
  assert.deepEqual(circuitBlocks([]), []);
});

test('FLOAT: low word first (iDM chapter 4.2)', () => {
  // 21.5 = 0x41AC0000: high word 0x41AC, low word 0x0000.
  assert.deepEqual(floatWords(21.5), [0x0000, 0x41ac]);
  assert.equal(floatOf(0x0000, 0x41ac), 21.5);
  assert.equal(floatOf(0xffff, 0x7fff), undefined, 'NaN is not a value');
  const block = {
    key: 'x',
    points: [
      [1000, 'float', 'outdoor'],
      [1002, 'float', 'avg'],
      [1004, 'uchar', 'm'],
      [1005, 'uchar', 's'],
    ],
  };
  const words = [...floatWords(-3.25), ...floatWords(1), 0xffff, 4];
  assert.deepEqual(decodeBlock(block, words), { outdoor: -3.25, avg: 1, s: 4 });
  assert.deepEqual(decodeBlock(block, words.slice(1)), {}, 'wrong size: nothing');
});

test('a read answer of the wrong size is refused', () => {
  const block = BLOCKS[0];
  const { count } = spanOf(block);
  assert.deepEqual([...readRequest(block)], [4, 0x03, 0xe8, 0, count]);
  const pdu = Buffer.alloc(2 + count * 2);
  pdu[0] = 4;
  pdu[1] = count * 2;
  assert.equal(parseRead(block, pdu).length, count);
  assert.equal(parseRead(block, pdu.subarray(0, pdu.length - 1)), undefined);
  pdu[1] = count * 2 - 2;
  assert.equal(parseRead(block, pdu), undefined);
});

test('special values are not measures', () => {
  const v = interpret({
    outdoor: -1,
    heatStorage: -1,
    airIntake: 130,
    humidity: -1,
    power: -1,
    chargePump: -1,
    systemMode: 9,
    'circuit.a.mode': 2,
    'circuit.b.flow': -1,
    'circuit.a.room': 21.46,
  });
  assert.equal(v.outdoor, -1, 'an outdoor temperature of -1 °C is real');
  assert.equal(v.heatStorage, undefined);
  assert.equal(v.airIntake, undefined, 'out of range');
  assert.equal(v.humidity, undefined);
  assert.equal(v.power, undefined);
  assert.equal(v.chargePump, 0, 'pump off');
  assert.equal(v.systemMode, undefined);
  assert.equal(v['circuit.a.mode'], 'normal');
  assert.equal(v['circuit.b.flow'], undefined);
  assert.equal(v['circuit.a.room'], 21.5);
  assert.equal(operatingState(0), 'standby');
  assert.equal(operatingState(5), 'heating+dhw');
  assert.equal(operatingState(16), undefined);
});

test('writes: one data point, function 16; hot water never above 60 °C', () => {
  const req = writeRequest(1032, 'uchar', 55);
  assert.deepEqual([...req], [16, 0x04, 0x08, 0, 1, 2, 0, 55]);
  assert.throws(() => writeRequest(1032, 'uchar', 61), /out of bounds/);
  assert.throws(() => writeRequest(1032, 'uchar', 34), /out of bounds/);
  assert.throws(() => writeRequest(1005, 'uchar', 300));
  assert.throws(() => writeRequest(1401, 'float', Number.NaN));
  const f = writeRequest(1401, 'float', 21.5);
  assert.deepEqual([...f], [16, 0x05, 0x79, 0, 2, 4, 0, 0, 0x41, 0xac]);
  assert.ok(isWriteEcho(f, f.subarray(0, 5)));
  assert.ok(!isWriteEcho(f, Buffer.from([16, 0x05, 0x79, 0, 1])));
  assert.ok(!isWriteEcho(f, f));
});
