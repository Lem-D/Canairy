#include <RH_ASK.h>
#include <SPI.h>            // needed for RadioHead to compile
#include <LiquidCrystal.h>

// 1 = show fake readings every second (test the LCD/serial without a transmitter).
// 0 = only show real packets from the radio.
#define MOCK_DATA 0

// Radio: RX on pin 7 (moved off 11/12, which the LCD uses).
// TX pin 8 and PTT pin 9 aren't used on the receiver but must not clash.
// 2000 bps must match the transmitter's speed (RadioHead default).
RH_ASK rf(2000, 7, 8, 9);

// LCD (parallel): RS=12, E=11, D4=5, D5=4, D6=3, D7=2, V0 on pin 6
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
const int CONTRAST_PIN = 6;
int contrast = 75;          // lower = darker text, try 20–120

struct Packet { uint8_t nodeId; uint16_t gas; };

// Print text on one LCD row, padded so old characters are cleared.
void lcdRow(uint8_t row, const char* text) {
  char line[17];
  snprintf(line, sizeof(line), "%-16s", text);
  lcd.setCursor(0, row);
  lcd.print(line);
}

void setup() {
  Serial.begin(9600);
  analogWrite(CONTRAST_PIN, contrast);
  lcd.begin(16, 2);

  if (rf.init()) {
    Serial.println("receiver ready");
    lcdRow(0, "Canairy ready");
    lcdRow(1, "Waiting...");
  } else {
    Serial.println("receiver init failed");
    lcdRow(0, "Radio init");
    lcdRow(1, "FAILED");
  }
}

// Send a reading to the serial port ("1,342") and the LCD.
void showPacket(const Packet& p) {
  Serial.print(p.nodeId); Serial.print(",");
  Serial.println(p.gas);

  char text[17];
  snprintf(text, sizeof(text), "Node %u", p.nodeId);
  lcdRow(0, text);
  snprintf(text, sizeof(text), "Gas: %u", p.gas);
  lcdRow(1, text);
}

#if MOCK_DATA
// Fake readings: nodes 1-3 take turns, each drifting around a clean-air
// baseline (~300) with an occasional spike (~600-800) like a gas leak.
Packet mockPacket() {
  static uint16_t gas[3] = {300, 280, 320};
  static uint8_t next = 0;

  uint8_t i = next;
  next = (next + 1) % 3;

  int g = gas[i] + random(-15, 16);          // small drift
  g = constrain(g, 200, 400);
  gas[i] = g;

  Packet p = { (uint8_t)(i + 1), (uint16_t)g };
  if (random(20) == 0) p.gas = random(600, 800);   // ~1 in 20: spike
  return p;
}
#endif

void loop() {
  uint8_t buf[RH_ASK_MAX_MESSAGE_LEN];
  uint8_t len = sizeof(buf);
  if (rf.recv(buf, &len) && len == sizeof(Packet)) {
    Packet p;
    memcpy(&p, buf, sizeof(p));
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