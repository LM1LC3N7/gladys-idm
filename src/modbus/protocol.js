// -----------------------------------------------------------------------------
// The Modbus PDUs of the iDM NAVIGATOR (pure): the read requests of the
// blocks, what their answers mean, and the write requests. Every decoder
// returns undefined when the answer has not the exact size asked or a value
// is not plausible: an unknown value is never a value.
// -----------------------------------------------------------------------------

import { BLOCKS, BOUNDS, CIRCUITS, CIRCUIT_POINTS, DHW_CAP, FC, LIMITS } from '../constants.js';

/** Registers a data point takes. */
export const sizeOf = (type) => (type === 'float' ? 2 : 1);

/** The first register and the count of a block. */
export function spanOf(block) {
  const [first] = block.points[0];
  const [last, type] = block.points.at(-1);
  return { address: first, count: last + sizeOf(type) - first };
}

/**
 * The blocks of the circuits: one block per kind of data point, from circuit
 * A to the last configured circuit (the run the iDM table documents; a
 * circuit not configured answers its "not available" value).
 */
export function circuitBlocks(circuits) {
  const last = Math.max(-1, ...circuits.map((c) => CIRCUITS.indexOf(c)));
  if (last < 0) return [];
  return CIRCUIT_POINTS.map((p) => ({
    key: `circuit-${p.key}`,
    core: Boolean(p.core),
    points: CIRCUITS.slice(0, last + 1).map((c, i) => [
      p.base + i * p.step,
      p.type,
      `circuit.${c}.${p.key}`,
    ]),
  }));
}

/** Every block of a poll, for the configured circuits. */
export const pollBlocks = (circuits) => [...BLOCKS, ...circuitBlocks(circuits)];

/** The read request of a block (function 4). */
export function readRequest(block) {
  const { address, count } = spanOf(block);
  if (count < 1 || count > LIMITS.registersPerRead) {
    throw new RangeError(`block ${block.key}: ${count} registers`);
  }
  const pdu = Buffer.alloc(5);
  pdu[0] = FC.READ_INPUT;
  pdu.writeUInt16BE(address, 1);
  pdu.writeUInt16BE(count, 3);
  return pdu;
}

/** The words of a read answer, or undefined when it is not exactly what was asked. */
export function parseRead(block, pdu) {
  const { count } = spanOf(block);
  if (!Buffer.isBuffer(pdu) || pdu.length < 2 || pdu[0] !== FC.READ_INPUT) return undefined;
  const bytes = pdu[1];
  if (bytes !== count * 2 || pdu.length !== 2 + bytes) return undefined;
  const words = [];
  for (let i = 0; i < count; i += 1) words.push(pdu.readUInt16BE(2 + i * 2));
  return words;
}

/** A FLOAT from its two registers, low word first (iDM chapter 4.2). */
export function floatOf(low, high) {
  if (!Number.isInteger(low) || !Number.isInteger(high)) return undefined;
  const buffer = Buffer.alloc(4);
  buffer.writeUInt16BE(high, 0);
  buffer.writeUInt16BE(low, 2);
  const value = buffer.readFloatBE(0);
  return Number.isFinite(value) ? value : undefined;
}

/** The two registers of a FLOAT, low word first. */
export function floatWords(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value, 0);
  return [buffer.readUInt16BE(2), buffer.readUInt16BE(0)];
}

/** A UCHAR register: 0-254, 0xFFFF (and 255) "not available". */
export const ucharOf = (word) =>
  Number.isInteger(word) && word >= 0 && word <= 254 ? word : undefined;

/** A WORD register: signed 16 bits. */
export const wordOf = (word) =>
  Number.isInteger(word) && word >= 0 && word <= 0xffff
    ? word >= 0x8000
      ? word - 0x10000
      : word
    : undefined;

/** The raw values of a block (FLOAT rounded to 0.01), by key; only those decodable. */
export function decodeBlock(block, words) {
  const values = {};
  if (!Array.isArray(words)) return values;
  const { address: start, count } = spanOf(block);
  if (words.length !== count) return values;
  for (const [address, type, key] of block.points) {
    const at = address - start;
    let value;
    if (type === 'float') {
      const raw = floatOf(words[at], words[at + 1]);
      value = raw === undefined ? undefined : Math.round(raw * 100) / 100;
    } else if (type === 'uchar') {
      value = ucharOf(words[at]);
    } else {
      value = wordOf(words[at]);
    }
    if (value !== undefined) values[key] = value;
  }
  return values;
}

/**
 * The write request of one data point (function 16): its address, its
 * registers. The hot water setpoint (1032) is checked here once more: never
 * above DHW_CAP.max, whatever the caller asked.
 */
export function writeRequest(address, type, value) {
  let words;
  if (type === 'float') {
    if (!Number.isFinite(value)) throw new RangeError('A FLOAT is a finite number');
    words = floatWords(value);
  } else if (type === 'uchar') {
    if (!Number.isInteger(value) || value < 0 || value > 254) {
      throw new RangeError('A UCHAR is 0-254');
    }
    words = [value];
  } else {
    throw new RangeError('Not a writable type');
  }
  if (address === 1032 && (value > DHW_CAP.max || value < BOUNDS.dhwSetpoint.min)) {
    throw new RangeError('Hot water setpoint out of bounds');
  }
  const pdu = Buffer.alloc(6 + words.length * 2);
  pdu[0] = FC.WRITE_MULTIPLE;
  pdu.writeUInt16BE(address, 1);
  pdu.writeUInt16BE(words.length, 3);
  pdu[5] = words.length * 2;
  words.forEach((w, i) => pdu.writeUInt16BE(w, 6 + i * 2));
  return pdu;
}

/** A write multiple is answered by its function, address and count, exactly. */
export const isWriteEcho = (request, answer) =>
  Buffer.isBuffer(answer) && answer.length === 5 && request.subarray(0, 5).equals(answer);

/** The read request of one data point (the read back of a command). */
export const pointBlock = (key, address, type) => ({ key, points: [[address, type, key]] });
