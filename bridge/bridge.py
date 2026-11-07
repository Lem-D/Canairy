"""Canairy bridge: receiver Arduino (USB) + simulated workers  ->  WebSocket.

Start it with:  python bridge.py        (Windows: py bridge.py)
Options:
  --port <name>     Use this serial port instead of auto-detecting (e.g. COM3)
  --baud <n>        Baud rate, must match Serial.begin() on the Arduino (default 115200)
  --ws-port <n>     WebSocket port (default 8080)
  --host <addr>     Address to listen on (default localhost; 0.0.0.0 in Docker)
  --sim <n>         Number of simulated workers (default 4, 0 turns them off)
  --no-serial       Don't look for an Arduino at all (simulation only)
"""

import argparse
import asyncio
import json
import sys
import threading
import time

from websockets.asyncio.server import broadcast, serve

from serial_reader import start_serial
from simulator import Simulator
from workers import name_for


def now_ms():
    return int(time.time() * 1000)


class Bridge:
    """Remembers the latest reading for every worker, so a dashboard that opens
    (or reloads) late still sees everyone straight away."""

    def __init__(self, sim):
        self.workers = {}
        self.clients = set()
        self.serial_status = {"state": "disabled", "path": None}
        self.sim = sim

    def send_all(self, message):
        broadcast(self.clients, json.dumps(message))

    def handle_reading(self, reading, source):
        prev = self.workers.get(reading["id"])

        # RF repeats (e.g. SOS sent 3 times) arrive with the same seq: ignore copies.
        if prev and prev["seq"] == reading["seq"] and now_ms() - prev["lastSeen"] < 5000:
            return

        # Count lost packets from gaps in seq. A big jump or a smaller number means
        # the wearable restarted or the counter wrapped, so don't count those.
        lost = prev["lost"] if prev else 0
        if prev:
            gap = reading["seq"] - prev["seq"] - 1
            if 0 < gap < 100:
                lost += gap

        # An SOS stays acknowledged until the button is released and pressed again.
        acknowledged = bool(reading["sos"] and prev and prev["sos"] and prev["acknowledged"])

        worker = {
            "id": reading["id"],
            "name": name_for(reading["id"]),
            "source": source,  # "live" (real wearable) or "sim"
            "gas": reading["gas"],
            "sos": reading["sos"],
            "acknowledged": acknowledged,
            "seq": reading["seq"],
            "lost": lost,
            "lastSeen": now_ms(),
        }
        self.workers[worker["id"]] = worker
        self.send_all({"type": "worker", "worker": worker})

        if reading["sos"] and not (prev and prev["sos"]):
            print(f"[sos] {worker['name']} (id {worker['id']}) pressed SOS")

    def acknowledge(self, worker_id):
        worker = self.workers.get(worker_id)
        if not worker or not worker["sos"] or worker["acknowledged"]:
            return
        worker["acknowledged"] = True
        print(f"[sos] {worker['name']} (id {worker_id}) acknowledged")
        self.send_all({"type": "worker", "worker": worker})
        # The real wearable can't hear us (one-way radio), but simulated ones can.
        if self.sim:
            self.sim.acknowledge(worker_id)

    def set_serial_status(self, status):
        self.serial_status = status
        self.send_all({"type": "serial", "serial": status})

    async def handle_client(self, socket):
        self.clients.add(socket)
        try:
            await socket.send(json.dumps({
                "type": "snapshot",
                "serverTime": now_ms(),
                "serial": self.serial_status,
                "workers": list(self.workers.values()),
            }))
            async for data in socket:
                try:
                    msg = json.loads(data)
                except ValueError:
                    continue
                if isinstance(msg, dict) and msg.get("type") == "ack" and isinstance(msg.get("id"), int):
                    self.acknowledge(msg["id"])
        except Exception:
            pass  # browser tab closed or reloaded
        finally:
            self.clients.discard(socket)


async def run_simulator(bridge, sim):
    while True:
        for reading in sim.tick():
            bridge.handle_reading(reading, "sim")
        await asyncio.sleep(sim.interval)


def read_terminal_commands(loop, sim):
    """Lets you type 'sos 101' or 'gas 102' to trigger events while rehearsing."""
    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 2 or parts[0] not in ("sos", "gas") or not parts[1].isdigit():
            print("commands: sos <id>, gas <id>")
            continue
        worker_id = int(parts[1])
        trigger = sim.trigger_sos if parts[0] == "sos" else sim.trigger_gas
        loop.call_soon_threadsafe(lambda: trigger(worker_id) or print(f"no simulated worker with id {worker_id}"))


async def main():
    ap = argparse.ArgumentParser(description="Canairy bridge: Arduino + simulated workers to WebSocket")
    ap.add_argument("--port", help="serial port, e.g. COM3 or /dev/ttyACM0 (default: find it automatically)")
    ap.add_argument("--baud", type=int, default=115200, help="must match Serial.begin() on the Arduino")
    ap.add_argument("--ws-port", type=int, default=8080, help="WebSocket port")
    ap.add_argument("--host", default="localhost", help="address to listen on (0.0.0.0 inside Docker)")
    ap.add_argument("--sim", type=int, default=4, help="number of simulated workers (0 turns them off)")
    ap.add_argument("--no-serial", action="store_true", help="don't look for an Arduino (simulation only)")
    args = ap.parse_args()

    loop = asyncio.get_running_loop()
    sim = Simulator(args.sim) if args.sim > 0 else None
    bridge = Bridge(sim)

    try:
        server = await serve(bridge.handle_client, args.host, args.ws_port)
    except OSError:
        print(f"[ws] port {args.ws_port} is already in use. Is the bridge already running in another terminal?")
        sys.exit(1)
    print(f"[ws] dashboard can connect to ws://localhost:{args.ws_port}")

    if sim:
        print(f"[sim] simulating {args.sim} worker{'' if args.sim == 1 else 's'} (ids {sim.ids[0]}-{sim.ids[-1]})")
        asyncio.create_task(run_simulator(bridge, sim))
        if sys.stdin.isatty():
            print('[sim] type "sos 101" or "gas 102" and press Enter to trigger an event')
            threading.Thread(target=read_terminal_commands, args=(loop, sim), daemon=True).start()

    if args.no_serial:
        print("[serial] off (--no-serial), simulation only")
    else:
        bridge.serial_status = {"state": "searching", "path": None}
        # The serial thread hands results to the main loop, which owns the WebSocket.
        start_serial(
            path=args.port,
            baud_rate=args.baud,
            on_reading=lambda r: loop.call_soon_threadsafe(bridge.handle_reading, r, "live"),
            on_status=lambda s: loop.call_soon_threadsafe(bridge.set_serial_status, s),
            log=lambda msg: print(msg, flush=True),
        )

    await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nbridge stopped")
