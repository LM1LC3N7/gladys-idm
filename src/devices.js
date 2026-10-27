// -----------------------------------------------------------------------------
// The heat pump -> one Gladys device, its features, its commands and its
// states (pure).
//
// `ext:<selector>:idm:heatpump`: one device per integration. FROZEN RULE: the
// Modbus map of the NAVIGATOR gives no serial number, so the device is keyed
// by the integration, never by its IP address (a new address keeps the device
// and its history). The feature roles (the last part of their external ids)
// are published forever: never rename them. A heating circuit's roles are
// `circuit-<a..g>-<suffix>`.
//
// Features built: the commands and the main states always; a sensor once a
// value of it was read (an iDM without solar never shows solar features), or
// when the created device already has it (a republished device never loses a
// feature).
//
// No switch, no writable binary: a "turn everything off" (Google Home, Alexa,
// HomeKit, MCP, `switch.*` scenes) never reaches the heat pump. The commands
// are `text/select` features (system mode, circuit modes) and target
// temperatures (hot water, room setpoint of a circuit).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import {
  BOUNDS,
  CIRCUITS,
  CIRCUIT_FEATURES as CF,
  CIRCUIT_MODES,
  DHW_CAP,
  FEATURES as F,
  SYSTEM_MODES,
  circuitRole,
} from './constants.js';
import {
  CIRCUIT_MODE_NAMES,
  DEVICE_NAME,
  FEATURE_NAMES,
  SYSTEM_MODE_NAMES,
  circuitFeatureName,
  word,
} from './i18n.js';

export const SERVICE = 'idm';
export const PLATFORM_ID = 'heatpump';

const sensor = (definition) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...definition,
});
const binary = sensor({ category: C.UNKNOWN, type: T.SENSOR.BINARY, min: 0, max: 1 });
const text = sensor({ category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0, keep_history: false });
const temperature = sensor({
  category: C.TEMPERATURE_SENSOR,
  type: T.SENSOR.DECIMAL,
  unit: U.CELSIUS,
  min: -50,
  max: 120,
});
const select = {
  category: C.TEXT,
  type: T.TEXT.SELECT,
  min: 0,
  max: 0,
  read_only: false,
  has_feedback: true,
  keep_history: false,
};

/** The device features (not per circuit), by role, in display order; `value`: the key read. */
const DEVICE_FEATURES = [
  [F.SYSTEM_MODE, select, 'systemMode', true],
  [F.OPERATING_STATE, text, 'operatingState', true],
  [F.FAULT, binary, 'fault', true],
  [F.COMPRESSOR, binary, 'compressor', true],
  [F.CHARGE_PUMP, binary, 'chargePump'],
  [F.TEMP_OUTDOOR, temperature, 'outdoor'],
  [F.TEMP_OUTDOOR_AVERAGE, temperature, 'outdoorAverage'],
  [F.TEMP_FLOW, temperature, 'flow'],
  [F.TEMP_RETURN, temperature, 'return'],
  [F.TEMP_SOURCE_IN, temperature, 'sourceIn'],
  [F.TEMP_SOURCE_OUT, temperature, 'sourceOut'],
  [F.TEMP_AIR_INTAKE, temperature, 'airIntake'],
  [F.TEMP_HEAT_STORAGE, temperature, 'heatStorage'],
  [F.TEMP_DHW_TOP, temperature, 'dhwTop'],
  [F.TEMP_DHW_BOTTOM, temperature, 'dhwBottom'],
  [F.TEMP_DHW_TAP, temperature, 'dhwTap'],
  [
    F.DHW_SETPOINT,
    {
      category: C.WATER_HEATER,
      type: T.WATER_HEATER.TARGET_TEMPERATURE,
      unit: U.CELSIUS,
      min: BOUNDS.dhwSetpoint.min,
      max: DHW_CAP.max,
      read_only: false,
      has_feedback: true,
      keep_history: true,
    },
    'dhwSetpoint',
    true,
  ],
  [
    F.HUMIDITY,
    sensor({
      category: C.HUMIDITY_SENSOR,
      type: T.SENSOR.DECIMAL,
      unit: U.PERCENT,
      min: 0,
      max: 100,
    }),
    'humidity',
  ],
  [
    F.POWER,
    sensor({
      category: C.ENERGY_SENSOR,
      type: T.ENERGY_SENSOR.POWER,
      unit: U.KILOWATT,
      min: 0,
      max: 100,
    }),
    'power',
  ],
  [F.TEMP_SOLAR_COLLECTOR, temperature, 'solarCollector'],
  [F.TEMP_SOLAR_COLLECTOR_RETURN, temperature, 'solarCollectorReturn'],
  [F.TEMP_SOLAR_CHARGE, temperature, 'solarCharge'],
];

/** The features of a heating circuit, by suffix; `always`: built for a configured circuit. */
const CIRCUIT_DEFS = [
  [CF.MODE, select, 'mode', true],
  [CF.ACTIVE, text, 'active', true],
  [
    CF.SETPOINT,
    {
      category: C.THERMOSTAT,
      type: T.THERMOSTAT.TARGET_TEMPERATURE,
      unit: U.CELSIUS,
      min: BOUNDS.roomSetpoint.min,
      max: BOUNDS.roomSetpoint.max,
      read_only: false,
      has_feedback: true,
      keep_history: true,
    },
    'setpoint',
    true,
  ],
  [CF.TEMP_ROOM, temperature, 'room'],
  [CF.TEMP_FLOW, temperature, 'flow'],
  [CF.TEMP_FLOW_TARGET, temperature, 'flowTarget'],
];

/** Every known role: { definition, value key, always, circuit?, suffix? }, in display order. */
export const ROLES = new Map([
  ...DEVICE_FEATURES.map(([role, definition, value, always = false]) => [
    role,
    { definition, value, always },
  ]),
  ...CIRCUITS.flatMap((circuit) =>
    CIRCUIT_DEFS.map(([suffix, definition, value, always = false]) => [
      circuitRole(circuit, suffix),
      { definition, value: `circuit.${circuit}.${value}`, always, circuit, suffix },
    ]),
  ),
]);

export const ids = (gladys) => gladys.externalIds(SERVICE, PLATFORM_ID);

/** The role of one of our feature external ids, else undefined. */
export function parseFeatureId(externalId) {
  if (typeof externalId !== 'string') return undefined;
  const match = new RegExp(`:${SERVICE}:${PLATFORM_ID}:([a-z0-9-]+)$`).exec(externalId);
  return match && ROLES.has(match[1]) ? match[1] : undefined;
}

/**
 * The commands, by role: the data point written (address, type), the value
 * key read back, and either the choices of a select (`values`, with
 * `protective` the choice that stops) or the bounds of a setpoint.
 */
export function commandOf(role) {
  if (role === F.SYSTEM_MODE) {
    return {
      kind: 'select',
      address: 1005,
      type: 'uchar',
      read: 'systemMode',
      table: SYSTEM_MODES,
      writable: ['standby', 'automatic', 'away', 'dhw-only', 'heating-cooling-only'],
      protective: 'standby',
    };
  }
  if (role === F.DHW_SETPOINT) {
    return { kind: 'dhw', address: 1032, type: 'uchar', read: 'dhwSetpoint' };
  }
  const entry = ROLES.get(role);
  if (!entry?.circuit) return undefined;
  const index = CIRCUITS.indexOf(entry.circuit);
  if (entry.suffix === CF.MODE) {
    return {
      kind: 'select',
      circuit: entry.circuit,
      address: 1393 + index,
      type: 'uchar',
      read: entry.value,
      table: CIRCUIT_MODES,
      writable: Object.values(CIRCUIT_MODES),
      protective: 'off',
    };
  }
  if (entry.suffix === CF.SETPOINT) {
    return {
      kind: 'room',
      circuit: entry.circuit,
      address: 1401 + index * 2,
      type: 'float',
      read: entry.value,
    };
  }
  return undefined;
}

const OPTIONS = {
  [F.SYSTEM_MODE]: [SYSTEM_MODES, SYSTEM_MODE_NAMES],
  mode: [CIRCUIT_MODES, CIRCUIT_MODE_NAMES],
};

function nameOf(role, language) {
  const entry = ROLES.get(role);
  return word(
    entry.circuit ? circuitFeatureName(entry.circuit, entry.suffix) : FEATURE_NAMES[role],
    language,
  );
}

/**
 * The roles the device shows: the `always` ones (of the configured circuits),
 * those seen with a value in this run, and those of the created device.
 */
export function rolesToBuild({ circuits, seen = new Set(), created = new Set() }) {
  const roles = [];
  for (const [role, entry] of ROLES) {
    const configured = !entry.circuit || circuits.includes(entry.circuit);
    if ((entry.always && configured) || seen.has(role) || created.has(role)) {
      roles.push(role);
    }
  }
  return roles;
}

/** The Gladys device of the heat pump. */
export function buildDevice(gladys, { language, roles }) {
  const i = ids(gladys);
  return {
    name: word(DEVICE_NAME, language),
    external_id: i.device,
    model: 'iDM NAVIGATOR 2.0',
    should_poll: false,
    features: roles.map((role) => {
      const entry = ROLES.get(role);
      const options = OPTIONS[role] ?? (entry.suffix === CF.MODE ? OPTIONS.mode : undefined);
      return {
        name: nameOf(role, language),
        external_id: i.feature(role),
        ...entry.definition,
        ...(options
          ? {
              supported_options: Object.values(options[0]).map((value, index) => ({
                value,
                label: word(options[1][value], language),
                sort_order: index,
              })),
            }
          : {}),
      };
    }),
    params: [{ name: 'protocol', value: 'Modbus TCP' }],
  };
}

/** The roles a set of values gives a value to. */
export function rolesWithValues(values) {
  const roles = [];
  for (const [role, entry] of ROLES) {
    if (values[entry.value] !== undefined) roles.push(role);
  }
  return roles;
}

/**
 * The states of the values given (a value not read this time is left out:
 * Gladys keeps its last one, never republished as new). Texts are stable
 * English keys, whatever the language (scenes keep working). Numbers are
 * those `interpret` found plausible (src/model.js).
 */
export function deviceStates(i, values) {
  const states = [];
  for (const [role, entry] of ROLES) {
    const value = values[entry.value];
    if (value === undefined) continue;
    const id = i.feature(role);
    if (entry.definition.category === C.TEXT) {
      if (typeof value === 'string') states.push({ device_feature_external_id: id, text: value });
    } else if (Number.isFinite(value)) {
      states.push({ device_feature_external_id: id, state: value });
    }
  }
  return states;
}
