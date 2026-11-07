"""Prints every serial port this computer can see. Run with: python list_ports.py"""

from serial.tools import list_ports

from serial_reader import find_arduino_port

ports = list(list_ports.comports())
if not ports:
    print("No serial ports found. Is the Arduino plugged in?")
for p in ports:
    vendor = f"(vendor {p.vid:04x})" if p.vid is not None else ""
    print(f"{p.device}  {p.manufacturer or ''}  {vendor}")

guess = find_arduino_port()
if guess:
    print(f"\nThe bridge would pick: {guess}")
else:
    print("\nThe bridge would not pick any of these automatically. Pass it with --port.")
