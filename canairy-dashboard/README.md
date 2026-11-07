# Canairy dashboard

The supervisor dashboard. Worker cards with a gas dial and SOS triangle on the
left, the worksite panel (alerts, site map, gas trend) on the right, and a page
per worker when you click a card. It gets live data from
the bridge (`../bridge`) over a WebSocket at `ws://localhost:8080`.

```
Receiver Arduino --USB--> bridge (Python) --WebSocket--> this dashboard
```

## Running it

You need two terminals: one for the bridge, one for the dashboard.

**Terminal 1, the bridge** (full guide in [`../bridge/README.md`](../bridge/README.md)):

```bash
cd bridge
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python bridge.py
```

With no Arduino plugged in it makes up 4 simulated workers, so you can work on
the dashboard without hardware.

**Terminal 2, the dashboard.** You need Node.js 18 or newer (`node -v` to check,
get it from nodejs.org).

```bash
cd canairy-dashboard
npm install          # first time only, and after someone adds a package
npm start
```

Your browser opens http://localhost:3000. Save any file in `src/` and the page
updates by itself. Stop it with Ctrl+C.

If the page says "The bridge isn't running", start terminal 1. The page
reconnects on its own, so the order doesn't matter.

### Rehearsing the demo

In the bridge terminal, type `sos 101` or `gas 102` and press Enter. A simulated
worker presses SOS or walks into bad air, and the dashboard reacts within a second.

### Running it in Docker

`docker compose up dashboard` serves a built copy at http://localhost:3000. The
bridge still has to run on the laptop itself (Docker can't see USB on Mac or
Windows). The page connects to `ws://localhost:8080` from your browser, so this works.

## Where things are

| File | What it is |
| --- | --- |
| `src/config.js` | **Settings to change**: gas cutoffs, dial range, site name, muster point, and each worker's role and zone |
| `src/App.js` | The page layout, the alert list and which banner shows |
| `src/App.css` | All the styling (colours are at the top) |
| `src/hooks/useWorkers.js` | Talks to the bridge and works out OK / Not OK |
| `src/hooks/useEventLog.js` | Notes changes (SOS pressed, gas level changed, signal lost) for the worker page |
| `src/lib.js` | Small helpers, including how each worker's status text is chosen |
| `src/components/` | The pieces: `WorkerCard`, `WorkerDetail` (worker page), `Worksite` (right panel), `AlertBanner`, `Gauge` (gas dial), `Bars` (gas charts), `SosTriangle`, `Header` |

No extra packages are needed: the dial and charts are drawn with plain SVG and
HTML.

## What the bridge sends, and what's typed in by hand

The bridge sends each worker's id, name, gas reading, SOS and packet counts.
**Role and zone are not sent**, so they are typed in by hand in `WORKER_INFO`
in `src/config.js`. Anyone not listed shows as "Zone not set". The site map
groups people by that assigned zone until there's GPS.

Gas history, "SOS pressed 41s ago", "above 600 for 1m 10s" and the event list
are worked out in the browser, so they start fresh when you reload the page.

## What counts as "Not OK"

A worker is Not OK if SOS is active or gas is at or above the danger cutoff.
If nothing is heard from them for 5 seconds they show as "No signal". The most
urgent cards move to the top: SOS, then dangerous gas, then no signal, then gas
warnings.

**The gas cutoffs are placeholders** (`GAS_THRESHOLDS` in `src/config.js`:
warning 400, danger 600 on the raw 0-1023 reading). The team should take a
clean-air reading after the sensor warms up and pick real numbers. The dial
goes from 0 to 800 (`GAUGE_MAX`), so anything higher pins the needle.

## Acknowledging alerts

- **SOS**: sent to the bridge, so every open dashboard sees it. Simulated
  workers then clear their SOS. The real wearable can't hear it (the radio is
  one way), so its SOS stays on but stops pulsing.
- **Dangerous gas, no signal, gas rising ("Watch")**: only remembered in this
  browser, and reset once the problem clears.

## Other commands

- `npm test` runs the tests (press `q` to quit).
- `npm run build` makes the production copy in `build/` (Docker does this for you).
- Don't run `npm audit fix --force`. It replaces react-scripts with an empty
  version and breaks `npm start`. The audit warnings are about build tools, not
  the page.
