// -----------------------------------------------------------------------------
// The integration end to end: fake Gladys, fake NAVIGATOR, virtual clock.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { memoryStore } from '../src/store.js';
import { BLOCKS } from '../src/constants.js';
import { ALLOW, CFG, DEVICE, MINUTE, SECOND, feature, setup } from './helpers.js';
import { HOST, NOW, fakeIdm } from './fixtures/fakeIdm.js';
import { testClock } from './kit/clock.mjs';

test('discovery: one device, the values read and published, special values left out', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  const [device] = ctx.gladys.fake.discoveredDevices;
  assert.equal(device.external_id, DEVICE);
  const types = device.features.map((f) => `${f.category}/${f.type}`);
  assert.ok(!types.some((x) => x.startsWith('switch/')), 'never a switch');
  for (const f of device.features.filter((f) => !f.read_only)) {
    assert.ok(
      ['text/select', 'water-heater/target-temperature', 'thermostat/target-temperature'].includes(
        `${f.category}/${f.type}`,
      ),
      `${f.external_id} is writable`,
    );
  }
  for (const f of device.features) {
    for (const o of f.supported_options ?? []) {
      assert.equal(typeof o.label, 'string', `${f.external_id} label`);
    }
  }
  const roles = device.features.map((f) => f.external_id.slice(DEVICE.length + 1));
  assert.ok(
    roles.includes('circuit-a-mode') && !roles.includes('circuit-b-mode'),
    'circuit A only',
  );
  assert.ok(!roles.includes('temperature-solar-collector'), 'no solar feature without solar');
  assert.ok(!roles.includes('humidity'), 'no humidity sensor');
  const dhw = device.features.find((f) => f.external_id === feature('dhw-setpoint'));
  assert.equal(dhw.max, 55, 'hot water: the ceiling of the configuration (55 °C by default)');
  assert.equal(ctx.state('temperature-outdoor').state, 4.5);
  assert.equal(ctx.state('temperature-dhw-top').state, 48.3);
  assert.equal(ctx.state('dhw-setpoint').state, 48);
  assert.equal(ctx.state('system-mode').text, 'automatic');
  assert.equal(ctx.state('operating-state').text, 'heating');
  assert.equal(ctx.state('compressor').state, 1);
  assert.equal(ctx.state('charge-pump').state, 1);
  assert.equal(ctx.state('power').state, 2.15);
  assert.equal(ctx.state('circuit-a-mode').text, 'program');
  assert.equal(ctx.state('circuit-a-setpoint').state, 22);
  assert.equal(ctx.state('circuit-a-temperature-room').state, 21.5);
  assert.equal(ctx.state('temperature-air-intake'), undefined, '-1.0 is not a temperature');
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
  const badge = ctx.gladys.fake.transports.at(-1);
  assert.equal(badge.transport, DEVICE_TRANSPORTS.LOCAL);
  // Only documented reads (the fake answers exception 2 otherwise), one connection, closed after.
  assert.ok(!ctx.lines.some((l) => /failed|does not serve/.test(l)), ctx.lines.join('\n'));
  assert.equal(ctx.hp.open.size, 0);
  assert.equal(ctx.hp.maxOpen, 1);
  assert.ok(ctx.hp.reads().every((r) => r.count <= 32));
});

test('a charge pump at -1 is off, not -1 %', async (t) => {
  const clock = testClock({ start: NOW });
  const hp = fakeIdm({ timers: clock.timers });
  hp.set(1104, -1);
  const ctx = await setup({ clock, hp });
  t.after(ctx.stop);
  assert.equal(ctx.state('charge-pump').state, 0);
});

test('the commands are off by default: refused, nothing written; standby still goes', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  const ack = await ctx.press('system-mode', 'away');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /Autoriser les commandes/);
  assert.equal((await ctx.press('dhw-setpoint', 50)).success, false);
  assert.equal((await ctx.press('circuit-a-setpoint', 21)).success, false);
  assert.deepEqual(ctx.hp.writes(), []);
  const stop = await ctx.press('system-mode', 'standby');
  assert.equal(stop.success, true, String(stop.error));
  assert.deepEqual(
    ctx.hp.writes().map((w) => [w.address, w.words]),
    [[1005, [0]]],
  );
  assert.equal(ctx.hp.get(1005), 0);
  const off = await ctx.press('circuit-a-mode', 'off');
  assert.equal(off.success, true, String(off.error));
  assert.equal(ctx.hp.get(1393), 0);
});

test('a mode: decided on a fresh read, written, confirmed by the read back', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  const before = ctx.hp.reads().length;
  const ack = await ctx.press('system-mode', 'away');
  assert.equal(ack.success, true, String(ack.error));
  const log = ctx.hp.log.slice(-3);
  assert.deepEqual(
    log.map((r) => [r.fc, r.address, r.count]),
    [
      [4, 1005, 1],
      [16, 1005, 1],
      [4, 1005, 1],
    ],
  );
  assert.ok(ctx.hp.reads().length > before);
  assert.equal(ctx.state('system-mode').text, 'away');
  // Holiday is shown, never written.
  const holiday = await ctx.press('system-mode', 'holiday');
  assert.equal(holiday.success, false);
  assert.match(String(holiday.error), /seulement affiché/);
});

test('hot water: bounded by the ceiling, never above 60 °C, whatever the configuration', async (t) => {
  const ctx = await setup({ config: { ...ALLOW, dhw_max_temperature: 90 } });
  t.after(ctx.stop);
  for (const value of [61, 65, 95, 34, 50.5, '', null, 'abc', '55.0.1']) {
    const ack = await ctx.press('dhw-setpoint', value, 200);
    assert.equal(ack.success, false, `${value} refused`);
  }
  assert.deepEqual(ctx.hp.writes(), []);
  const ack = await ctx.press('dhw-setpoint', 60);
  assert.equal(ack.success, true, String(ack.error));
  assert.equal(ctx.hp.get(1032), 60);
  ctx.app.configUpdated({ ...ALLOW, dhw_max_temperature: 50 });
  const capped = await ctx.press('dhw-setpoint', 52);
  assert.match(String(capped.error), /plafond/);
  assert.equal(ctx.hp.get(1032), 60);
});

test('room setpoint: 15 to 30 °C by 0.5, written as a FLOAT, low word first', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  for (const value of [14.5, 30.5, 21.3]) {
    assert.equal((await ctx.press('circuit-a-setpoint', value, 200)).success, false, `${value}`);
  }
  const ack = await ctx.press('circuit-a-setpoint', 20.5);
  assert.equal(ack.success, true, String(ack.error));
  const write = ctx.hp.writes().at(-1);
  assert.equal(write.address, 1401);
  assert.equal(write.count, 2);
  assert.equal(ctx.hp.get(1401), 20.5);
  assert.equal(ctx.state('circuit-a-setpoint').state, 20.5);
});

test('a write not applied: "sent, without confirmation", then spaced reads', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  ctx.hp.ignoreWrites = true;
  const reads = ctx.hp.reads().length;
  const ack = await ctx.press('dhw-setpoint', 50);
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /sans confirmation/);
  await ctx.advance(30 * SECOND, 100);
  assert.ok(ctx.hp.reads().length >= reads + 2 + 2 * BLOCKS.length, 'follow-up reads');
});

// --- Stops -----------------------------------------------------------------------

const writesTo = (hp, address) => hp.writes().filter((w) => w.address === address);

test('a stop takes the line from a read stuck on the heat pump', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  ctx.hp.delay = 1900;
  ctx.app.tick();
  await ctx.advance(300, 10);
  assert.equal(ctx.hp.open.size, 1, 'a read is waiting for its answer');
  ctx.hp.delay = 10;
  const ack = await ctx.press('system-mode', 'standby', 1000);
  assert.equal(ack.success, true, String(ack.error));
  assert.equal(ctx.hp.get(1005), 0);
  assert.equal(ctx.hp.maxOpen, 1, 'never two connections');
});

test('a stop is tried again while the connection is refused, within 3.5 s', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  ctx.hp.down = true;
  const ack = ctx.fire('circuit-a-mode', 'off');
  await ctx.advance(1200, 50);
  ctx.hp.down = false;
  await ctx.advance(4 * SECOND, 50);
  assert.equal((await ack).success, true, String((await ack).error));
  assert.ok(ctx.hp.refused >= 2);
  assert.equal(ctx.hp.get(1393), 0);
});

test('a stop goes during a backoff, before any successful read, without the option', async (t) => {
  const clock = testClock({ start: NOW });
  const hp = fakeIdm({ timers: clock.timers });
  hp.down = true;
  const ctx = await setup({ clock, hp, create: false });
  t.after(ctx.stop);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, false);
  hp.down = false;
  const ack = await ctx.press('system-mode', 'standby');
  assert.equal(ack.success, true, String(ack.error));
  assert.equal(hp.get(1005), 0);
});

test('a stop not confirmed: kept in /data, sent again by the reads (3 times at most)', async (t) => {
  const store = memoryStore();
  const ctx = await setup({ store });
  t.after(ctx.stop);
  ctx.hp.ignoreWrites = true;
  const ack = await ctx.press('system-mode', 'standby');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /sans confirmation/);
  assert.equal(store.data.stops.length, 1);
  assert.equal(store.data.stops[0].register, 1005);
  await ctx.advance(4 * MINUTE, 200);
  const sent = writesTo(ctx.hp, 1005).length;
  assert.ok(sent >= 2 && sent <= 4, `${sent} writes`);
  await ctx.advance(5 * MINUTE, 500);
  assert.equal(writesTo(ctx.hp, 1005).length, sent, 'not after the guard');
  assert.deepEqual(store.data.stops, []);
});

test('a stop is not sent again once someone else changed the mode on the heat pump', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  ctx.hp.ignoreWrites = true;
  await ctx.press('system-mode', 'standby');
  ctx.hp.set(1005, 4); // dhw-only, set at the NAVIGATOR
  await ctx.advance(3 * MINUTE, 200);
  assert.equal(writesTo(ctx.hp, 1005).length, 1);
});

test('a newer command that left cancels the resending of a stop', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  ctx.hp.ignoreWrites = true;
  await ctx.press('system-mode', 'standby');
  ctx.hp.ignoreWrites = false;
  const ack = await ctx.press('system-mode', 'automatic');
  assert.equal(ack.success, true, String(ack.error));
  await ctx.advance(3 * MINUTE, 200);
  assert.deepEqual(
    writesTo(ctx.hp, 1005).map((w) => w.words[0]),
    [0, 1],
  );
});

test('after a restart, a stop kept in /data goes before the configuration is read', async (t) => {
  const clock = testClock({ start: NOW });
  const hp = fakeIdm({ timers: clock.timers });
  const store = memoryStore({
    lastAttemptAt: NOW - 10 * SECOND,
    stops: [
      { host: HOST, port: 502, unitId: 1, register: 1393, until: NOW + MINUTE, reasserts: 0 },
    ],
  });
  const ctx = await setup({ clock, hp, store, boot: true, getConfigFails: 100, create: false });
  t.after(ctx.stop);
  assert.deepEqual(
    writesTo(hp, 1393).map((w) => w.words[0]),
    [0],
  );
  assert.equal(hp.get(1393), 0);
  assert.match(ctx.gladys.fake.connectionStatus.message.fr, /configuration n’a pas pu être lue/);
});

test('before the configuration is read, a stop goes to the last heat pump read', async (t) => {
  const clock = testClock({ start: NOW });
  const hp = fakeIdm({ timers: clock.timers });
  const store = memoryStore({
    lastAttemptAt: NOW,
    stops: [],
    target: { host: HOST, port: 502, unitId: 1 },
  });
  const ctx = await setup({ clock, hp, store, boot: true, getConfigFails: 100, create: false });
  t.after(ctx.stop);
  const ack = await ctx.press('system-mode', 'standby');
  assert.equal(ack.success, true, String(ack.error));
  assert.equal(hp.get(1005), 0);
});

test('a stop drops the commands that arrived before it and have not left', async (t) => {
  const ctx = await setup({ config: { ...ALLOW, circuits: 'A, B, C' } });
  t.after(ctx.stop);
  ctx.hp.delay = 300;
  const acks = [
    ctx.fire('dhw-setpoint', 50),
    ctx.fire('circuit-b-mode', 'normal'),
    ctx.fire('circuit-c-mode', 'eco'),
  ];
  await ctx.advance(350, 10);
  const stop = ctx.fire('system-mode', 'standby');
  await ctx.advance(6 * SECOND, 50);
  assert.equal((await stop).success, true, String((await stop).error));
  const order = ctx.hp.writes().map((w) => w.address);
  const at = order.indexOf(1005);
  assert.ok(at >= 0);
  assert.deepEqual(order.slice(at + 1), [], `nothing after the stop: ${order}`);
  const results = await Promise.all(acks);
  assert.ok(results.some((r) => /arrêt a été envoyé entre-temps/.test(String(r.error))));
});

// --- Commands --------------------------------------------------------------------

test('a scene setting five values on a slow heat pump sets them all', async (t) => {
  const ctx = await setup({ config: { ...ALLOW, circuits: 'A,B,C,D' } });
  t.after(ctx.stop);
  ctx.hp.delay = 700;
  for (const c of [1, 2, 3]) {
    ctx.hp.set(1393 + c, 1);
    ctx.hp.set(1401 + 2 * c, 20);
  }
  const acks = [
    ctx.fire('circuit-a-setpoint', 21),
    ctx.fire('circuit-b-setpoint', 21.5),
    ctx.fire('circuit-c-setpoint', 22),
    ctx.fire('circuit-d-setpoint', 22.5),
    ctx.fire('dhw-setpoint', 50),
  ];
  await ctx.advance(25 * SECOND, 50);
  await Promise.all(acks);
  assert.equal(ctx.hp.get(1401), 21);
  assert.equal(ctx.hp.get(1403), 21.5);
  assert.equal(ctx.hp.get(1405), 22);
  assert.equal(ctx.hp.get(1407), 22.5);
  assert.equal(ctx.hp.get(1032), 50);
  assert.equal(ctx.hp.maxOpen, 1);
});

test('EEPROM: six changes of a register an hour, then refused; a lower setpoint always goes', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  for (const value of [40, 45, 41, 46, 42, 47]) {
    const ack = await ctx.press('dhw-setpoint', value);
    assert.equal(ack.success, true, `${value}: ${ack.error}`);
  }
  const refused = await ctx.press('dhw-setpoint', 50);
  assert.match(String(refused.error), /mémoire à nombre d’écritures limité/);
  const lower = await ctx.press('dhw-setpoint', 44);
  assert.equal(lower.success, true, String(lower.error));
  await ctx.advance(61 * MINUTE, 1000);
  assert.equal((await ctx.press('dhw-setpoint', 50)).success, true);
});

test('already so: nothing written', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  const ack = await ctx.press('circuit-a-mode', 'program');
  assert.equal(ack.success, true);
  assert.deepEqual(ctx.hp.writes(), []);
});

test('the option turned off while a command waits: not written', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  ctx.hp.delay = 400;
  const ack = ctx.fire('dhw-setpoint', 50);
  await ctx.advance(200, 10);
  await ctx.app.configUpdated(CFG);
  await ctx.advance(5 * SECOND, 50);
  assert.equal((await ack).success, false);
  assert.deepEqual(ctx.hp.writes(), []);
});

// --- Reads, restarts, /data -------------------------------------------------------

test('a restart never reads sooner than the interval after the last read', async (t) => {
  const clock = testClock({ start: NOW });
  const store = memoryStore({ lastAttemptAt: NOW - 20 * SECOND, stops: [] });
  const ctx = await setup({ clock, store, create: false });
  t.after(ctx.stop);
  assert.equal(ctx.hp.reads().length, 0);
  await ctx.advance(95 * SECOND, 500);
  assert.ok(ctx.hp.reads().length > 0);
});

test('/data unreadable: never overwritten, the first read waits a whole interval', async (t) => {
  const clock = testClock({ start: NOW });
  const store = memoryStore(null, { unreadable: true });
  const ctx = await setup({ clock, store, create: false });
  t.after(ctx.stop);
  assert.equal(ctx.hp.reads().length, 0);
  await ctx.advance(61 * SECOND, 500);
  assert.ok(ctx.hp.reads().length > 0);
  assert.equal(store.saves, 0);
});

test('nothing stale republished: a reconnection to Gladys long after the last read', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  ctx.hp.down = true;
  await ctx.advance(3 * MINUTE, 1000);
  const count = ctx.gladys.fake.states.length;
  await ctx.app.connected(CFG);
  await ctx.advance(2 * SECOND, 100);
  assert.equal(ctx.gladys.fake.states.length, count);
});

test('a target refused by the heat pump does not stop the others of a scene', async (t) => {
  const ctx = await setup({ config: { ...ALLOW, circuits: 'A,B' } });
  t.after(ctx.stop);
  ctx.hp.set(1394, 1);
  ctx.hp.set(1403, 20);
  ctx.hp.exceptions.set(1401, 4);
  const acks = [
    ctx.fire('circuit-a-setpoint', 21),
    ctx.fire('circuit-b-setpoint', 21.5),
    ctx.fire('dhw-setpoint', 50),
  ];
  await ctx.advance(10 * SECOND, 50);
  const [a, b, dhw] = await Promise.all(acks);
  assert.equal(a.success, false);
  assert.equal(b.success, true, String(b.error));
  assert.equal(dhw.success, true, String(dhw.error));
  assert.equal(ctx.hp.get(1403), 21.5);
  assert.equal(ctx.hp.get(1032), 50);
});

test('a stop goes while 16 commands wait (queue full)', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  ctx.hp.delay = 500;
  const acks = [];
  for (let i = 0; i < 17; i += 1) acks.push(ctx.fire('dhw-setpoint', 40 + (i % 10)));
  await ctx.advance(200, 10);
  const stop = ctx.fire('system-mode', 'standby');
  await ctx.advance(6 * SECOND, 50);
  assert.equal((await stop).success, true, String((await stop).error));
  await ctx.advance(20 * SECOND, 100);
  await Promise.all(acks);
  const order = ctx.hp.writes().map((w) => w.address);
  assert.deepEqual(order.slice(order.indexOf(1005) + 1), [], `nothing after the stop: ${order}`);
});

test('the current value unreadable: the command is not sent', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  ctx.hp.set(1032, 0xffff);
  const ack = await ctx.press('dhw-setpoint', 50);
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /n’a pas pu être relue/);
  assert.deepEqual(ctx.hp.writes(), []);
});

test('an answer longer than a Modbus frame ends the read before it is all received', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  const original = ctx.hp.handle;
  ctx.hp.handle = (socket) => {
    socket.emit('data', Buffer.alloc(300, 1));
  };
  await ctx.advance(61 * SECOND, 500);
  ctx.hp.handle = original;
  assert.equal(ctx.gladys.fake.connectionStatus.connected, false);
  assert.ok(
    ctx.lines.some((l) => /protocol/.test(l)),
    ctx.lines.join('\n'),
  );
});

// --- Review r1 -------------------------------------------------------------------

const firstWriteAfter = (hp, from) => hp.log.slice(from).find((r) => r.fc === 16);

for (const readInFlight of [false, true]) {
  test(`r1-1 a command and a stop in the same turn (${readInFlight ? 'read in flight' : 'line idle'}): one connection, the stop first`, async (t) => {
    const ctx = await setup({ config: ALLOW });
    t.after(ctx.stop);
    ctx.hp.delay = 30;
    if (readInFlight) {
      ctx.app.tick();
      await ctx.advance(20, 5);
    }
    const from = ctx.hp.log.length;
    const acks = [
      ctx.fire('dhw-setpoint', 50),
      ctx.fire('system-mode', 'standby'),
      ctx.fire('dhw-setpoint', 52),
    ];
    await ctx.advance(6 * SECOND, 20);
    const [before, stop, after] = await Promise.all(acks);
    assert.equal(stop.success, true, String(stop.error));
    assert.equal(ctx.hp.maxOpen, 1, 'never two connections');
    assert.equal(firstWriteAfter(ctx.hp, from).address, 1005, 'the stop is written first');
    assert.equal(before.success, false, 'the command before the stop is dropped');
    assert.equal(after.success, true, String(after.error));
    assert.equal(ctx.hp.get(1005), 0);
    assert.equal(ctx.hp.get(1032), 52);
  });
}

test('r1-1 a single-client slow heat pump: the stop goes within 3.5 s, before newer commands', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  ctx.hp.singleClient = true;
  ctx.hp.delay = 900;
  const from = ctx.hp.log.length;
  const acks = [
    ctx.fire('dhw-setpoint', 50),
    ctx.fire('system-mode', 'standby'),
    ctx.fire('dhw-setpoint', 52),
    ctx.fire('circuit-a-setpoint', 21),
  ];
  await ctx.advance(3500, 20);
  assert.equal(ctx.hp.get(1005), 0, 'stopped within 3.5 s');
  assert.equal(firstWriteAfter(ctx.hp, from).address, 1005);
  await ctx.advance(30 * SECOND, 50);
  await Promise.all(acks);
  assert.equal(ctx.hp.refused, 0, 'never a second connection');
});

for (const interval of [300, 3600]) {
  test(`r1-2 a stop that could not leave is tried again within 20 s (interval ${interval} s)`, async (t) => {
    const ctx = await setup({ config: { host: HOST, poll_interval: interval } });
    t.after(ctx.stop);
    ctx.hp.down = true;
    const ack = ctx.fire('system-mode', 'standby');
    await ctx.advance(5 * SECOND, 50);
    assert.equal((await ack).success, false);
    ctx.hp.down = false;
    await ctx.advance(16 * SECOND, 100);
    assert.equal(ctx.hp.get(1005), 0);
    assert.equal(writesTo(ctx.hp, 1005).length, 1);
  });

  test(`r1-2 a stop written, not applied, is sent again by the checks (interval ${interval} s)`, async (t) => {
    const ctx = await setup({ config: { host: HOST, poll_interval: interval } });
    t.after(ctx.stop);
    ctx.hp.ignoreWrites = true;
    await ctx.press('circuit-a-mode', 'off');
    await ctx.advance(40 * SECOND, 200);
    assert.ok(writesTo(ctx.hp, 1393).length >= 2, 'sent again');
    await ctx.advance(5 * MINUTE, 500);
    assert.ok(writesTo(ctx.hp, 1393).length <= 4, 'three times at most');
  });
}

test('r1-3 after a restart, a value set at the panel meanwhile is never overridden', async (t) => {
  const clock = testClock({ start: NOW });
  const hp = fakeIdm({ timers: clock.timers });
  hp.set(1005, 4); // hot water only, set at the NAVIGATOR after the stop
  const store = memoryStore({
    lastAttemptAt: NOW - 10 * SECOND,
    stops: [
      {
        host: HOST,
        port: 502,
        unitId: 1,
        register: 1005,
        until: NOW + MINUTE,
        reasserts: 1,
        written: true,
        before: ['automatic'],
      },
    ],
  });
  const ctx = await setup({ clock, hp, store, boot: true, create: false });
  t.after(ctx.stop);
  await ctx.advance(2 * MINUTE, 500);
  assert.deepEqual(writesTo(hp, 1005), []);
  assert.deepEqual(store.data.stops, []);
});

test('r1-3 a stop clicked before any value is known: a later change at the panel ends it', async (t) => {
  const clock = testClock({ start: NOW });
  const hp = fakeIdm({ timers: clock.timers });
  const store = memoryStore({
    lastAttemptAt: NOW - 10 * SECOND,
    stops: [
      {
        host: HOST,
        port: 502,
        unitId: 1,
        register: 1005,
        until: NOW + 2 * MINUTE,
        reasserts: 0,
        written: true,
        before: [],
      },
    ],
  });
  hp.ignoreWrites = true;
  const ctx = await setup({ clock, hp, store, boot: true, create: false });
  t.after(ctx.stop);
  assert.equal(writesTo(hp, 1005).length, 1, 'sent again at the start');
  hp.set(1005, 4);
  await ctx.advance(2 * MINUTE, 500);
  assert.equal(writesTo(hp, 1005).length, 1, 'never over the panel');
});

test('r1-4 a value read while Gladys was unreachable is not published 10 minutes later', async (t) => {
  const ctx = await setup({ config: { host: HOST, poll_interval: 600 } });
  t.after(ctx.stop);
  const publish = ctx.gladys.publishChangedStates.bind(ctx.gladys);
  let down = true;
  ctx.gladys.publishChangedStates = async (...args) => {
    if (down) throw new Error('Gladys unreachable');
    return publish(...args);
  };
  ctx.hp.set(1000, 12.3);
  // Read at 10 min (the interval) while Gladys is unreachable; Gladys back at 13 min.
  await ctx.advance(13 * MINUTE, 1000);
  ctx.hp.down = true;
  down = false;
  await ctx.advance(5 * SECOND, 100);
  assert.notEqual(ctx.state('temperature-outdoor').state, 12.3);
});

test('r1-5 the hot water ceiling lowered while a command waits: not written', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  ctx.hp.delay = 400;
  const ack = ctx.fire('dhw-setpoint', 54);
  await ctx.advance(200, 10);
  await ctx.app.configUpdated({ ...ALLOW, dhw_max_temperature: 50 });
  await ctx.advance(5 * SECOND, 50);
  assert.match(String((await ack).error), /plafond/);
  assert.deepEqual(ctx.hp.writes(), []);
});

test('r1-5 the time of a read is in /data before the read', async (t) => {
  const store = memoryStore();
  const ctx = await setup({ store, create: false });
  t.after(ctx.stop);
  const first = store.data.lastAttemptAt;
  ctx.hp.silent.add(1000);
  for (let i = 0; i < 700 && ctx.hp.open.size === 0; i += 1) await ctx.advance(100, 100);
  assert.equal(ctx.hp.open.size, 1, 'the next read is waiting for its answer');
  assert.ok(store.data.lastAttemptAt > first, 'already in /data');
});

test('r1-5 an old read is not republished at connected, the heat pump online', async (t) => {
  const ctx = await setup({ config: { host: HOST, poll_interval: 600 } });
  t.after(ctx.stop);
  await ctx.advance(3 * MINUTE, 1000);
  const count = ctx.gladys.fake.states.length;
  await ctx.app.connected({ host: HOST, poll_interval: 600 });
  await ctx.app.deviceCreated(ctx.gladys.fake.discoveredDevices[0]);
  await ctx.advance(2 * SECOND, 100);
  assert.equal(ctx.gladys.fake.states.length, count);
});

for (const role of ['dhw-setpoint', 'system-mode']) {
  test(`r1-5 a write answered by something else than its echo is not confirmed (${role})`, async (t) => {
    const ctx = await setup({ config: ALLOW });
    t.after(ctx.stop);
    ctx.hp.badEcho = true;
    const ack = await ctx.press(role, role === 'dhw-setpoint' ? 50 : 'standby');
    assert.equal(ack.success, false);
    assert.match(String(ack.error), /sans confirmation/);
  });
}

for (const flag of ['wrongTransaction', 'wrongUnit']) {
  test(`r1-5 an answer to another request (${flag}) is never taken`, async (t) => {
    const clock = testClock({ start: NOW });
    const hp = fakeIdm({ timers: clock.timers });
    hp[flag] = true;
    const ctx = await setup({ clock, hp, create: false });
    t.after(ctx.stop);
    assert.equal(ctx.gladys.fake.discoveredDevices.length, 0);
    assert.equal(ctx.gladys.fake.connectionStatus.connected, false);
  });
}

// --- Review r2 -------------------------------------------------------------------

/** Advances until `cond()` holds (10 ms steps), at most `max` ms. */
async function until(ctx, cond, max = 60 * SECOND) {
  for (let e = 0; e < max && !cond(); e += 10) await ctx.advance(10, 10);
  assert.ok(cond(), 'condition reached');
}

const checkRunning = (ctx, register) =>
  ctx.app.checking === register && ctx.app.active?.kind === 'check';

for (const kase of ['panel value', 'resends used up']) {
  test(`r2-1 a click during a running check is written and read back (${kase})`, async (t) => {
    const ctx = await setup();
    t.after(ctx.stop);
    ctx.hp.ignoreWrites = true;
    await ctx.press('system-mode', 'standby');
    if (kase === 'panel value') ctx.hp.set(1005, 4);
    else ctx.app.stopGuards.get(1005).reasserts = 3;
    ctx.hp.delay = 1000;
    await until(ctx, () => checkRunning(ctx, 1005));
    ctx.hp.ignoreWrites = false;
    const from = ctx.hp.log.length;
    const ack = ctx.fire('system-mode', 'standby');
    await ctx.advance(4 * SECOND, 20);
    assert.equal((await ack).success, true, String((await ack).error));
    const after = ctx.hp.log.slice(from);
    assert.ok(
      after.some((r) => r.fc === 16 && r.address === 1005),
      'written',
    );
    assert.ok(
      after.some((r) => r.fc === 4 && r.address === 1005),
      'read back',
    );
    assert.equal(ctx.hp.get(1005), 0);
  });
}

test('r2-2 a check never interrupts a newer command, nor sends the stop over it', async (t) => {
  const ctx = await setup({ config: ALLOW });
  t.after(ctx.stop);
  ctx.hp.ignoreWrites = true;
  await ctx.press('system-mode', 'standby');
  ctx.hp.ignoreWrites = false;
  ctx.hp.delay = 900;
  // The command arrives 1 s before the next check (15 s after the stop).
  await ctx.advance(9 * SECOND, 50);
  const ack = ctx.fire('system-mode', 'automatic');
  await ctx.advance(6 * SECOND, 50);
  assert.equal((await ack).success, true, String((await ack).error));
  await ctx.advance(3 * MINUTE, 500);
  assert.deepEqual(
    writesTo(ctx.hp, 1005).map((w) => w.words[0]),
    [0, 1],
  );
  assert.equal(ctx.hp.get(1005), 1);
});

test('r2-3 a click never waits behind the check of another stop', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  ctx.hp.ignoreWrites = true;
  await ctx.press('circuit-a-mode', 'off');
  ctx.hp.ignoreWrites = false;
  ctx.hp.delay = 1400;
  await until(ctx, () => checkRunning(ctx, 1393));
  const from = ctx.hp.log.length;
  const ack = ctx.fire('system-mode', 'standby');
  await ctx.advance(100, 10);
  assert.ok(
    ctx.hp.log.slice(from).some((r) => r.fc === 16 && r.address === 1005),
    'written at once',
  );
  await ctx.advance(4 * SECOND, 50);
  assert.equal((await ack).success, true, String((await ack).error));
});

test('r2-4 a stop ends a session still closing at once', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  ctx.hp.closeDelay = 2000;
  const ends = ctx.hp.ends;
  ctx.app.tick();
  await until(ctx, () => ctx.hp.ends > ends);
  const from = ctx.hp.log.length;
  ctx.fire('system-mode', 'standby');
  await ctx.advance(100, 10);
  assert.ok(ctx.hp.log.slice(from).some((r) => r.fc === 16 && r.address === 1005));
  assert.equal(ctx.hp.maxOpen, 1);
});

test('r2-5 a stop not applied is sent again only 20 s after it was written', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  ctx.hp.ignoreWrites = true;
  ctx.fire('system-mode', 'standby');
  await ctx.advance(29 * SECOND, 100);
  assert.equal(writesTo(ctx.hp, 1005).length, 1, 'not at the 15 s check');
  await ctx.advance(6 * SECOND, 100);
  assert.equal(writesTo(ctx.hp, 1005).length, 2, 'at the 30 s check');
});

test('r2-5 sessions end gracefully (FIN, then the heat pump closes)', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  assert.ok(ctx.hp.ends > 0);
  assert.equal(ctx.hp.clientDestroys, 0);
});

test('r2-5 a stop is answered at 3.5 s on a heat pump that answers late', async (t) => {
  const ctx = await setup();
  t.after(ctx.stop);
  // Written at 1.9 s, read back at 3.8 s: the answer cannot wait for it.
  ctx.hp.delay = 1900;
  const start = ctx.clock.elapsed;
  let at;
  ctx.fire('system-mode', 'standby').then(() => {
    at = ctx.clock.elapsed - start;
  });
  await until(ctx, () => at !== undefined, 10 * SECOND);
  assert.ok(at >= 3400 && at <= 3600, `${at} ms`);
});

test('r2-5 a stop is tried for 3 s, not longer', async (t) => {
  const ctx = await setup({ config: { host: HOST, poll_interval: 3600 } });
  t.after(ctx.stop);
  ctx.hp.now = () => ctx.clock.elapsed;
  ctx.hp.down = true;
  const start = ctx.clock.elapsed;
  ctx.fire('system-mode', 'standby');
  await ctx.advance(10 * SECOND, 50);
  const tries = ctx.hp.connectAt.map((x) => x - start).filter((x) => x < 10 * SECOND);
  assert.ok(tries.length >= 5, `${tries.length} tries`);
  assert.ok(Math.max(...tries) >= 2500 && Math.max(...tries) <= 3000, `${tries.at(-1)} ms`);
});
