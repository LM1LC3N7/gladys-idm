# Third-party notices

This integration is licensed under the Apache License 2.0 (see `LICENSE`). It
contains logic ported to JavaScript from the project below. The ported parts
were rewritten, not copied; the changes are described below.

## hacs-idm-heatpump

<https://github.com/kodebach/hacs-idm-heatpump> (Home Assistant custom
integration "IDM heat pump", version v0.14.0, commit 8b658bb), by Klemens
Böswirth (kodebach), started from the integration blueprint of Joakim
Sørensen (ludeeus). MIT License; its `LICENSE` file names both copyright
holders. Full text below.

Ported in `src/constants.js`, `src/modbus/protocol.js` and `src/model.js`:
the Modbus TCP addresses and data types of the NAVIGATOR 2.0 it reads
(`sensor_addresses.py`: outdoor temperatures 1000/1002, system mode 1005,
storage and hot water temperatures 1008-1014 and 1030, hot water setpoint
1032, heat pump temperatures 1050-1060, heat pump state 1090, fault 1099,
compressors 1100-1103, charge pump 1104, humidity 1392, heating circuits
1350-1505 with their per-circuit offsets, solar 1850-1854, electrical power
4122), the meaning of the system and circuit modes (`const.py`), the word
order of a FLOAT (low word first), the "not available" values (FLOAT -1.0,
UCHAR 0xFFFF) and the reads by runs of contiguous data points.

Changed: every address is checked against iDM's own documentation ("MODBUS
TCP NAVIGATOR 10", 812663 Rev.0, table of 2025-06-18), the ranges of the
writes are those of that table, never wider (hot water setpoint capped at
60 °C); -1.0 is a real temperature on the outdoor and heat pump flow/return
sensors; the charge pump's -1 is published as "off"; the writes are limited
per hour (EEPROM); stops are never held back. Nothing of its Home Assistant
code (entities, services, config flow) is used.

```
MIT License

Copyright (c) 2020 Joakim Sørensen @ludeeus
Copyright (c) 2023-present Klemens Böswirth @kodebach

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## gladys-testkit (tests only)

`test/kit/` is copied from gladys-testkit (Apache-2.0, same author as this
integration): fake TCP device and clocks, used by the tests only, not in the
image.
