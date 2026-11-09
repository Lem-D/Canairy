# Canairy

A wearable for construction and manufacturing workers that reports each person's air quality and an SOS alert to a live supervisor dashboard. Built for NatHacks 2026. See [`docs/design-doc.md`](docs/design-doc.md) for the full design.

```
Wearable --315MHz RF--> Receiver Arduino --USB--> bridge (Python) --WebSocket--> dashboard (React)
```

Gas sensor datasheet (MQ-2): https://www.mouser.com/datasheet/2/321/605-00008-MQ-2-Datasheet-370464.pdf  
Hazardous Liquified Petroleum Gas Levels (LPG PPM): https://www.cdc.gov/niosh/idlh/68476857.html 

## Building and running the software (no hardware needed)

The bridge makes up simulated workers when no Arduino is plugged in, so you can build, run and test everything without any hardware.

### Prerequisites

| Tool | Version | Check with |
| --- | --- | --- |
| Python | 3.10+ | `python3 --version` (Windows: `py --version`) |
| Node.js | 18+ (with npm) | `node -v` |
| Docker (optional) | any recent | `docker --version` |

### Quick start: setup script

One script installs everything (bridge virtual environment, dashboard packages) and runs the tests. It checks that Python and Node are installed and tells you where to get them if not. It is safe to re-run.

```bash
./scripts/setup.sh                 # Mac / Linux
```

```powershell
.\scripts\setup.ps1                # Windows PowerShell
```

Add `--skip-tests` (Windows: `-SkipTests`) to skip the test run. If PowerShell blocks the script, run `Set-ExecutionPolicy -Scope Process Bypass` first. When it finishes, continue with step 1 below to start the programs. Prefer to do it by hand? The steps below are what the script does.

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

Or build and serve it with nginx via Docker at http://localhost:3000 (this also starts the bridge with simulated workers):

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

To show only the real receiver (an Arduino Mega 2560), with no simulated workers:

```powershell
docker compose stop bridge
usbipd attach --wsl --hardware-id 2341:0042      # Windows only: hand the board to Docker
docker compose --profile hardware up --build bridge-live
usbipd detach --hardware-id 2341:0042            # when done
```

Port 8080 must be free: the dashboard always connects to `ws://localhost:8080`.

## Flashing the Arduinos

The firmware is compiled and uploaded from Docker, so nothing Arduino-related needs installing. On Windows you also need [usbipd-win](https://github.com/dorssel/usbipd-win) (`winget install usbipd`), because Docker Desktop can't see USB devices by itself. From the repo root in PowerShell:

```powershell
.\scripts\flash.ps1                        # receiver (src/receiver)
.\scripts\flash.ps1 -Sketch wearable    # wearable (src/wearable) NOTE: Wearable firmware is currently untested, so flash the Module 1 and Module 2 firmware to the Arduinos (files included in repository, flash using Arduino IDE for now since the dockerfile is set up to just flash the receiver and wearable code).
```

The script hands the board to Docker, uploads, opens the serial monitor (Ctrl+C to exit), then gives the board back to Windows. The first run asks for admin once. The receiver is built for a Mega 2560 (USB ID `2341:0042`) and wearables for an Uno (USB ID `2341:0043`); use `-Fqbn` and `-HardwareId` to override that. If you run `usbipd` yourself, use the ID of the board you're connecting. For CH340 clone boards add `-HardwareId 1a86:7523 -SerialPort /dev/ttyUSB0`.

### Linux

Docker can use USB devices directly on Linux, so no host Arduino tools are needed, and you flash with Docker Compose instead of a script. Run from the repository root, with the board plugged in:

```bash
SKETCH=receiver FQBN=arduino:avr:mega docker compose run --rm --build firmware       # receiver (src/receiver)
SKETCH=wearable docker compose run --rm --build firmware    # wearable (src/wearable)
```

The board must be plugged in before you run it, because compose maps the serial device into the container. It defaults to `/dev/ttyACM0` (genuine Uno or Mega); for CH340 clones set `SERIAL_PORT=/dev/ttyUSB0`. Run `ls /dev/ttyACM* /dev/ttyUSB*` to see which one appeared. The container uploads, then opens the serial monitor (Ctrl+C to exit).

Running the bridge on the laptop (not in Docker) with a real receiver needs one extra step: your user must be in the `dialout` group (`uucp` on Arch), or the serial port can't be opened.

```bash
sudo usermod -aG dialout $USER     # then log out and back in
```

`./scripts/setup.sh` warns if you're not in the group. The Docker route should not need this, because the container runs as root. Only one program can hold the port at a time, so close any serial monitor before starting the bridge.

### macOS

Docker Desktop cannot pass USB serial devices directly into containers. The macOS script uses Docker to compile the firmware, then uses Arduino CLI on the host to upload it.

Install the prerequisites:

```bash
brew install arduino-cli
arduino-cli core install arduino:avr
arduino-cli lib install RadioHead LiquidCrystal
```

Connect the Arduino and run from the repository root:

```bash
./scripts/flash.sh                                      # receiver
./scripts/flash.sh --sketch wearable                 # wearable
./scripts/flash.sh --port /dev/cu.usbmodem1101          # choose a port
./scripts/flash.sh --no-monitor                         # upload without opening monitor
```

The script automatically detects a single `/dev/cu.*` port. If multiple ports are connected, specify one with `--port`. The serial monitor uses `115200` baud.

Wiring:

| Board | Part | Arduino pins |
| --- | --- | --- |
| Wearable (Uno) | RF transmitter DATA | 12 |
| Wearable (Uno) | MQ-2 AO | A0 |
| Wearable (Uno) | SOS button | 2 and GND |
| Wearable (Uno) | Alert LED | 4 |
| Wearable (Uno, relay only) | RF receiver DATA | 11 |
| Wearable (Uno, relay only) | Buddy LED | 8 |
| Receiver (Mega 2560) | RF receiver DATA | A0 (keep the wire away from the LCD wires) |
| Receiver (Mega 2560) | 16x2 LCD (parallel) | RS 12, E 10, D4-D7 5/4/3/2, V0 (contrast) 6 |

Both wearables run `src/wearable/wearable.ino`. At power-on, a wearable with an RF receiver on pin 11 becomes the relay (worker 1) and forwards the other wearable's readings; one without a receiver becomes the sensor (worker 67). The role is printed over serial at startup. `MOCK_DATA` at the top of `src/receiver/receiver.ino` makes the receiver invent readings for testing without a wearable; set it to `0` for real use.

### Receiver wiring (Mega 2560)

```text
   RF RECEIVER (315 MHz)              ARDUINO MEGA 2560
  +---------------------+            +-----------------+
  | VCC ----------------|------------| 5V              |
  | GND ----------------|------------| GND             |
  | DATA ---------------|------------| A0              |
  | ANT -- ~24 cm wire  |            |                 |
  +---------------------+            |                 |
                                     |                 |
   16x2 LCD (parallel)               |                 |
  +---------------------+            |                 |
  |  1 VSS -------------|------------| GND             |
  |  2 VDD -------------|------------| 5V              |
  |  3 V0 (contrast) ---|------------| 6               |
  |  4 RS --------------|------------| 12              |
  |  5 RW --------------|------------| GND             |
  |  6 E ---------------|------------| 10              |
  |  7-10 D0-D3         |  not used  |                 |
  | 11 D4 --------------|------------| 5               |
  | 12 D5 --------------|------------| 4               |
  | 13 D6 --------------|------------| 3               |
  | 14 D7 --------------|------------| 2               |
  | 15 A (backlight +) -|--[220R]----| 5V              |
  | 16 K (backlight -) -|------------| GND             |
  +---------------------+            +-----------------+
```

| Part | Part pin | Mega pin | Notes |
| --- | --- | --- | --- |
| RF receiver | VCC | 5V | |
| RF receiver | GND | GND | |
| RF receiver | DATA | A0 | Keep this wire away from the LCD's E and RS wires |
| RF receiver | ANT | None | About 24 cm of solid wire for 315 MHz |
| LCD | 1 VSS | GND | |
| LCD | 2 VDD | 5V | |
| LCD | 3 V0 | 6 | Contrast is set by `contrast` in `receiver.ino` |
| LCD | 4 RS | 12 | |
| LCD | 5 RW | GND | Must be grounded; the firmware only writes to the LCD |
| LCD | 6 E | 10 | |
| LCD | 7-10 D0-D3 | None | Leave unconnected (4-bit mode) |
| LCD | 11 D4 | 5 | |
| LCD | 12 D5 | 4 | |
| LCD | 13 D6 | 3 | |
| LCD | 14 D7 | 2 | |
| LCD | 15 A | 5V through 220 ohm resistor | Skip the resistor only if the LCD board has one built in |
| LCD | 16 K | GND | |

Some RF receiver boards have two DATA pins; they are joined on the board, so connect either one. Pins 8 and 9 are reserved by the radio library, and the firmware doesn't need anything wired to them. Leave pins 0 and 1 free, because uploads use them.

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

- Pitch Slides: [Here](https://docs.google.com/presentation/d/18SDR_fWoqtpLuMwnFeN7VjkKY_wzVUryHObZIeXzKgM/edit?usp=sharing)
- [`bridge/README.md`](bridge/README.md): bridge options, the serial line format the receiver must print, and the WebSocket messages
- [`canairy-dashboard/README.md`](canairy-dashboard/README.md): dashboard details
- [`docs/design-doc.md`](docs/design-doc.md): design doc
