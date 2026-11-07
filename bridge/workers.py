"""Names shown on the dashboard. Edit freely.

Real wearables use ids 1-99 (the id the Arduino sends).
Simulated workers use ids 101 and up, so they never clash with real ones.
"""

LIVE_WORKER_NAMES = {
    1: "Worker 1",
}

SIM_WORKER_NAMES = [
    "Ava Chen",
    "Marcus Reid",
    "Priya Patel",
    "Diego Santos",
    "Hannah Okafor",
    "Liam Novak",
    "Sofia Rossi",
    "Noah Kim",
]

SIM_ID_START = 101


def name_for(worker_id):
    if worker_id in LIVE_WORKER_NAMES:
        return LIVE_WORKER_NAMES[worker_id]
    sim_index = worker_id - SIM_ID_START
    if 0 <= sim_index < len(SIM_WORKER_NAMES):
        return SIM_WORKER_NAMES[sim_index]
    return f"Worker {worker_id}"
