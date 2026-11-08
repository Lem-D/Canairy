"""Finds the receiver Arduino, reads it line by line, and reconnects if it is
unplugged. Works the same on Mac, Windows and Linux.

pyserial is blocking, so this runs in its own background thread and hands
each reading to the main program through callbacks.
"""

import re
import sys
import threading
import time

import serial
from serial.tools import list_ports

from line_parser import parse_line

RETRY_SECONDS = 3

# USB vendor ids for Arduino boards and the usual clone USB chips.
KNOWN_VENDOR_IDS = {
    0x2341,  # Arduino
    0x2A03,  # Arduino (arduino.org)
    0x1A86,  # CH340 (most cheap clones)
    0x0403,  # FTDI
    0x10C4,  # Silicon Labs CP210x
    0x239A,  # Adafruit
}

# USB vendor and product ids of a genuine Mega 2560, which is the receiver board.
MEGA_USB_IDS = {
    (0x2341, 0x0010),  # Mega 2560
    (0x2341, 0x0042),  # Mega 2560 R3
    (0x2A03, 0x0042),  # Mega 2560 R3 (arduino.org)
}


def find_arduino_port():
    """Picks the receiver from the list of serial ports: a Mega if there is one
    (a wearable's Uno may be plugged in too), otherwise the most likely Arduino.
    Clone boards can't be identified as a Mega, so they use the fallback."""
    ports = list(list_ports.comports())
    for p in ports:
        if (p.vid, p.pid) in MEGA_USB_IDS:
            return p.device
    for p in ports:
        if p.vid in KNOWN_VENDOR_IDS:
            return p.device
    for p in ports:
        if re.search(r"arduino|wch|ch340|ftdi|silicon labs", p.manufacturer or "", re.I):
            return p.device
    for p in ports:
        if re.search(r"usbmodem|usbserial|ttyACM|ttyUSB", p.device, re.I):
            return p.device
    return None


def start_serial(path, baud_rate, on_reading, on_status, log=print):
    """Keeps trying to connect, in a background thread. Calls on_reading for
    every good line, and on_status whenever the connection state changes."""
    last_state = None

    def set_status(state, port_path=None):
        nonlocal last_state
        if state == last_state:
            return
        last_state = state
        on_status({"state": state, "path": port_path})
        if state == "searching":
            if path:
                log(f"[serial] waiting for {path}...")
            else:
                log("[serial] no Arduino found yet, still looking (simulated workers keep running)")
        elif state == "connected":
            log(f"[serial] connected to {port_path} at {baud_rate} baud")

    def run():
        last_error = None
        while True:
            port_path = path or find_arduino_port()
            if not port_path:
                set_status("searching")
                time.sleep(RETRY_SECONDS)
                continue

            try:
                port = serial.Serial(port_path, baud_rate, timeout=1)
            except (serial.SerialException, OSError) as err:
                if str(err) != last_error:
                    log(f"[serial] could not open {port_path}: {err}")
                    if "permission" in str(err).lower() and sys.platform.startswith("linux"):
                        log("[serial] on Linux, run: sudo usermod -aG dialout $USER  (then log out and back in)")
                last_error = str(err)
                set_status("searching")
                time.sleep(RETRY_SECONDS)
                continue

            last_error = None
            set_status("connected", port_path)
            try:
                with port:
                    while True:
                        raw = port.readline()  # waits up to 1 s for a full line
                        if not raw:
                            continue
                        line = raw.decode("utf-8", errors="replace").strip()
                        reading = parse_line(line)
                        if reading:
                            on_reading(reading)
                        elif line:
                            log(f"[serial] ignored line: {line!r}")
            except (serial.SerialException, OSError):
                log(f"[serial] {port_path} closed (unplugged?)")
            set_status("searching")
            time.sleep(RETRY_SECONDS)

    threading.Thread(target=run, daemon=True).start()
