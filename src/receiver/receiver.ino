#include <RH_ASK.h>
#include <SPI.h>  // RadioHead dependency
#include <LiquidCrystal.h>

#define MOCK_DATA 0 // 1 to use mock data, 0 to disable mock data

// Must match the bridge's --baud (default 115200) and BAUD in docker-compose.yml.
const long SERIAL_BAUD = 115200;

// Radio: RX on pin 7 (moved off 11/12, which the LCD uses).
// TX pin 8 and PTT pin 9 aren't used on the receiver but must not clash.
// 2000 bps must match the transmitter's speed (RadioHead default).
RH_ASK rf(2000, 7, 8, 9);

// LCD (parallel): RS=12, E=11, D4=5, D5=4, D6=3, D7=2, V0 on pin 6
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
const int CONTRAST_PIN = 6;
int contrast = 75;          // Adjust contrast accordingly

// Radio packet. The transmitter must send exactly this layout (6 bytes).
struct __attribute__((packed)) Packet {
  uint8_t  nodeId;   // worker / wearable number
  uint16_t gas;      // raw MQ-2 analogRead, 0-1023
  uint8_t  sos;      // 1 = SOS active, 0 = normal
  uint16_t seq;      // goes up by 1 each send, so the bridge can spot lost packets
};

// Older transmitter firmware that only sends id + gas (3 bytes).
// Still accepted so testing works before the transmitter is updated.
struct __attribute__((packed)) LegacyPacket { uint8_t nodeId; uint16_t gas; };

// Print text on one LCD row, padded so old characters are cleared.
void lcdRow(uint8_t row, const char* text) {
  char line[17];
  snprintf(line, sizeof(line), "%-16s", text);
  lcd.setCursor(0, row);
  lcd.print(line);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  analogWrite(CONTRAST_PIN, contrast);
  lcd.begin(16, 2);

  // Debug lines start with '#' so the bridge ignores them.
  if (rf.init()) {
    Serial.println("# receiver ready");
    lcdRow(0, "Canairy ready");
    lcdRow(1, "Waiting...");
  } else {
    Serial.println("# receiver init failed");
    lcdRow(0, "Radio init");
    lcdRow(1, "FAILED");
  }
}

// Send a reading to the bridge as "id,gas,sos,seq" (e.g. "1,312,0,57") and show it on the LCD.
void showPacket(const Packet& p) {
  Serial.print(p.nodeId); Serial.print(",");
  Serial.print(p.gas);    Serial.print(",");
  Serial.print(p.sos ? 1 : 0); Serial.print(",");
  Serial.println(p.seq);

  char text[17];
  if (p.sos) snprintf(text, sizeof(text), "Node %u  SOS!", p.nodeId);
  else       snprintf(text, sizeof(text), "Node %u", p.nodeId);
  lcdRow(0, text);
  snprintf(text, sizeof(text), "Gas: %u", p.gas);
  lcdRow(1, text);
}

// Turn raw radio bytes into a Packet. Returns false if the length doesn't match a known layout.
bool decodePacket(const uint8_t* buf, uint8_t len, Packet& p) {
  if (len == sizeof(Packet)) {
    memcpy(&p, buf, sizeof(p));
    return true;
  }
  if (len == sizeof(LegacyPacket)) {
    // Old format has no SOS or counter: assume no SOS and count packets here
    // (per node), so the bridge doesn't flag them as lost.
    static uint16_t legacySeq[100];           // bridge accepts worker IDs 1-99
    LegacyPacket old;
    memcpy(&old, buf, sizeof(old));
    p.nodeId = old.nodeId;
    p.gas = old.gas;
    p.sos = 0;
    p.seq = legacySeq[old.nodeId % 100]++;
    return true;
  }
  return false;
}

#if MOCK_DATA
// Fake workers that behave like bridge/simulator.py, using nodes 1-4 because
// the bridge keeps ids 101+ for its own simulated workers. Each node steps once
// per second and now and then will:
//   - walk into bad air (gas climbs for 10-25 s, then recovers)
//   - press SOS (stays on for 60 s; the radio is one-way, so no acknowledge)
//   - drop a packet (seq skips a number)
//   - go quiet for ~15 s
const uint8_t MOCK_NODES = 4;

struct MockNode {
  float baseline, gas, target;
  uint16_t seq;
  uint8_t gasTicks, sosTicks, quietTicks;   // seconds left of each event
};

// Advances one node by one second. Returns false if it sends nothing this time.
bool mockPacket(uint8_t i, Packet& p) {
  static MockNode nodes[MOCK_NODES];
  static bool started = false;
  if (!started) {
    started = true;
    randomSeed(analogRead(A0));             // A0 is unconnected: different run each reset
    for (uint8_t n = 0; n < MOCK_NODES; n++) {
      nodes[n].baseline = nodes[n].gas = nodes[n].target = random(120, 221);
    }
  }
  MockNode& w = nodes[i];

  // Gas events: about one every 4 minutes.
  if (w.gasTicks > 0) {
    w.gasTicks--;
  } else {
    w.target = w.baseline;
    if (random(240) == 0) {
      w.target = random(450, 851);
      w.gasTicks = random(10, 26);
    }
  }
  w.gas += (w.target - w.gas) * 0.25 + random(-800, 801) / 100.0;
  w.gas = constrain(w.gas, 0, 1023);

  // SOS events: about one every 17 minutes.
  if (w.sosTicks > 0) w.sosTicks--;
  else if (random(1000) == 0) w.sosTicks = 60;

  w.seq++;

  // Going quiet / dropped packets: skip sending, but seq still counts up.
  if (w.quietTicks > 0) {
    w.quietTicks--;
    return false;
  }
  if (random(1200) == 0) {                  // about one every 20 minutes
    w.quietTicks = 15;
    return false;
  }
  if (random(100) < 3) return false;        // 3% of packets are lost

  p.nodeId = i + 1;
  p.gas = (uint16_t)(w.gas + 0.5);
  p.sos = w.sosTicks > 0 ? 1 : 0;
  p.seq = w.seq;
  return true;
}
#endif

void loop() {
  uint8_t buf[RH_ASK_MAX_MESSAGE_LEN];
  uint8_t len = sizeof(buf);
  Packet p;
  if (rf.recv(buf, &len) && decodePacket(buf, len, p)) {
    showPacket(p);
  }

#if MOCK_DATA
  // One node every 250 ms, so each of the 4 updates once per second and the
  // LCD cycles through them.
  static unsigned long lastMock = 0;
  static uint8_t nextNode = 0;
  if (millis() - lastMock >= 1000 / MOCK_NODES) {
    lastMock = millis();
    Packet mock;
    if (mockPacket(nextNode, mock)) showPacket(mock);
    nextNode = (nextNode + 1) % MOCK_NODES;
  }
#endif
}
