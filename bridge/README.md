# Canairy bridge

The bridge is a small Python program that runs on the laptop. It reads the
receiver Arduino over USB and sends every reading to the dashboard over a
WebSocket at `ws://localhost:8080`. It also makes up a few simulated workers,
so the dashboard works even with no hardware plugged in.

```
Receiver Arduino --USB--> bridge --WebSocket--> React dashboard
                  simulated workers ----^
```

## Running it

You need Python 3.10 or newer. Check with `python3 --version` (on Windows,
`py --version`). Get it from python.org if you don't have it.

**First time only**, set up a virtual environment (a private folder for this
project's Python packages) and install them:

```bash
cd bridge
python3 -m venv .venv                      # Windows: py -m venv .venv
source .venv/bin/activate                  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**Every time after that:**

```bash
cd bridge
source .venv/bin/activate                  # Windows: .venv\Scripts\activate
python bridge.py
```

You'll know the virtual environment is on when your terminal prompt starts
with `(.venv)`. You should see something like:

```
[ws] dashboard can connect to ws://localhost:8080
[sim] simulating 4 workers (ids 101-104)
[serial] connected to /dev/cu.usbmodem14101 at 115200 baud
```

If no Arduino is plugged in, it says it is still looking and keeps the
simulated workers running. Plug the Arduino in at any time and it connects on
its own. Unplug it and it waits for it to come back. Stop the bridge with Ctrl+C.

Run the bridge straight on your laptop, not in Docker. Docker Desktop on Mac
and Windows can't see USB devices, so it would never find the Arduino. The
dashboard can still run in Docker: the browser connects to the bridge itself.

To check it works without React, start the bridge and open
[`test-page.html`](test-page.html) in a browser (double-click it). It shows a
live table of every worker.

### Options

Add them after `python bridge.py`, for example `python bridge.py --port COM3 --sim 6`.

| Option | What it does | Default |
| --- | --- | --- |
| `--port <name>` | Use this serial port instead of finding it automatically | auto |
| `--baud <n>` | Must match `Serial.begin()` on the receiver Arduino | `115200` |
| `--sim <n>` | How many simulated workers. `0` turns them off | `4` |
| `--no-serial` | Don't look for an Arduino at all, simulation only | off |
| `--ws-port <n>` | WebSocket port | `8080` |

Other commands (with the virtual environment on):

- `python list_ports.py` lists every serial port the computer can see, and
  which one the bridge would pick. Use it when the Arduino isn't found.
- `python -m unittest` checks the line parser.

While it runs you can type `sos 101` or `gas 102` and press Enter to make a
simulated worker press SOS or walk into bad air. Handy for rehearsing the demo.

### If something goes wrong

- **`ModuleNotFoundError: No module named 'serial'`**: the virtual environment
  isn't on. Run the `activate` line above.
- **Arduino not found:** close the Arduino IDE's Serial Monitor (only one
  program can use the port at a time), then run `python list_ports.py` and
  pass the right port with `--port`.
- **Linux:** run `sudo usermod -aG dialout $USER`, then log out and back in.
- **Windows / older Macs with a clone board:** install the CH340 driver.
- **"port 8080 is already in use":** the bridge is already running in another terminal.

## For the hardware side: what the receiver should print

The receiver Arduino prints **one line per packet** over USB serial, at
**115200 baud**, in this format:

```
id,gas,sos,seq
```

| Field | Meaning | Example |
| --- | --- | --- |
| `id` | Wearable number, 1-99 (101+ is taken by simulated workers) | `1` |
| `gas` | Raw MQ-2 `analogRead` value, 0-1023 | `312` |
| `sos` | `1` while SOS is active, otherwise `0` | `0` |
| `seq` | Counter that goes up by 1 every packet the wearable sends | `57` |

So a line looks like `1,312,0,57`. Example receiver code, after it has decoded
a packet into these variables:

```cpp
Serial.print(id);  Serial.print(',');
Serial.print(gas); Serial.print(',');
Serial.print(sos ? 1 : 0); Serial.print(',');
Serial.println(seq);
```

Good to know:

- Any line that doesn't match is ignored, so debug prints are fine. Starting a
  line with `#` makes it obvious it's a comment, e.g. `# radio ready`.
- Repeats are fine. If the wearable sends an SOS packet 3 times with the same
  `seq`, the bridge keeps only the first.
- `seq` lets the dashboard count lost packets. Gaps are counted, and it can
  wrap around or restart from 0 without problems.

This format is a starting point, not a decision. If you'd rather send
something else (more fields, a location, a different order), change
`parse_line` in [`line_parser.py`](line_parser.py). It's the only place that
knows the format.

## What's in this folder

| File | What it does |
| --- | --- |
| `bridge.py` | Starts everything: the WebSocket server, the simulator and the serial reader |
| `serial_reader.py` | Finds the Arduino, reads it, reconnects when unplugged |
| `line_parser.py` | Turns one serial line into a reading |
| `simulator.py` | The fake workers |
| `workers.py` | Worker names shown on the dashboard |
| `list_ports.py` | Lists serial ports |
| `test-page.html` | A no-React page to check the bridge works |

## Using it in the dashboard

The React side is the `useWorkers` hook in
[`../canairy-dashboard/src/hooks/useWorkers.js`](../canairy-dashboard/src/hooks/useWorkers.js):

```jsx
import { useWorkers } from './hooks/useWorkers';

function App() {
  const { workers, connected, acknowledge } = useWorkers();
  return (
    <div>
      {!connected && <p>Bridge not running. Start it with python bridge.py</p>}
      {workers.map((w) => (
        <div key={w.id}>
          {w.name}: {w.ok ? 'OK' : 'Not OK'} · gas {w.gas} ({w.level})
          {w.offline && ' · offline'}
          {w.sos && !w.acknowledged && <button onClick={() => acknowledge(w.id)}>Acknowledge SOS</button>}
        </div>
      ))}
    </div>
  );
}
```

Each worker also has `offline` (nothing heard for 5 s), `level`
(`safe` / `warning` / `danger`) and `reasons` (why it's Not OK). The gas
thresholds and what counts as Not OK are placeholders at the top of the hook,
for the team to decide. It reconnects by itself if the bridge restarts.

## What the dashboard receives

The bridge sends JSON messages. You only need this if you're not using the
`useWorkers` hook.

- `{"type":"snapshot", "serverTime", "serial", "workers":[...]}` once, right after connecting, with everyone seen so far.
- `{"type":"worker", "worker":{...}}` every time a reading arrives.
- `{"type":"serial", "serial":{"state":"connected"|"searching"|"disabled","path"}}` when the Arduino connects or disconnects.

A worker looks like:

```json
{ "id": 1, "name": "Worker 1", "source": "live", "gas": 312, "sos": false,
  "acknowledged": false, "seq": 57, "lost": 0, "lastSeen": 1794069372036 }
```

The dashboard can send `{"type":"ack","id":1}` when a supervisor has seen an
SOS. The bridge marks it `acknowledged` for every open dashboard. The real
wearable can't hear this (the radio is one way); simulated workers clear their SOS.
