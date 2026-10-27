# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.1] - 2026-10-27

### Added

- iDM heat pumps with the NAVIGATOR 2.0 controller over local Modbus TCP: outdoor, flow, return,
  source, air, buffer and hot water temperatures, operating mode and state, fault, compressor, charge
  pump, heating circuits A to G (mode, current state, room setpoint, room and flow temperatures),
  humidity, solar temperatures and electrical power when the heat pump gives them.
- Commands behind "Allow the commands" (off by default): operating mode, circuit mode, circuit room
  setpoint (15-30 °C) and hot water setpoint (35 °C to the configured ceiling, 55 °C by default,
  60 °C at most), confirmed by a read back, at most 6 changes per setting and hour.
- Standby and turning a circuit off never depend on that option; a stop not confirmed is sent again
  by the next reads and after a restart.
- "Test the connection" button, docs in English and French, cover image.

[Unreleased]: https://github.com/LM1LC3N7/gladys-idm/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-idm/releases/tag/v0.1.1
