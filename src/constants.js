// -----------------------------------------------------------------------------
// iDM constants: the Modbus TCP map of the NAVIGATOR 2.0 controller, manifest
// keys, feature roles, limits and timings.
//
// The NAVIGATOR answers Modbus TCP on port 502, unit id 1, without
// authentication, once "Modbus TCP" is set to "On" in its "Building
// management" menu (installer level). The registers are those of iDM's own
// documentation "MODBUS TCP NAVIGATOR 10" (812663 Rev.0, table of 2025-06-18,
// software NAV10_20.23), cross-checked with hacs-idm-heatpump v0.14.0 (MIT),
// written for the NAVIGATOR 2.0: only addresses that both give alike are used
// (see TODO.md "Decisions"). Only these requests are ever sent:
//   - read input registers (function 4) of the blocks below, each block a run
//     of documented data points, each starting where the previous one ends
//     (the NAVIGATOR answers a data point at its documented start address and
//     size: a read across a hole or into the middle of a FLOAT is never sent);
//   - write multiple registers (function 16) at 1005 (system mode), 1032 (hot
//     water setpoint), 1393-1399 (heating circuit mode) and 1401-1413 (room
//     setpoint "normal" of a heating circuit), one data point per request.
// Every written register is kept in EEPROM by the NAVIGATOR (300,000 write
// cycles): the writes are counted (LIMITS.eepromWritesPerHour).
//
// Data types (iDM, chapter 4.2): FLOAT = IEEE 754 on two registers, low word
// first; UCHAR = one register (0xFFFF: "not available"); WORD = one signed
// register (pumps: -1 = off).
// -----------------------------------------------------------------------------

export const DEFAULT_PORT = 502;

/** Modbus function codes used (nothing else is ever sent). */
export const FC = {
  READ_INPUT: 0x04,
  WRITE_MULTIPLE: 0x10,
};

/** The MBAP header (7 bytes) and the largest frame Modbus TCP allows (260 bytes). */
export const MBAP_SIZE = 7;
export const MAX_FRAME = 260;

/** Heating circuits A to G (iDM: "Heizkreis A" ... "G"). */
export const CIRCUITS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

/**
 * The blocks read at each poll, in this order. `points`: the data points of
 * the block, `[address, type, key]`, contiguous (checked by the tests).
 * `core`: a Modbus exception on it fails the poll; otherwise an "illegal data
 * address" on a block never answered means the controller does not have it
 * (not read again until a restart), any other exception leaves its values
 * unknown this time. Circuit blocks are built for the configured circuits
 * (src/protocol.js circuitBlocks).
 */
export const BLOCKS = [
  {
    key: 'system',
    core: true,
    points: [
      [1000, 'float', 'outdoor'],
      [1002, 'float', 'outdoorAverage'],
      [1004, 'uchar', 'message'],
      [1005, 'uchar', 'systemMode'],
    ],
  },
  {
    key: 'storage',
    points: [
      [1008, 'float', 'heatStorage'],
      [1010, 'float', 'coldStorage'],
      [1012, 'float', 'dhwBottom'],
      [1014, 'float', 'dhwTop'],
    ],
  },
  {
    key: 'dhw',
    core: true,
    points: [
      [1030, 'float', 'dhwTap'],
      [1032, 'uchar', 'dhwSetpoint'],
    ],
  },
  {
    key: 'heatpump',
    core: true,
    points: [
      [1050, 'float', 'flow'],
      [1052, 'float', 'return'],
      [1054, 'float', 'hotGas'],
      [1056, 'float', 'sourceIn'],
      [1058, 'float', 'sourceOut'],
      [1060, 'float', 'airIntake'],
    ],
  },
  { key: 'state', core: true, points: [[1090, 'uchar', 'operating']] },
  {
    key: 'outputs',
    core: true,
    points: [
      [1099, 'uchar', 'fault'],
      [1100, 'uchar', 'compressor1'],
      [1101, 'uchar', 'compressor2'],
      [1102, 'uchar', 'compressor3'],
      [1103, 'uchar', 'compressor4'],
      [1104, 'word', 'chargePump'],
    ],
  },
  { key: 'humidity', points: [[1392, 'float', 'humidity']] },
  {
    key: 'solar',
    points: [
      [1850, 'float', 'solarCollector'],
      [1852, 'float', 'solarCollectorReturn'],
      [1854, 'float', 'solarCharge'],
    ],
  },
  { key: 'power', points: [[4122, 'float', 'power']] },
];

/**
 * The per-circuit data points: base address, step between two circuits,
 * type, key. A circuit block reads the run A..last configured circuit.
 */
export const CIRCUIT_POINTS = [
  { key: 'flow', base: 1350, step: 2, type: 'float' },
  { key: 'room', base: 1364, step: 2, type: 'float' },
  { key: 'flowTarget', base: 1378, step: 2, type: 'float' },
  { key: 'mode', base: 1393, step: 1, type: 'uchar', core: true },
  { key: 'setpoint', base: 1401, step: 2, type: 'float', core: true },
  { key: 'active', base: 1498, step: 1, type: 'uchar' },
];

/** Register 1005, the system mode (iDM "Betriebsart System", SYSMODE). */
export const SYSTEM_MODES = {
  0: 'standby',
  1: 'automatic',
  2: 'away',
  // Holiday: read on some NAVIGATOR 2.0 (hacs-idm-heatpump), absent from the
  // NAVIGATOR 10 table: shown, never written.
  3: 'holiday',
  4: 'dhw-only',
  5: 'heating-cooling-only',
};

/** Registers 1393-1399, the mode of a heating circuit (HKx01). */
export const CIRCUIT_MODES = {
  0: 'off',
  1: 'program',
  2: 'normal',
  3: 'eco',
  4: 'manual-heating',
  5: 'manual-cooling',
};

/** Registers 1498-1504, what a heating circuit does now. */
export const CIRCUIT_ACTIVE = { 0: 'off', 1: 'heating', 2: 'cooling' };

/** Register 1090, the operating state of the heat pump (bits). */
export const OPERATING_BITS = [
  [1, 'heating'],
  [2, 'cooling'],
  [4, 'dhw'],
  [8, 'defrost'],
];

/**
 * Modbus exception codes that mean the request was not applied (illegal
 * function, address, value). Any other code (4 device failure, 5 acknowledge,
 * 6 busy…) may come from a write applied anyway: "sent, without confirmation".
 */
export const NOT_APPLIED_EXCEPTIONS = new Set([1, 2, 3]);

/** Modbus exception code 2: the register is not served by this controller. */
export const ILLEGAL_DATA_ADDRESS = 2;

/** Feature roles (the last part of the feature external ids): frozen. */
export const FEATURES = {
  SYSTEM_MODE: 'system-mode',
  OPERATING_STATE: 'operating-state',
  FAULT: 'fault',
  COMPRESSOR: 'compressor',
  CHARGE_PUMP: 'charge-pump',
  TEMP_OUTDOOR: 'temperature-outdoor',
  TEMP_OUTDOOR_AVERAGE: 'temperature-outdoor-average',
  TEMP_FLOW: 'temperature-flow',
  TEMP_RETURN: 'temperature-return',
  TEMP_SOURCE_IN: 'temperature-source-in',
  TEMP_SOURCE_OUT: 'temperature-source-out',
  TEMP_AIR_INTAKE: 'temperature-air-intake',
  TEMP_HEAT_STORAGE: 'temperature-heat-storage',
  TEMP_DHW_TOP: 'temperature-dhw-top',
  TEMP_DHW_BOTTOM: 'temperature-dhw-bottom',
  TEMP_DHW_TAP: 'temperature-dhw-tap',
  DHW_SETPOINT: 'dhw-setpoint',
  HUMIDITY: 'humidity',
  POWER: 'power',
  TEMP_SOLAR_COLLECTOR: 'temperature-solar-collector',
  TEMP_SOLAR_COLLECTOR_RETURN: 'temperature-solar-collector-return',
  TEMP_SOLAR_CHARGE: 'temperature-solar-charge',
};

/** The roles of a heating circuit: `circuit-<x>-<suffix>`. */
export const CIRCUIT_FEATURES = {
  MODE: 'mode',
  ACTIVE: 'active',
  SETPOINT: 'setpoint',
  TEMP_FLOW: 'temperature-flow',
  TEMP_FLOW_TARGET: 'temperature-flow-target',
  TEMP_ROOM: 'temperature-room',
};

export const circuitRole = (circuit, suffix) => `circuit-${circuit}-${suffix}`;

/**
 * The bounds of the values written, from the iDM table (min, max), never
 * wider: the hot water setpoint 35-95 °C in the table is capped at 65 °C here
 * (DHW_CAP), whatever the configuration or the controller would accept.
 */
export const BOUNDS = {
  dhwSetpoint: { min: 35, max: 95 },
  roomSetpoint: { min: 15, max: 30, step: 0.5 },
};

/** The hot water ceiling of the configuration, in °C: never above 65 °C. */
export const DHW_CAP = { min: 35, max: 65, default: 65 };

export const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
};

/** The poll interval of the configuration, in seconds (iDM's examples: 60 s). */
export const POLL_INTERVAL = { min: 30, max: 3600, default: 60 };

/** The Modbus unit id (slave id) of the configuration. */
export const UNIT_ID = { min: 1, max: 247, default: 1 };

export const LIMITS = {
  /** Gladys: 300 states per minute for the whole integration. */
  statesPerMinute: 300,
  statesPerRequest: 100,
  /** Registers in one read (Modbus: 125 at most; hacs-idm-heatpump groups 32 at most). */
  registersPerRead: 32,
  /**
   * EEPROM writes of the commands that are not protective nor a lower
   * setpoint, per register and rolling hour: refused beyond (iDM: these
   * values must not be changed more often than needed, 300,000 cycles).
   */
  eepromWritesPerHour: 6,
  /** Plausible ranges: a value outside is not a measure. */
  temperature: [-50, 120],
  powerKw: [0, 100],
};

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

export const TIMINGS = {
  /** Opening the TCP connection of a poll. */
  connectTimeout: 3 * SECOND,
  /** A session closed gracefully waits this long for the heat pump to close its side. */
  closeWait: 500,
  /** One answer. */
  requestTimeout: 2 * SECOND,
  /** A refused connection of a stop is tried again this often, until its deadline. */
  connectRetry: 250,
  /** Failed reads: 30 s, 1, 2, then 5 minutes, never shorter than the interval. */
  backoff: [30 * SECOND, MINUTE, 2 * MINUTE, 5 * MINUTE],
  /** The time of the last read goes to /data at most once a minute. */
  attemptWriteEvery: MINUTE,
  /** The publisher sends what is pending every second; unchanged states again every 30 min. */
  flushInterval: SECOND,
  stateHeartbeat: 30 * MINUTE,
  /** The "Test the connection" button never reads sooner than this after the last read. */
  testCooldown: 10 * SECOND,
  /**
   * Gladys waits 5 s for the ack: every click is answered by 3.5 s (a command
   * or a stop still running goes on, and the answer says what is known);
   * a stop is tried (connection refused, closed, timeout) until 3 s after
   * its start.
   */
  commandSendBy: 3_000,
  commandAnswerBy: 3_500,
  commandConnectMax: 2_000,
  commandReadMax: 1_500,
  commandMinRead: 300,
  commandMinSend: 300,
  /** A command waiting its turn (a scene setting several values) starts within 15 s, or never. */
  queueWindow: 15 * SECOND,
  /** The configuration could not be read from Gladys: tried again this often. */
  configRetry: 30 * SECOND,
  /**
   * iDM: a change takes effect after about 15 s (the NAVIGATOR updates its
   * parameters cyclically). Reads after a command: 5 s, then after that
   * delay, then a check.
   */
  applyDelay: 20 * SECOND,
  followUps: [5 * SECOND, 25 * SECOND, 60 * SECOND],
  /** A sent command keeps its guard until a read shows what it asked, or 2 min. */
  guard: 2 * MINUTE,
  /** A stop not confirmed is sent again by the reads of the next 3 minutes, three times at most. */
  stopGuard: 3 * MINUTE,
  stopReasserts: 3,
  /** A stop guard is checked this often (read, then written again if needed), whatever the interval. */
  stopRetry: 15 * SECOND,
  /** A check that gave its turn up to a click or a command is tried again this soon. */
  checkYield: SECOND,
  /** A stop sent again by a read leaves at least this long after the read closed the line. */
  reassertDelay: SECOND,
  /** Last values older than this are never sent again to Gladys (connected, device created). */
  freshFor: 2 * MINUTE,
};
