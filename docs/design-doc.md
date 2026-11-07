# Canairy Design Doc

Nov 7, 2026 · Lem

## Overview

Canairy is a wearable for construction and manufacturing workers that makes them aware of hazards and of each other. It reports each person's air quality and an SOS alert to a live supervisor dashboard, and LEDs on the device signal who is in trouble. For NatHacks 2026 (a 64-hour build) we make one working wearable that sends data over 315MHz RF to a receiver Arduino plugged into a laptop, which runs the dashboard.

**Problem.** On a job site or factory floor, a supervisor can't see who is breathing bad air or who needs help until someone shouts. Gas leaks, smoke and fumes hit one person before anyone else notices.

**Users.**

- **Workers** wear the device. They see their own status on the device and can press SOS.
- **Supervisors** watch the dashboard. They see every active worker, their air status, and any SOS alert with its location.

**What the wearable measures.** Air quality only, using an MQ-2 gas sensor. The MQ-2 reacts to combustible gas (LPG, propane, methane, hydrogen) and smoke. It is not a calibrated CO or particulate sensor, so we report levels as Safe, Warning or Danger rather than exact ppm.

**Hackathon scope.**

| In scope | Out of scope |
| --- | --- |
| One working wearable (extra workers simulated) | Several physical wearables (a later add-on) |
| One base station receiving over RF | Two-way messaging to the wearable |
| Dashboard showing workers, air status and SOS | Accounts, logins, cloud hosting |
| SOS button with some form of location | Precise indoor positioning |
| Relative air levels (Safe, Warning, Danger) | Calibrated ppm readings |

## System architecture

Canairy is a one-way chain: the wearable only transmits, and everything downstream only listens. A laptop can't receive 315MHz on its own, so the receiver is a second Arduino (already owned) plugged into the laptop over USB.

```
+-----------------+   3433z RF   +-----------------+   USB serial   +------------------+   live updates   +------------------+
| Wearable        | ------------> | Receiver Arduino| -------------> | Laptop server    | ---------------> | Dashboard        |
| MQ-2 gas sensor |               | Arduino + RF RX |                | Collects data    |                  | Supervisor view  |
| SOS button      |               | Checks packets  |                | Maps IDs to      |                  | All workers      |
| LEDs + LCD      |               | Passes to laptop|                |   workers        |                  | Air levels + SOS |
| Arduino + RF TX |               |                 |                | Spots dropouts   |                  | Who went quiet   |
| 9V battery      |               |                 |                | Raises SOS alerts|                  |                  |
+-----------------+               +-----------------+                +------------------+                  +------------------+
```

The wearable senses and transmits, the receiver Arduino hears it and passes each packet to the laptop over USB, and the laptop shows one card per worker. How each hop is built is the team's call.

**Parts we have.** One of each part, plus a breadboard, jumpers, a button, LEDs and a second Arduino. That is exactly one transmitter and one receiver, which is all a one-wearable demo needs. A second set of parts would only be needed for a true two-wearable demo.

## Core features

- **Air quality monitoring.** The wearable reads the air continuously and turns it into a simple level the worker and supervisor can both understand.
- **SOS.** One press tells the supervisor who needs help and roughly where they are.
- **Live dashboard.** Every active worker in one view: their air level, any SOS, and who has gone quiet.
- **Worker identity.** Each wearable is tied to a named person, so alerts point to someone specific.

## Components

| Component | Responsible for | Hardware we plan to use |
| --- | --- | --- |
| Wearable | Sensing air, showing local status, sending data, SOS button | Arduino, MQ-2, button, LEDs, OLED (maybe), RF transmitter, 9V battery |
| Receiver | Hearing the wearable and passing each packet to the laptop over USB | Second Arduino, RF receiver |
| Server (laptop) | Collecting data, tracking each worker, spotting alerts and dropouts | Team's choice |
| Dashboard | Showing the crew's status and alerts to a supervisor | Team's choice |

## Constraints to design around

- **Location.** The radio only moves bytes; it can't tell where a signal came from. Whatever location the team picks has to travel inside the packet. A GPS module (such as a NEO-6M) gives real coordinates but needs a clear view of the sky and is slow to get a fix indoors, so hardcoded or fake coordinates are fine for a demo.
- **One-way radio, no acknowledgements.** The wearable can't know an alert was seen, so important messages (especially SOS) should be repeated a few times, and every packet should carry the worker's ID. These cheap modules are also noisy, so a library that adds framing and checksums (such as RadioHead) is worth using.
- **The MQ-2 sensor.** It reacts to combustible gas and smoke, isn't calibrated, and needs a minute or two to warm up. Set the alarm level from a clean-air reading before the demo.
- **Power.** The sensor's heater draws about 150mA, which drains a 9V battery within a few hours, so plan spares.
- **Range.** These radios are short range without an antenna; a wire of about 23-24cm (a quarter wavelength at 315MHz) on each module helps a lot.
- **One wearable.** The dashboard is meant for a whole crew, so decide how to show that in the demo.

## Decisions for the team

| Decision | Questions to answer |
| --- | --- |
| What the wearable sends | Which fields and how often. A starting idea from earlier notes: worker ID, gas reading, SOS flag and a counter to spot dropped packets, sent about once a second and right away on SOS |
| Alert levels | How many levels, and how to set the thresholds |
| SOS location | Real GPS or fake coordinates, and how it reaches the dashboard |
| Dashboard stack | Chosen: a React dashboard (`canairy-dashboard/`) fed by a Python bridge (`bridge/`, pyserial + websockets) that reads the receiver Arduino and streams to `ws://localhost:8080`, with simulated workers built in. How to run it and the proposed serial line format (`id,gas,sos,seq`) are in `bridge/README.md` |
| Showing a full crew | Simulate extra workers on the dashboard (saying which one is live), make the wearable's ID switchable, or add a second wearable later |
| Form factor | Armband, vest clip, hard hat, or lanyard |
| Ownership | Who leads hardware, server, dashboard and pitch |

## Checkpoints

Signs of progress over the 64 hours of NatHacks 2026, not a schedule. Hardware and software can move in parallel, and the order is flexible.

- Parts bought and everyone set up.
- Sensor reading and reacting on the bench.
- Wearable and base station talking over RF.
- Dashboard showing live data.
- Full loop working, including SOS.
- Wearable assembled and running on battery.
- Demo rehearsed and pitch ready.

## Open questions

- [ ] What format does the submission need (Devpost, video, live demo)?
- [ ] Real GPS module, or hardcoded coordinates for the demo?
- [ ] Buy a second set of parts for a two-wearable demo, or stay with one?
- [ ] Is the OLED in or out?

## Notes for AI agents

This doc sets direction; it is not a spec. The team makes the design choices.

- Before choosing a stack, data format or approach, ask the team or offer two or three options with tradeoffs.
- Stay within the scope above; don't add features, sensors or services unless asked.
- Flag anything that conflicts with the constraints listed here.
