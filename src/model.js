// -----------------------------------------------------------------------------
// What the raw values of a poll mean (pure): plausibility ranges, the special
// values of the NAVIGATOR that are not measures, the texts of the modes.
//
// Special values (lesson 17 of the earlier lots: never published as measures):
//   - FLOAT -1.0: "not available" (sensor absent, circuit or solar not
//     installed, iDM hacs-idm-heatpump and idm-heatpump-api alike), except on
//     the outdoor and heat pump flow/return temperatures, always fitted, where
//     -1.0 °C is a real temperature;
//   - UCHAR 0xFFFF: "not available" (protocol.js already drops it);
//   - WORD -1 on the charge pump: the pump is off (a state, not a speed).
// A value outside its plausible range is unknown, never published.
// -----------------------------------------------------------------------------

import {
  CIRCUITS,
  CIRCUIT_ACTIVE,
  CIRCUIT_MODES,
  LIMITS,
  OPERATING_BITS,
  SYSTEM_MODES,
} from './constants.js';

const within = (value, [min, max]) =>
  Number.isFinite(value) && value >= min && value <= max ? value : undefined;

/** Keys whose -1.0 is a real temperature (sensors every NAVIGATOR has). */
const ALWAYS_FITTED = new Set(['outdoor', 'outdoorAverage', 'flow', 'return']);

const TEMPERATURES = [
  'outdoor',
  'outdoorAverage',
  'heatStorage',
  'dhwBottom',
  'dhwTop',
  'dhwTap',
  'flow',
  'return',
  'sourceIn',
  'sourceOut',
  'airIntake',
  'solarCollector',
  'solarCollectorReturn',
  'solarCharge',
];

function temperature(raw, key) {
  const value = raw[key];
  if (value === -1 && !ALWAYS_FITTED.has(key)) return undefined;
  const t = within(value, LIMITS.temperature);
  return t === undefined ? undefined : Math.round(t * 10) / 10;
}

const lookup = (table, value) =>
  Number.isInteger(value) && Object.hasOwn(table, value) ? table[value] : undefined;

/** Register 1090: the bits set, as stable keys ("standby" when none). */
export function operatingState(value) {
  if (!Number.isInteger(value) || value < 0 || value > 15) return undefined;
  if (value === 0) return 'standby';
  return OPERATING_BITS.filter(([bit]) => (value & bit) !== 0)
    .map(([, key]) => key)
    .join('+');
}

const flag = (value) => (value === 0 || value === 1 ? value : undefined);

/** Any compressor running: 1; all four known and off: 0; else the known ones. */
function compressor(raw) {
  const flags = [1, 2, 3, 4].map((n) => flag(raw[`compressor${n}`]));
  if (flags.includes(1)) return 1;
  return flags[0] === 0 ? 0 : undefined;
}

/** Charge pump (WORD 1104): -1 off, 0-100 running at some speed. */
function pumpRunning(value) {
  if (value === -1) return 0;
  return Number.isInteger(value) && value >= 0 && value <= 100 ? 1 : undefined;
}

/**
 * The values of a poll, by key: only those known this time. `raw`: what the
 * blocks gave (src/modbus/protocol.js decodeBlock), keyed alike.
 */
export function interpret(raw) {
  const values = {};
  const put = (key, value) => {
    if (value !== undefined) values[key] = value;
  };
  for (const key of TEMPERATURES) put(key, temperature(raw, key));
  put('systemMode', lookup(SYSTEM_MODES, raw.systemMode));
  put('dhwSetpoint', within(raw.dhwSetpoint, [5, 95]));
  put('operatingState', operatingState(raw.operating));
  put('fault', flag(raw.fault));
  put('compressor', compressor(raw));
  put('chargePump', pumpRunning(raw.chargePump));
  put('humidity', raw.humidity === -1 ? undefined : within(raw.humidity, [0, 100]));
  if (raw.power !== -1) {
    const power = within(raw.power, LIMITS.powerKw);
    put('power', power === undefined ? undefined : Math.round(power * 100) / 100);
  }
  for (const c of CIRCUITS) {
    const at = (key) => raw[`circuit.${c}.${key}`];
    put(`circuit.${c}.mode`, lookup(CIRCUIT_MODES, at('mode')));
    put(`circuit.${c}.active`, lookup(CIRCUIT_ACTIVE, at('active')));
    const setpoint = within(at('setpoint'), [5, 40]);
    put(
      `circuit.${c}.setpoint`,
      setpoint === undefined ? undefined : Math.round(setpoint * 10) / 10,
    );
    for (const key of ['flow', 'room', 'flowTarget']) {
      const value = at(key);
      const t = value === -1 ? undefined : within(value, LIMITS.temperature);
      put(`circuit.${c}.${key}`, t === undefined ? undefined : Math.round(t * 10) / 10);
    }
  }
  return values;
}
