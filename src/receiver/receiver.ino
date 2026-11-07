#include <RH_ASK.h>
#include <SPI.h>            // needed for RadioHead to compile
#include <LiquidCrystal.h>

// 1 = show fake readings every second (test the LCD/serial without a transmitter).
// 0 = only show real packets from the radio.
#define MOCK_DATA 1

// Must match the bridge's --baud (default 115200) and BAUD in docker-compose.yml.
const long SERIAL_BAUD = 115200;

// Radio: RX on pin 7 (moved off 11/12, which the LCD uses).
// TX pin 8 and PTT pin 9 aren't used on the receiver but must not clash.
// 2000 bps must match the transmitter's speed (RadioHead default).
RH_ASK rf(2000, 7, 8, 9);

// LCD (parallel): RS=12, E=11, D4=5, D5=4, D6=3, D7=2, V0 on pin 6
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
const int CONTRAST_PIN = 6;
int contrast = 75;          // lower = darker text, try 20–120

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
// Fake readings: nodes 1-3 take turns, each drifting around a clean-air
// baseline (~300) with an occasional gas spike (~600-800) or SOS.
Packet mockPacket() {
  static uint16_t gas[3] = {300, 280, 320};
  static uint16_t seq[3] = {0, 0, 0};
  static uint8_t next = 0;

  uint8_t i = next;
  next = (next + 1) % 3;

  int g = gas[i] + random(-15, 16);          // small drift
  g = constrain(g, 200, 400);
  gas[i] = g;

  Packet p;
  p.nodeId = i + 1;
  p.gas = g;
  p.sos = (random(30) == 0) ? 1 : 0;         // ~1 in 30: SOS
  p.seq = seq[i]++;
  if (random(20) == 0) p.gas = random(600, 800);   // ~1 in 20: spike
  return p;
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
  static unsigned long lastMock = 0;
  if (millis() - lastMock >= 1000) {
    lastMock = millis();
    showPacket(mockPacket());
  }
#endif
}
