# Canairy Design Doc

Last updated Nov 8, 2026 · Yuskei

## Overview

Canairy is a wearable for construction and manufacturing workers that makes them aware of hazards and of each other. It reports each person's air quality and an SOS alert to a live supervisor dashboard, and LEDs on the device signal who is in trouble. For NatHacks 2026 (a 64-hour build) we make two wearable modules. Module 2 only transmits. Module 1 listens to Module 2, adds its own status, and transmits the status of both over 315MHz RF to a receiver Arduino plugged into a laptop, where a React dashboard running locally shows the whole crew.

**Problem.** On many construction and manufacturing job sites, safety culture is often found lacking with many individuals only being monitored by a single supervisor or having to rely on solely themselves. A stronger safety culture is required to promote safety for the entire team; Canairy seeks to solve this problem through shared accountability and increased safety monitory.

**Users.**

- **Workers** wear the device. They see their own status on the device and can press SOS manually or if the system detects dangerous conditions. If a fellow worker with the device triggers this alert or presses SOS, any other team members and the supervisor on  the dashboard is made aware of it.
- **Supervisors** watch the dashboard, a React web app running locally on the laptop. They see every active worker, their air status, and any SOS alert with its location.

**What the wearable measures.** Air quality only, using an MQ-2 gas sensor. The MQ-2 reacts to combustible gas (LPG, propane, methane, hydrogen) and smoke. It is not a particulate sensor and needs calibration, so ppm values are recorded under an assumption on which gas is being monitored (LPG for demo purposes) with relative warning levels attached.

**Hackathon scope.**

| In scope | Out of scope |
| --- | --- |
| Two wearable modules, Module 1 relaying for Module 2 (extra workers simulated) | More than two physical wearables (a later add-on) |
| One receiver Arduino receiving over RF | Two-way messaging to the wearable |
| Local React dashboard showing workers, air status and SOS | Public web hosting, accounts, logins, cloud services |
| SOS button with some form of location | Precise indoor positioning |
| Relative air levels (Safe, Warning, Danger), ppm readings for one gas type (LPGs) | Calibrated ppm readings for all gases and toggle functionality for which gas is being monitored |

## System architecture

Canairy is a relay chain: Module 2 only transmits, Module 1 listens and transmits, and the dashboard side only listens. A laptop can't receive 315MHz on its own, so the dashboard's receiver is an Arduino plugged into the laptop over USB.

```
  +-----------------------+          +-----------------------+
  | Module 2              |          | Module 1              |
  | (transmit only)       |  433MHz  | (listens + transmits) |
  |                       |  ------> |                       |
  | MQ-2 gas sensor       |    RF    | MQ-2 gas sensor       |
  | SOS button            |          | SOS button            |
  | LEDs + screen         |          | LEDs + screen         |
  | Arduino + RF TX       |          | Arduino + RF RX + TX  |
  | 9V battery            |          | 9V battery            |
  +-----------------------+          +-----------------------+
                                                 |
                                                 | 433MHz RF
                                                 | (status of both modules)
                                                 v
                                     +-----------------------+
                                     | Receiver Arduino      |
                                     | (receive only)        |
                                     | RF RX, checks packets |
                                     +-----------------------+
                                                 |
                                                 | USB serial
                                                 v
                                     +-----------------------+
                                     | Python bridge         |
                                     | Reads the USB port    |
                                     | Adds simulated workers|
                                     +-----------------------+
                                                 |
                                                 | WebSocket (localhost:8080)
                                                 v
                                     +-----------------------+
                                     | React dashboard       |
                                     | Worker cards, SOS     |
                                     | alarm, worksite panel |
                                     +-----------------------+
```

**How data moves.**

1. Module 2 reads its sensor and button and transmits its status.
2. Module 1 hears Module 2, combines that with its own reading, and transmits the status of both.
3. The receiver Arduino, which only has a receiver, hears Module 1 and passes each reading to the laptop over USB.
4. The Python bridge reads the USB port and streams the data to the React dashboard at `localhost`, so it works offline without venue Wi-Fi.

**Parts we have.** We have 4 RF modules, which covers this setup: an RF transmitter on Module 2, an RF receiver and an RF transmitter on Module 1, and an RF receiver on the dashboard's Arduino. It also needs three Arduinos, one each for Module 1, Module 2 and the receiver.

## Core features

- **Air quality monitoring.** The wearable reads the air continuously and turns it into a simple level the worker and supervisor can both understand.
- **SOS.** One press tells the supervisor who needs help and roughly where they are.
- **Live dashboard.** Every active worker in one view. Each worker shows a **status** (OK or Not OK), their **gas sensor reading**, and possibly their **location**.
- **Worker identity.** Each wearable is tied to a named person, so alerts point to someone specific.

**Dashboard layout (current sketch).** Two columns:

- **Left: worker cards.** One card per worker, stacked. Each card has a photo or avatar, the worker's name, their status, gas reading and location, and a triangle SOS indicator. The triangle is always shown and lights up when the worker is in danger (SOS pressed).
- **Right: worksite panel.** Site-wide information for worker safety. A map is planned for a future version. Ideas for this side: a site summary (workers active, OK and Not OK), an active alerts and SOS list, a site-wide gas trend chart, a recent events log, and emergency info such as muster points and contacts.

## Components

| Component | Responsible for | Hardware we plan to use |
| --- | --- | --- |
| Module 2 (wearable) | Sensing air, showing local status, SOS button, transmitting its status | Arduino, MQ-2, button, LEDs, screen (maybe), RF transmitter, 9V battery |
| Module 1 (wearable + relay) | Everything Module 2 does, plus listening to Module 2 and transmitting the status of both | Arduino, MQ-2, button, LEDs, screen (maybe), RF receiver, RF transmitter, 9V battery |
| Receiver | Hearing Module 1 and passing each reading to the laptop over USB | Arduino, RF receiver |
| Bridge (laptop) | Reading the receiver over USB and pushing each reading to the dashboard | Python (`bridge/` in the repo) |
| React dashboard (laptop browser) | Tracking each worker, spotting alerts and dropouts, showing it all to a supervisor | React (`canairy-dashboard/` in the repo) |

## Dashboard: recommended tools

The dashboard is a React web app that runs locally on the laptop. Most browsers can't read a USB port on their own, so a small bridge program sits in between. **The team chose a Python bridge** (`bridge/`, pyserial + websockets) that streams to `ws://localhost:8080` with simulated workers built in; how to run it is in `bridge/README.md`. The table below was the original recommendation and still applies to the dashboard side.

| Piece | Recommended tool | Why |
| --- | --- | --- |
| Dashboard | React with Vite | Fast setup and instant reload while building |
| Styling | Tailwind CSS, or a component kit like Mantine or MUI | Cards, colours and banners without much custom CSS |
| Live charts | Recharts | Simple React charts for gas levels over time |
| Bridge (chosen) | Python with `pyserial` | Reads the receiver Arduino over USB |
| Bridge to dashboard (chosen) | WebSocket (Python `websockets`) at `ws://localhost:8080` | Pushes each reading to the browser the moment it arrives |
| Simulated workers | In the bridge | Fake workers come through the same pipe as the real one, so the dashboard treats them all alike |

**Alternatives, if they fit the team better.**

- **Web Serial API, no bridge:** Chrome and Edge can read the Arduino straight from the React app. It's the simplest setup, but it won't work in Firefox or Safari, and the user has to click to pick the port each time.
- **Electron:** wraps the same React app as a desktop app later, if you want a double-click app for the demo.

**One tip.** Have the bridge also send fake packets with no Arduino attached, so dashboard work can start before the hardware is ready.

**Working across Mac, Windows and Linux.** The team uses all three, and Python, Node.js (for the React app), `pyserial` and the browser all run on all of them. A few things differ by system:

- **Port names.** The receiver shows up as `COM3` (or similar) on Windows, `/dev/cu.usbmodem…` on Mac and `/dev/ttyACM0` or `/dev/ttyUSB0` on Linux. Let the bridge find it automatically or take it as a setting (the bridge has a `--port` option), rather than hardcoding one.
- **Linux permissions.** Linux users need to add themselves to the `dialout` group (then log out and back in) to read the USB port.
- **Clone Arduino drivers.** Cheaper Arduino clones often use a CH340 USB chip, which may need a driver on Windows and older Macs.
- **Same setup for everyone.** Use Python 3.10 or newer with the bridge's virtual environment and `requirements.txt`, one Node.js LTS version for the dashboard, and commit the `package-lock.json`, so installs match on every laptop.
- **Demo laptop.** Run the final setup on the laptop you'll present from well before judging, since the port name and drivers are specific to it.

## Constraints to design around

- **Location.** The radio only moves bytes; it can't tell where a signal came from. Whatever location the team picks has to travel inside the packet. A GPS module (such as a NEO-6M) gives real coordinates but needs a clear view of the sky and is slow to get a fix indoors, so hardcoded or fake coordinates are fine for a demo.
- **One-way radio, no acknowledgements.** The wearable can't know an alert was seen, so important messages (especially SOS) should be repeated a few times, and every packet should carry the worker's ID. These cheap modules are also noisy, so a library that adds framing and checksums (such as RadioHead) is worth using.
- **The MQ-2 sensor.** It reacts to combustible gas and smoke, isn't calibrated, and needs a minute or two to warm up. Set the alarm level from a clean-air reading before general use.
    - MQ-2 sensor measures all of the following gases simultaneously: H2, LPG, CH4, CO, Alcohol, Smoke, Propane. Canairy was calibrated for LPG prior to demo, but capability to cycle the gas checked can be implemented in later installments.
    - Conversion of output voltage of MQ-2 sensor to PPM of LPG was done via analysis of the sensitivity characteristic curve of the sensor seen on the data sheet. 
- **Power.** The sensor's heater draws about 150mA, which drains a 9V battery within a few hours, so plan spares.
- **Range.** These radios are short range without an antenna; a wire of about 23-24cm (a quarter wavelength at 315MHz) on each module helps a lot.
- **Relaying through Module 1.** Everything travels on one 315MHz channel, so a few things need planning:
    - Module 1 can't hear Module 2 while it is transmitting itself, so it needs gaps in its own sending to listen.
    - Module 1 and Module 2 can talk over each other. Short random delays between sends help, and so does repeating important messages like SOS.
    - The receiver may also hear Module 2 directly. Each reading should carry its module ID and a counter, so duplicates can be ignored.
    - If Module 1 dies or goes out of range, Module 2 disappears from the dashboard too. The dashboard should show both as "last seen" so this is obvious.
- **Only two wearables.** The dashboard is meant for a whole crew, so simulated workers fill out the demo.

## Decisions for the team

| Decision | Questions to answer |
| --- | --- |
| What each module sends | Which fields and how often. A starting idea: module ID, gas reading, SOS flag and a counter to spot dropped packets, sent about once a second and right away on SOS. The bridge's proposed serial line format is `id,gas,sos,seq` (see `bridge/README.md`) |
| How Module 1 relays | Forward Module 2's readings as they arrive, or send one combined message with both statuses; and how long Module 1 listens between its own sends |
| Alert levels | How many levels, and how to set the thresholds |
| What makes a worker Not OK | Gas over the danger level, SOS pressed, no data for a while (offline), or a mix |
| Dashboard layout | Starting from the sketch above: what goes on each card (add a "last seen" time?), whether high gas alone also lights the SOS triangle and what the worksite panel shows first, before the map exists |
| SOS location | Real GPS or fake coordinates, and how it reaches the dashboard |
| Dashboard stack | Chosen: a React dashboard (`canairy-dashboard/`) fed by a Python bridge (`bridge/`, pyserial + websockets) that streams to `ws://localhost:8080`, with simulated workers built in |
| Showing a full crew | Two real modules plus simulated workers on the dashboard (saying which ones are live) |
| Form factor | Armband, vest clip, hard hat, or lanyard |
| Ownership | Who leads hardware, the bridge, the React dashboard and the pitch |

## Checkpoints

Signs of progress over the 64 hours of NatHacks 2026, not a schedule. Hardware and software can move in parallel, and the order is flexible.

- Parts bought and everyone set up.
- Sensor reading and reacting on the bench.
- Module 1 hearing Module 2 over RF.
- Receiver Arduino hearing Module 1's relayed readings for both modules.
- React dashboard showing live data from the receiver.
- Full loop working, including SOS.
- Both modules assembled and running on battery.
- Demo rehearsed and pitch ready.

## Open questions

- [ ] What format does the submission need (Devpost, video, live demo)?
- [ ] Real GPS module, or hardcoded coordinates for the demo?
- [ ] Do we have three Arduinos (Module 1, Module 2 and the receiver)?
- [ ] Is the screen an LCD or an OLED, or left out?

## Notes for AI agents

This doc sets direction; it is not a spec. The team makes the design choices.

- Before choosing a stack, data format or approach, ask the team or offer two or three options with tradeoffs.
- Stay within the scope above; don't add features, sensors or services unless asked.
- Flag anything that conflicts with the constraints listed here.
