"""Fake workers for the demo and for building the dashboard without hardware.
They send the same {id, gas, sos, seq} readings as the real wearable, so the
dashboard treats them exactly alike.

Now and then a simulated worker will:
  - walk into bad air (gas climbs for a while, then recovers)
  - press SOS (stays on until someone acknowledges it, or 60 s pass)
  - drop a packet (seq skips a number)
  - go quiet for ~15 s (so the dashboard can show them as offline)
"""

import random
import time

from workers import SIM_ID_START


def chance(p):
    return random.random() < p


class Simulator:
    def __init__(self, count, interval=1.0):
        self.interval = interval
        self.workers = []
        for i in range(count):
            baseline = random.uniform(120, 220)
            self.workers.append({
                "id": SIM_ID_START + i, "baseline": baseline, "gas": baseline, "target": baseline,
                "seq": 0, "sos_until": 0, "quiet_until": 0, "gas_until": 0,
            })
        self.ids = [w["id"] for w in self.workers]

    def _per_tick(self, per_minute):
        # Scale event odds so they feel the same whatever the interval is.
        return per_minute * self.interval / 60

    def tick(self):
        """Advances every worker one step and returns the readings to send."""
        now = time.time()
        readings = []
        for w in self.workers:
            # Gas events.
            if now > w["gas_until"]:
                w["target"] = w["baseline"]
                if chance(self._per_tick(0.25)):
                    w["target"] = random.uniform(450, 850)
                    w["gas_until"] = now + random.uniform(10, 25)
            w["gas"] += (w["target"] - w["gas"]) * 0.25 + random.uniform(-8, 8)
            w["gas"] = max(0, min(1023, w["gas"]))

            # SOS events.
            if w["sos_until"] and now > w["sos_until"]:
                w["sos_until"] = 0
            if not w["sos_until"] and chance(self._per_tick(0.06)):
                w["sos_until"] = now + 60

            w["seq"] = (w["seq"] + 1) % 65536

            # Going quiet / dropped packets: skip sending, but seq still counts up.
            if now < w["quiet_until"]:
                continue
            if chance(self._per_tick(0.05)):
                w["quiet_until"] = now + 15
                continue
            if chance(0.03):
                continue

            readings.append({"id": w["id"], "gas": round(w["gas"]), "sos": w["sos_until"] > 0, "seq": w["seq"]})
        return readings

    def _find(self, worker_id):
        return next((w for w in self.workers if w["id"] == worker_id), None)

    def acknowledge(self, worker_id):
        """A supervisor acknowledged this worker's SOS. Clear it so the demo moves on."""
        w = self._find(worker_id)
        if w:
            w["sos_until"] = 0

    # Force events from the terminal, for rehearsing the demo.
    def trigger_sos(self, worker_id):
        w = self._find(worker_id)
        if w:
            w["sos_until"] = time.time() + 60
        return w is not None

    def trigger_gas(self, worker_id):
        w = self._find(worker_id)
        if w:
            w["target"] = 800
            w["gas_until"] = time.time() + 20
        return w is not None
