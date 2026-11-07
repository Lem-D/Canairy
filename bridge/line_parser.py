"""Turns one line of text from the receiver Arduino into a reading.

THE LINE FORMAT (agree this with the hardware side):

    id,gas,sos,seq        e.g.  1,312,0,57

  id   worker / wearable number (whole number, 1-99 for real wearables)
  gas  raw MQ-2 reading from analogRead, 0-1023
  sos  1 if the SOS button is active, otherwise 0
  seq  packet counter that goes up by 1 each send (used to spot lost packets)

Anything else is ignored, so the Arduino can still print debug text.
Lines starting with # are always ignored (handy for comments/debug).

If the format changes, this is the only function that needs editing.
It just has to return {"id", "gas", "sos", "seq"} or None.
"""


def parse_line(line):
    text = str(line).strip()
    if not text or text.startswith("#"):
        return None

    parts = [p.strip() for p in text.split(",")]
    if len(parts) != 4:
        return None

    try:
        worker_id, gas, sos, seq = (int(p) for p in parts)
    except ValueError:
        return None
    if sos not in (0, 1):
        return None

    return {"id": worker_id, "gas": gas, "sos": sos == 1, "seq": seq}
