import serial, time, requests, sys, json, os

PORT = "COM3"
API_KEY = "YOUR_WRITE_KEY"
CAL_FILE = "mq2_ro.json"
CLEAN_AIR_RATIO = 9.8
CURVES = {"lpg": (574.25, -2.222), "co": (36974, -3.109), "smoke": (30000000, -8.308)}

def rs(raw):                       # RL cancels out, so use 1.0
    raw = max(raw, 1)
    return (1023 - raw) / raw

def read_raw(ser):
    while True:
        line = ser.readline().decode(errors="ignore").strip()
        if "," in line:
            return int(line.split(",")[1])

ser = serial.Serial(PORT, 9600, timeout=2)

if "--calibrate" in sys.argv:
    print("Calibrating in clean air (60 readings)...")
    vals = [rs(read_raw(ser)) for _ in range(60)]
    ro = (sum(vals) / len(vals)) / CLEAN_AIR_RATIO
    json.dump({"ro": ro}, open(CAL_FILE, "w"))
    print(f"Ro = {ro:.4f} saved to {CAL_FILE}")
    sys.exit()

ro = json.load(open(CAL_FILE))["ro"] if os.path.exists(CAL_FILE) else None
if ro is None:
    sys.exit("Run with --calibrate first.")

last = 0
while True:
    raw = read_raw(ser)
    ratio = rs(raw) / ro
    ppm = {g: a * ratio ** b for g, (a, b) in CURVES.items()}
    print(f"raw={raw}  ratio={ratio:.2f}  " +
          "  ".join(f"{g}={v:.0f}ppm" for g, v in ppm.items()))
    if time.time() - last > 16:
        requests.get("https://api.thingspeak.com/update", params={
            "api_key": API_KEY, "field1": raw,
            "field2": round(ppm["lpg"]), "field3": round(ppm["co"]),
            "field4": round(ppm["smoke"])})
        last = time.time()