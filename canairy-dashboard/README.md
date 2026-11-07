# Canairy dashboard

The supervisor dashboard: one simple card per worker showing their status. It gets live data from
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

If the page says "Not connected", start terminal 1. The page
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
| `src/App.js` | The worker cards |
| `src/App.css` | How the cards look |
| `src/hooks/useWorkers.js` | Talks to the bridge and works out OK / Not OK. The gas cutoffs are at the top |

## What counts as "Not OK"

A worker is Not OK if SOS is active, gas is at or above the danger cutoff, or
nothing was heard from them for 5 seconds. Not OK cards move to the top.

**The gas cutoffs are placeholders** (`GAS_THRESHOLDS` at the top of
`src/hooks/useWorkers.js`: warning 400, danger 600 on the raw 0-1023 reading).
The team should take a clean-air reading after the sensor warms up and pick
real numbers.

## Other commands

- `npm test` runs the tests (press `q` to quit).
- `npm run build` makes the production copy in `build/` (Docker does this for you).
