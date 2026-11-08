#include <RH_ASK.h>
#include <SPI.h>  // RadioHead dependency
#include <LiquidCrystal.h>

#define MOCK_DATA 0 // 1 to use mock data, 0 to disable mock data
#define RF_DEBUG 1  // 1 prints radio health to serial every 2 s, 0 for normal use

// Must match the bridge's --baud (default 115200) and BAUD in docker-compose.yml.
const long SERIAL_BAUD = 115200;

// Radio: RX on A0, away from the LCD wires. The receiver's noisy output garbles
// the LCD if its wire runs next to E or RS.
// TX pin 8 and PTT pin 9 aren't used on the receiver but must not clash.
// 2000 bps must match the wearable's speed (RadioHead default).
const uint8_t RF_RX_PIN = A0;
RH_ASK rf(2000, RF_RX_PIN, 8, 9);

// LCD (parallel): RS=12, E=10, D4=5, D5=4, D6=3, D7=2, V0 on pin 6
LiquidCrystal lcd(12, 10, 5, 4, 3, 2);
const int CONTRAST_PIN = 6;
int contrast = 100;          // Adjust contrast accordingly

// These LCDs smear if rewritten quickly. Readings still go to the bridge every time.
const unsigned long LCD_UPDATE_MS = 1250;

// Radio packet. The wearable must send exactly this layout (6 bytes).
struct __attribute__((packed)) Packet {
  uint8_t  nodeId;   // worker / wearable number
  uint16_t gas;      // raw MQ-2 analogRead, 0-1023
  uint8_t  sos;      // 1 = SOS active, 0 = normal
  uint16_t seq;      // goes up by 1 each send, so the bridge can spot lost packets
};

// Older wearable firmware that only sends id + gas (3 bytes).
// Still accepted so testing works before the wearable is updated.
struct __attribute__((packed)) LegacyPacket { uint8_t nodeId; uint16_t gas; };

// Packet sent by the Module1 / Module2 wearables (7 bytes).
// They also send 1-byte distress packets for each other. Those are ignored here
// because SOS also arrives in this packet's sos field.
struct __attribute__((packed)) ModulePacket {
  uint8_t nodeId;
  float   ppm;      // LPG estimate from the MQ-2
  uint8_t sos;
  uint8_t seq;      // wraps at 255; the bridge doesn't count a wrap as lost packets
};

// Print text on one LCD row, padded so old characters are cleared.
void lcdRow(uint8_t row, const char* text) {
  char line[17];
  snprintf(line, sizeof(line), "%-16s", text);
  lcd.setCursor(0, row);
  lcd.print(line);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
#ifdef TCCR4B
  // Mega: run pin 6's PWM at about 31 kHz (default 490 Hz) so the unfiltered
  // contrast signal doesn't make the LCD shimmer. Only affects PWM on pins 6-8.
  TCCR4B = (TCCR4B & 0b11111000) | 0b00000001;
#endif
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

  // An SOS skips the wait so it appears on the LCD straight away.
  static unsigned long lastLcd = 0;
  if (!p.sos && millis() - lastLcd < LCD_UPDATE_MS) return;
  lastLcd = millis();

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
  if (len == sizeof(ModulePacket)) {
    ModulePacket m;
    memcpy(&m, buf, sizeof(m));
    p.nodeId = m.nodeId;
    p.gas = m.ppm;
    p.sos = m.sos;
    p.seq = m.seq;
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
    randomSeed(analogRead(A1));             // A1 is unconnected: different run each reset
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

#if RF_DEBUG
  // edges = data pin changes (0 means no signal reaches the pin).
  // good = valid packets, bad = packets that failed their checksum.
  static bool lastRx = LOW;
  static uint32_t edges = 0;
  static unsigned long lastReport = 0;
  bool rx = digitalRead(RF_RX_PIN);
  if (rx != lastRx) {
    lastRx = rx;
    edges++;
  }
  if (millis() - lastReport >= 2000) {
    lastReport = millis();
    Serial.print("# rf edges="); Serial.print(edges);
    Serial.print(" good=");      Serial.print(rf.rxGood());
    Serial.print(" bad=");       Serial.println(rf.rxBad());
    edges = 0;
  }
#endif

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
