# iDM heat pump (NAVIGATOR 2.0)

This integration shows your iDM heat pump with the **NAVIGATOR 2.0** controller in Gladys, through
its **Modbus TCP** interface on your local network, without any cloud. If you allow it, it can also
change the modes and setpoints.

> **Never tested with a real device.** The integration follows iDM's Modbus TCP documentation and the
> Home Assistant integration `hacs-idm-heatpump`, and was tested against a simulated heat pump only.
> Not affiliated with iDM Energiesysteme GmbH.

## What you need

- An iDM heat pump with the **NAVIGATOR 2.0** controller (the NAVIGATOR 1.0 and 1.7 have another
  Modbus table: they are not supported).
- **Modbus TCP enabled**: "Settings" → "Building management" → "Modbus TCP" set to "On". This setting
  is at installer level: ask your installer or iDM service. The web interface of the heat pump alone
  is not enough.
- A fixed IP address for the heat pump (reserve it in your router or set it in the network menu of
  the NAVIGATOR).
- Modbus TCP has **no password**: any device on your network can read and write the settings of the
  heat pump. Keep it on a **trusted network**, never exposed to the Internet.

## Configuration

| Field                       | Role                                                                             |
| --------------------------- | -------------------------------------------------------------------------------- |
| IP address of the heat pump | IPv4 or host name, port 502 unless you add one (`192.168.1.60:502`).             |
| Modbus unit id              | 1 on a NAVIGATOR.                                                                |
| Heating circuits            | The letters of your circuits, A to G, separated by commas (`A` by default).      |
| Allow the commands          | Off by default (see below).                                                      |
| Hot water ceiling (°C)      | The highest hot water setpoint Gladys may send: 55 °C by default, 60 °C at most. |
| Refresh interval            | 60 s by default, 30 s to 1 h.                                                    |
| Language                    | Language of the device names, the status and the messages.                       |

Save, then add the heat pump from the **Discovery** tab. The "Test the connection" button reads the
heat pump again, never more often than the interval.

## What you see

- Operating mode (standby, automatic, away, holiday, hot water only, heating/cooling only) and heat
  pump state (standby, heating, cooling, hot water, defrost).
- Fault (heat pump locked), compressor running, charge pump running.
- Temperatures: outdoor and average outdoor, heat pump flow and return, heat source inlet and outlet,
  air intake, buffer tank, hot water (top, bottom, tap), hot water setpoint.
- For each configured circuit: mode, current state (off, heating, cooling), "normal" room setpoint,
  room, flow and flow target temperatures.
- When the heat pump gives them: humidity, electrical power (kW), solar temperatures (collector,
  collector return, charge).

A feature shows once a value of it was read. The special values of the NAVIGATOR are never published
as measures: -1.0 on a temperature (sensor absent, except the outdoor temperature and the heat pump
flow/return, always fitted), "not available" on a mode, -1 on the charge pump (published as "off"),
a value out of range. Thermal energy (kWh) is not published.

## The commands

Off by default. With "Allow the commands", Gladys may change:

- the operating mode (automatic, away, hot water only, heating/cooling only; "holiday" is shown
  only);
- the mode of a configured circuit (time program, normal, eco, manual heating, manual cooling);
- the "normal" room setpoint of a circuit, 15 to 30 °C by 0.5 °C;
- the hot water setpoint, in whole degrees, from 35 °C to the ceiling of the configuration (55 °C by
  default). **Nothing above 60 °C is ever sent**, whatever is typed.

Each command first reads the current value on the heat pump, writes nothing when it is already right,
then reads the written value back: it succeeds only when the read back shows the value asked.
Otherwise Gladys answers "sent, without confirmation" and reads the heat pump 5 s, 25 s and 60 s
after (the NAVIGATOR applies a change in about 15 s).

A command is refused, nothing sent, when: the option is off (also checked right before the write),
the value is out of range or above the ceiling, the circuit is not in the configuration, the current
value could not be read, the configuration changed meanwhile, a stop was sent after it arrived, 16
commands are already waiting, or this setting was already changed 6 times in the last hour. That last
limit protects the NAVIGATOR, which keeps these settings in a memory with limited write cycles
(300,000 according to iDM); it never applies to a lower setpoint nor to a stop.

The commands go one at a time, in their order of arrival, on one connection. A scene setting several
values sets them all: a command still waiting its turn after 4 s gets the answer "waiting" and goes
within 15 s of the click, or not at all.

## The stops

Setting the operating mode to **Standby** or a circuit to **Off** **never** depends on the commands
option, the bounds, a read in progress or failing, a heat pump not read yet, nor a waiting command. A
stop goes before anything; every command that arrived before it and has not left is dropped. A refused
connection is tried again every 250 ms for 3.5 s.

A stop not confirmed is kept in `/data` for 3 minutes: the next reads send it again (three times at
most, at least 20 s after it was sent) while the heat pump still shows the value of before, and a
restart of the integration sends it again at once, before even reading the configuration.

A stop can fail or not be sent again in these cases:

- no valid address in the configuration (or, before the configuration is read, no heat pump read
  before): refused, nothing sent;
- the heat pump stays unreachable for 3.5 s: "not sent", then sent again by the next reads and at a
  restart while the 3-minute guard runs;
- the heat pump answers a Modbus exception: "refused" or "sent, without confirmation" depending on the
  code;
- the read back does not show the stop yet: "sent, without confirmation";
- it is no longer sent again once someone set another value on the heat pump meanwhile, once a newer
  Gladys command for the same setting left, after 3 resends or after 3 minutes.

Gladys never starts the heat pump again by itself.

## Known limits

- No serial number over Modbus: the device is tied to the integration, not to the IP address
  (changing the address keeps the device and its history), and another Modbus device at the same
  address would not be detected.
- Writing the photovoltaic surplus, the room-by-room zones, cascades, boosters and thermal energy are
  not supported yet.
