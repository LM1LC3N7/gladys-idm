# gladys-idm

[Gladys Assistant](https://gladysassistant.com) external integration for **iDM heat pumps with the
NAVIGATOR 2.0 controller**, through its **Modbus TCP** interface on the local network (port 502, no
cloud, no password): temperatures, operating mode and state, fault, compressor, charge pump, heating
circuits A to G, hot water, solar temperatures and electrical power; mode and setpoint commands behind
an off-by-default option (hot water capped at 60 °C, 55 °C by default), standby and circuit off never
behind that option. **Never tested with a real device. Not affiliated with iDM.** Modbus TCP has no
authentication: keep the heat pump on a trusted network.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (IdmApp)
                                  ├─ src/modbus/client.js    one Modbus TCP session at a time, bounded MBAP frames
                                  ├─ src/modbus/protocol.js  blocks, requests, FLOAT words, writes (pure)
                                  ├─ src/model.js            special values, plausible ranges, mode texts (pure)
                                  ├─ src/devices.js          the device, its commands and states (pure)
                                  ├─ src/publisher.js        states within 300/min
                                  └─ src/store.js            /data/idm-state.json (last read, stops not confirmed)
```

- **Reads**: one connection per poll (every 60 s, 30 s – 1 h), function 4 on runs of documented data
  points only (iDM's table: a read never starts inside a FLOAT nor crosses a hole), then closed. The
  test button, Discovery, a reconnection and a restart never read sooner than the interval (time
  kept in `/data` before the read); only a command (its fresh read, its read back) and the reads
  5 s, 25 s and 60 s after it do.
- **Device**: `ext:<selector>:idm:heatpump` (no serial number over Modbus). Commands and main states
  always built; sensors once a value was read, or already created.
- **Commands** (`allow_commands`, off by default): system mode (1005), hot water setpoint (1032),
  circuit mode (1393+), circuit room setpoint (1401+, FLOAT). Fresh read, already-so check, EEPROM
  quota (6 per register and hour, never for a lower setpoint), function 16 write, echo and read back;
  one at a time in order on one session (a scene sets them all).
- **Stops** (protective): system standby and circuit off; never behind the option, the bounds, a read
  or a command; drop every command that arrived before; retried for 3.5 s; kept in `/data` and sent
  again (three times at most in 3 minutes) when not confirmed, also at a restart before the
  configuration is read.

## Development

```bash
npm install
npm test
npm run lint && npm run format:check
gi ci          # the whole CI locally (VM tooling)
```

Register map: iDM "MODBUS TCP NAVIGATOR 10" (812663 Rev.0, table of 2025-06-18), cross-checked with
[hacs-idm-heatpump](https://github.com/kodebach/hacs-idm-heatpump) v0.14.0 (MIT, see
`THIRD_PARTY_NOTICES.md`).

## License

Apache-2.0, see [LICENSE](LICENSE).
