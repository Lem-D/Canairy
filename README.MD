# Canairy

A wearable for construction and manufacturing workers that reports each person's air quality and an SOS alert to a live supervisor dashboard. Built for NatHacks 2026. See [`docs/design-doc.md`](docs/design-doc.md) for the full design.

```
Wearable --315MHz RF--> Receiver Arduino --USB--> bridge (Python) --WebSocket--> dashboard (React)
```

Gas sensor datasheet (MQ-2): https://www.mouser.com/datasheet/2/321/605-00008-MQ-2-Datasheet-370464.pdf

## Building and running the software (no hardware needed)

The bridge makes up simulated workers when no Arduino is plugged in, so you can build, run and test everything without any hardware.

### Prerequisites

| Tool | Version | Check with |
| --- | --- | --- |
| Python | 3.10+ | `python3 --version` (Windows: `py --version`) |
| Node.js | 18+ (with npm) | `node -v` |
| Docker (optional) | any recent | `docker --version` |

### 1. Start the bridge (terminal 1)

First time only, create a virtual environment and install dependencies:

```bash
cd bridge
python3 -m venv .venv                # Windows: py -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Then run it (every time):

```bash
cd bridge
source .venv/bin/activate            # Windows: .venv\Scripts\activate
python bridge.py --no-serial         # simulation only; drop --no-serial to also look for an Arduino
```

It serves a WebSocket at `ws://localhost:8080` and simulates 4 workers (ids 101-104). Options are listed in [`bridge/README.md`](bridge/README.md).

### 2. Start the dashboard (terminal 2)

```bash
cd canairy-dashboard
npm install          # first time only, and whenever dependencies change
npm start
```

Your browser opens http://localhost:3000 and shows one card per worker. If it says "Not connected", the bridge isn't running; the page reconnects on its own.

To try the alerts, type `sos 101` or `gas 102` in the bridge terminal and press Enter. The matching card should react within a second.

### 3. Production build

```bash
cd canairy-dashboard
npm run build        # outputs static files to canairy-dashboard/build
```

Or build and serve it with nginx via Docker at http://localhost:3000 (the bridge still runs on your laptop):

```bash
docker compose up --build dashboard
```

If the Docker build fails on HTTPS certificate errors (antivirus or corporate proxy), see [`docker/certs/README.md`](docker/certs/README.md).

### Everything in Docker

Docker is the only thing you need to install; Python, Node and the Arduino toolchain all live in the images.

```bash
docker compose up -d --build     # dashboard (http://localhost:3000) + bridge with simulated workers
docker compose down              # stop
```

To feed in the real receiver Arduino instead of only simulated workers:

```powershell
docker compose stop bridge
usbipd attach --wsl --hardware-id 2341:0043      # Windows only: hand the board to Docker
docker compose --profile hardware up --build bridge-live
usbipd detach --hardware-id 2341:0043            # when done
```

Port 8080 must be free: the dashboard always connects to `ws://localhost:8080`.

## Flashing the Arduinos

The firmware is compiled and uploaded from Docker, so nothing Arduino-related needs installing. On Windows you also need [usbipd-win](https://github.com/dorssel/usbipd-win) (`winget install usbipd`), because Docker Desktop can't see USB devices by itself. From the repo root in PowerShell:

```powershell
.\scripts\flash.ps1                        # receiver (src/receiver)
.\scripts\flash.ps1 -Sketch transmitter    # wearable (src/transmitter)
```

The script hands the board to Docker, uploads, opens the serial monitor (Ctrl+C to exit), then gives the board back to Windows. The first run asks for admin once. For CH340 clone boards add `-HardwareId 1a86:7523 -SerialPort /dev/ttyUSB0`. On Linux, run `SKETCH=transmitter docker compose run --rm --build firmware` directly.

Wiring:

| Board | Part | Arduino pins |
| --- | --- | --- |
| Wearable | RF transmitter DATA | 12 |
| Wearable | MQ-2 AO | A0 |
| Wearable | SOS button | 2 and GND |
| Receiver | RF receiver DATA | 7 |
| Receiver | 16x2 LCD (parallel) | RS 12, E 11, D4-D7 5/4/3/2, V0 (contrast) 6 |

Set `NODE_ID` in `src/transmitter/transmitter.ino` to give each wearable its own number. `MOCK_DATA` at the top of `src/receiver/receiver.ino` makes the receiver invent readings for testing without a wearable; set it to `0` for real use.

## Testing

| What | Command | Run from |
| --- | --- | --- |
| Bridge (serial line parser) | `python -m unittest` | `bridge/`, with the virtual environment on |
| Dashboard (React components and WebSocket hook) | `CI=true npm test` | `canairy-dashboard/` |

Notes:

- `npm test` normally starts an interactive watch mode. `CI=true` (Windows PowerShell: `$env:CI="true"; npm test`) runs the tests once and exits.
- The dashboard tests use a fake WebSocket, so the bridge doesn't need to be running.
- To confirm the whole pipeline end to end, run both programs as above and check that the four simulated workers appear and that `sos 101` raises an SOS on the dashboard.

## Troubleshooting

- **`ModuleNotFoundError: No module named 'serial'`**: the virtual environment isn't active. Run the `activate` line again.
- **"port 8080 is already in use"**: the bridge is already running in another terminal. Use `--ws-port` only if you also change `BRIDGE_URL` in `canairy-dashboard/src/hooks/useWorkers.js`.
- **Dashboard says "Not connected"**: start the bridge (step 1).

## More documentation

- [`bridge/README.md`](bridge/README.md): bridge options, the serial line format the receiver must print, and the WebSocket messages
- [`canairy-dashboard/README.md`](canairy-dashboard/README.md): dashboard details
- [`docs/design-doc.md`](docs/design-doc.md): design doc
