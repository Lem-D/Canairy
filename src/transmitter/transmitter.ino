#include <RH_ASK.h>
#include <SPI.h>          // required for RadioHead to compile

// Wearable: reads the MQ-2 and sends a packet about once a second.
// Wiring: RF transmitter DATA -> pin 12, MQ-2 AO -> A0,
//         SOS button between pin 2 and GND (uses the internal pull-up).
RH_ASK rf;                // 2000 bps, RX=11, TX=12, PTT=10

const uint8_t NODE_ID    = 1;     // worker / wearable number (1-99)
const uint8_t SOS_PIN    = 2;
const unsigned long SEND_INTERVAL_MS = 1000;
const uint8_t SOS_REPEATS = 3;    // one-way radio: repeat SOS changes so one isn't lost

// Must match the receiver's Packet exactly (6 bytes).
struct __attribute__((packed)) Packet {
  uint8_t  nodeId;   // worker / wearable number
  uint16_t gas;      // raw MQ-2 analogRead, 0-1023
  uint8_t  sos;      // 1 = SOS active, 0 = normal
  uint16_t seq;      // goes up by 1 each send, so the bridge can spot lost packets
};

bool sosActive = false;
uint16_t seq = 0;
unsigned long lastSend = 0;

// Send one reading. `repeats` copies go out with the same seq, so the bridge
// keeps only the first and doesn't count the extras as separate packets.
void sendPacket(uint8_t repeats = 1) {
  Packet p = { NODE_ID, (uint16_t)analogRead(A0), (uint8_t)(sosActive ? 1 : 0), seq++ };
  for (uint8_t i = 0; i < repeats; i++) {
    if (i > 0) delay(100);
    rf.send((uint8_t*)&p, sizeof(p));
    rf.waitPacketSent();
  }
  lastSend = millis();
}

// Returns true once per press (pressed = pin pulled LOW), with simple debouncing.
bool sosPressed() {
  static bool lastState = HIGH;
  static unsigned long lastChange = 0;
  bool state = digitalRead(SOS_PIN);
  if (state != lastState && millis() - lastChange > 50) {
    lastChange = millis();
    lastState = state;
    return state == LOW;
  }
  return false;
}

void setup() {
  pinMode(SOS_PIN, INPUT_PULLUP);
  rf.init();
}

void loop() {
  // Each press toggles SOS on/off, and is sent straight away (a few times).
  if (sosPressed()) {
    sosActive = !sosActive;
    sendPacket(SOS_REPEATS);
  }

  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    sendPacket();
  }
}
