# TODO — iDM heat pump v1

Handoff document: what is done, what was decided, what comes next. Keep it up
to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `gi ci` (Prettier, ESLint, tests Node 24 and 22,
  Docker build, store validator), `npm run audit`, then update README,
  `docs/en.md`, `docs/fr.md`, `CHANGELOG.md` and this file.
- No forum post, no GitHub repository, no topic from a module session (lot 17).

## Status

- [x] **Milestone 1 — core** (2026-10-27): the NAVIGATOR by IP address and
      unit id, documented blocks read every interval over one connection
      (never sooner, even after a restart), one device, commands behind
      `allow_commands` (off), stops never held back, kept in /data and sent
      again, EEPROM quota, test button, docs en/fr, cover. Tested against a
      fake NAVIGATOR only (virtual clock, and a real-clock test x20 on a
      local TCP server).
- [ ] **Review r1** (xhigh: heating and hot water commands).
- [ ] **Milestone 2 — real heat pump**: run against a real NAVIGATOR 2.0 (see "To check").
- [ ] **Milestone 3 — more**: thermal energy (1748-1762, kWh, as non-index
      sensors), eco room setpoint (1415+), PV surplus write (74, cyclic,
      disabled by default behind its own option), zone modules (2000+),
      booster (4001+), message number 1004.

## To check on a real heat pump

- That a NAVIGATOR 2.0 answers the blocks as read here (the NAVIGATOR 10
  table and hacs-idm-heatpump agree on them); that the 4122 power and the
  solar block are answered or refused cleanly (exception 2) without them.
- That the read back of a written register (1005, 1032, 1393, 1401) shows the
  new value at once, or only after the ~15 s iDM documents (then every command
  answers "sent, without confirmation" and the follow-up reads confirm it).
- What a NAVIGATOR 2.0 answers for circuits not configured, and whether
  -1.0 is really "not available" on every optional temperature.
- Holiday (3) in register 1005 on a NAVIGATOR 2.0.
- Whether two Modbus clients at once (Home Assistant and Gladys) are accepted.

## Decisions

- **Version 0.1.0 set by hand** in `package.json`, `package-lock.json`, the
  manifest and `docker_image` (`ghcr.io/lm1lc3n7/gladys-idm:0.1.0`); the
  first patch release gives 0.1.1. The manifest test checks the semver shape
  and that the four agree, never a pinned value.
- **SDK 0.16.0** (latest on npm on 2026-10-27, the template's).
- **Register map**: iDM's own NAVIGATOR 2.0 document (812170) is not public
  (sent by iDM support on request). Used: iDM's "MODBUS TCP NAVIGATOR 10"
  (812663 Rev.0, table of 2025-06-18, software NAV10_20.23, found in the MIT
  repository Xerolux/idm-heatpump-api, read only, `docs/New/`); that
  project's register audit found its 2020 and 2022 NAVIGATOR 2.0 tables and
  this one consistent on the addresses it compared; every address used is also in hacs-idm-heatpump v0.14.0
  (written for the NAVIGATOR 2.0). Nothing is guessed: no address used that
  both do not give alike.
- **Reference**: hacs-idm-heatpump v0.14.0 (8b658bb, MIT; LICENSE read: Joakim
  Sørensen @ludeeus 2020, Klemens Böswirth @kodebach 2023-present), cloned
  read only in `~/code/ref/lot17/idm-heatpump`. Notice and full license in
  `THIRD_PARTY_NOTICES.md`, copied in the image. idm-heatpump-api (MIT,
  Xerolux) only read to cross-check (sentinels, overlaps, EEPROM); nothing
  ported from it.
- **Neighbour modules**: gladys-salda-smarty (Modbus line, session client,
  guards, store, publisher, handlers), gladys-stiebel-eltron (heat pump
  features, hot water ceiling).
- **Reads by runs of documented points** (function 4): iDM and
  idm-heatpump-api note that the NAVIGATOR answers a data point at its start
  address (1392 humidity FLOAT and 1393 circuit A mode overlap), so a block
  never starts inside a FLOAT nor crosses an undocumented address; 32
  registers at most (hacs-idm-heatpump groups).
- **Special values** (lesson 17): FLOAT -1.0 unknown except outdoor, average
  outdoor, heat pump flow and return (always fitted, -1 °C is real); UCHAR
  0xFFFF/255 unknown; charge pump -1 = off (binary feature, no speed).
- **Commands**: system mode (standby, automatic, away, hot water only,
  heating/cooling only; holiday shown, never written), circuit mode (all six,
  off = stop), circuit room setpoint "normal" 15-30 °C by 0.5 (iDM table),
  hot water 35 °C (iDM minimum) to min(ceiling, 60 °C), whole degrees.
  `text/select`, `water-heater/target-temperature`,
  `thermostat/target-temperature`: never a switch.
- **Stops**: 1005 = 0 (standby) and 1393+i = 0 (circuit off). Not confirmed:
  guard of 3 min in /data (target, register, end, resends), resent by reads
  started 20 s or more after it (the NAVIGATOR applies a change in ~15 s) while
  the value read is the one before the stop (or unknown); a third value
  (someone at the panel) or a newer command that left ends it; at a restart,
  `boot()` resends before the configuration is read. Before the configuration
  is read, a stop goes to the heat pump of the last read (kept in /data).
- **EEPROM quota**: 6 writes per register and rolling hour (in memory, reset
  by a restart), never for a lower setpoint nor a stop (iDM: 300,000 cycles).
- **Command queue** instead of "busy": a scene setting N values sets them all
  in order on one session; a command waiting more than 4.3 s is answered
  "waiting" and starts within 15 s of its arrival or never.
- **Identity**: no serial or version register over Modbus: the device id is
  the integration's; another device at the same address is not detected
  (documented). `save()` in /data does not gate the commands: no command
  guard is persisted (only stops, which are never refused).
- **No PV surplus write in v1** (the proposal asked it disabled by default):
  it must be written cyclically from another sensor; left for milestone 3.
- No `keywords` or `countries` in the manifest (AT, DE would fit; left out
  per the lot rules). Categories: `climate`, `energy`.
- `poppler-utils` was installed on the VM to read iDM's PDF (`pdftotext`):
  to carry into the Ansible role.
