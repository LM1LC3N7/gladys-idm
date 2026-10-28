import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dhwCapOf, normalizeConfig, parseAddress, parseCircuits } from '../src/config.js';
import { normalizeMemory } from '../src/store.js';

test('addresses: IPv4 or host name, optional port; never broadcast, multicast nor 0.x', () => {
  assert.deepEqual(parseAddress('192.168.1.60'), { host: '192.168.1.60', port: 502 });
  assert.deepEqual(parseAddress(' idm.local:1502 '), { host: 'idm.local', port: 1502 });
  for (const bad of [
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '192.168.1.255',
    'a..b',
    'http://x',
    'x:0',
    'x:70000',
    'x\r\n',
    '',
  ]) {
    assert.equal(parseAddress(bad), undefined, bad);
  }
});

test('circuits: letters A to G only, nothing guessed', () => {
  assert.deepEqual(parseCircuits('A, b ;C'), { circuits: ['a', 'b', 'c'], invalid: false });
  assert.deepEqual(parseCircuits('A, H, 1'), { circuits: ['a'], invalid: true });
  assert.deepEqual(parseCircuits(''), { circuits: [], invalid: false });
  assert.deepEqual(parseCircuits(42), { circuits: [], invalid: false });
});

test('hot water ceiling: 65 °C by default, 35 to 65 °C, rounded down', () => {
  assert.equal(dhwCapOf(undefined), 65);
  assert.equal(dhwCapOf(''), 65);
  assert.equal(dhwCapOf(null), 65);
  assert.equal(dhwCapOf(90), 65);
  assert.equal(dhwCapOf(65.5), 65);
  assert.equal(dhwCapOf('64.9'), 64);
  assert.equal(dhwCapOf(10), 35);
});

test('the configuration: commands off unless strictly true, unit id checked', () => {
  const c = normalizeConfig({ host: '192.168.1.60', allow_commands: 'yes', unit_id: '' });
  assert.equal(c.allowCommands, false);
  assert.equal(c.address, undefined, 'no valid unit id: nothing read');
  assert.equal(normalizeConfig({ host: 'x', allow_commands: 'true' }).allowCommands, true);
  assert.equal(normalizeConfig({ host: 'not valid!' }).invalid, 10, 'only the length is kept');
  assert.equal(normalizeConfig({ host: '192.168.1.60\r\n' }).address, undefined, 'CR LF refused');
  assert.equal(normalizeConfig({ poll_interval: 5 }).pollInterval, 30);
  assert.deepEqual(normalizeConfig({}).circuits, ['a']);
});

test('/data: repaired and bounded; a stop never outlives its guard; a guard beyond its duration is invalid', () => {
  const now = Date.UTC(2026, 9, 27);
  const m = normalizeMemory(
    {
      lastAttemptAt: now + 1e9,
      stops: [
        {
          host: '192.168.1.60',
          port: 502,
          unitId: 1,
          register: 1005,
          until: now + 1e9,
        },
        {
          host: '192.168.1.60',
          port: 502,
          unitId: 1,
          register: 1005,
          until: now + 60_000,
          reasserts: 9,
          written: true,
          before: ['automatic', 'Bad Value', 'away', 'eco'],
        },
        { host: '192.168.1.60', port: 502, unitId: 1, register: 1032, until: now + 1000 },
        { host: 'evil\r\nhost', port: 502, unitId: 1, register: 1005, until: now + 1000 },
        { host: '192.168.1.60', port: 502, unitId: 1, register: 1393, until: now - 1 },
      ],
      target: { host: '192.168.1.60', port: 502, unitId: 1 },
    },
    now,
  );
  assert.equal(m.lastAttemptAt, now);
  assert.equal(
    m.stops.length,
    1,
    'a known stop register, a clean host, not expired, not in the future',
  );
  assert.equal(m.stops[0].until, now + 60_000);
  assert.equal(m.stops[0].reasserts, 3);
  assert.equal(m.stops[0].written, true);
  assert.deepEqual(m.stops[0].before, ['automatic', 'away']);
  assert.equal(m.stops[0].value, 0);
  assert.deepEqual(m.target, { host: '192.168.1.60', port: 502, unitId: 1 });
  assert.deepEqual(normalizeMemory('garbage', now), {
    target: null,
    lastAttemptAt: null,
    stops: [],
  });
});
