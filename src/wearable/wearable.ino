#include <RH_ASK.h>
#include <SPI.h>          // required for RadioHead to compile

// Firmware for both wearables. At power-on it checks whether an RF receiver is
// wired to pin 11 and picks its role:
//   Relay (Module 1, receiver fitted): sends its own readings, forwards Module 2's
//     readings to the dashboard, and lights the buddy LED when Module 2 is in trouble.
//   Sensor (Module 2, no receiver): sends its own readings only.
//
// Wiring: RF transmitter DATA -> pin 12, RF receiver DATA -> pin 11 (relay only),
//         MQ-2 AO -> A0, SOS button between pin 2 and GND (uses the internal pull-up),
//         alert LED -> pin 4, buddy LED -> pin 8 (relay only). Leave A1 unconnected.
RH_ASK rf;                // 2000 bps, RX=11, TX=12, PTT=10

const uint8_t RF_RX_PIN     = 11;
const uint8_t GAS_PIN       = A0;
const uint8_t SOS_PIN       = 2;
const uint8_t SELF_LED_PIN  = 4;
const uint8_t BUDDY_LED_PIN = 8;

const uint8_t  RELAY_ID  = 1;     // worker number used when a receiver is detected
const uint8_t  SENSOR_ID = 67;    // worker number used when there is no receiver
const uint16_t GAS_ALERT = 400;   // raw MQ-2 reading; matches the dashboard's Warning line

const unsigned long DETECT_MS = 200;
const unsigned long SEND_INTERVAL_MS = 1000;
const uint8_t SOS_REPEATS = 3;    // one-way radio: repeat SOS changes so one isn't lost
// A packet is about 100 ms on air. The gap leaves the relay time to forward each copy.
const unsigned long REPEAT_GAP_MS = 250;

// Must match the receiver's Packet exactly (6 bytes).
struct __attribute__((packed)) Packet {
  uint8_t  nodeId;   // worker / wearable number
  uint16_t gas;      // raw MQ-2 analogRead, 0-1023
  uint8_t  sos;      // 1 = SOS active, 0 = normal
  uint16_t seq;      // goes up by 1 each send, so the bridge can spot lost packets
};

bool isRelay = false;
uint8_t nodeId = SENSOR_ID;
bool sosActive = false;
uint16_t seq = 0;
unsigned long lastSend = 0;
unsigned long sendInterval = SEND_INTERVAL_MS;

// With the pull-up on, an empty pin always reads HIGH. A powered receiver drives
// the pin itself and its output goes LOW on radio noise. Must run before rf.init().
bool receiverAttached() {
  pinMode(RF_RX_PIN, INPUT_PULLUP);
  delay(100);                     // let the pin and the receiver settle
  unsigned long start = millis();
  while (millis() - start < DETECT_MS) {
    if (digitalRead(RF_RX_PIN) == LOW) return true;
  }
  return false;
}

// Send one reading. `repeats` copies go out with the same seq, so the bridge
// keeps only the first and doesn't count the extras as separate packets.
void sendPacket(uint8_t repeats = 1) {
  Packet p = { nodeId, (uint16_t)analogRead(GAS_PIN), (uint8_t)(sosActive ? 1 : 0), seq++ };
  for (uint8_t i = 0; i < repeats; i++) {
    if (i > 0) delay(REPEAT_GAP_MS);
    rf.send((uint8_t*)&p, sizeof(p));
    rf.waitPacketSent();
  }
  lastSend = millis();
  // Both wearables send about once a second, so vary the sensor's timing to stop
  // them overlapping again and again.
  if (!isRelay) sendInterval = random(SEND_INTERVAL_MS - 100, SEND_INTERVAL_MS + 101);
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

// Relay only: forward Module 2's readings unchanged and update the buddy LED.
// Checking the ID means nothing else heard on the radio gets rebroadcast.
void relayBuddy() {
  uint8_t buf[RH_ASK_MAX_MESSAGE_LEN];
  uint8_t len = sizeof(buf);
  if (!rf.recv(buf, &len) || len != sizeof(Packet)) return;

  Packet p;
  memcpy(&p, buf, sizeof(p));
  if (p.nodeId != SENSOR_ID) return;

  digitalWrite(BUDDY_LED_PIN, (p.sos || p.gas >= GAS_ALERT) ? HIGH : LOW);
  rf.send(buf, len);
  rf.waitPacketSent();
}

void setup() {
  Serial.begin(115200);
  pinMode(SOS_PIN, INPUT_PULLUP);
  pinMode(SELF_LED_PIN, OUTPUT);
  pinMode(BUDDY_LED_PIN, OUTPUT);
  randomSeed(analogRead(A1));     // A1 is unconnected: different timing each reset

  isRelay = receiverAttached();
  nodeId = isRelay ? RELAY_ID : SENSOR_ID;
  rf.init();

  Serial.print(isRelay ? "# role: relay, id " : "# role: sensor, id ");
  Serial.println(nodeId);
}

void loop() {
  // The LED follows the gas level, but only the button sets the SOS sent to the dashboard.
  digitalWrite(SELF_LED_PIN, (sosActive || analogRead(GAS_PIN) >= GAS_ALERT) ? HIGH : LOW);

  if (isRelay) relayBuddy();

  // Each press toggles SOS on/off, and is sent straight away (a few times).
  if (sosPressed()) {
    sosActive = !sosActive;
    sendPacket(SOS_REPEATS);
  }

  if (millis() - lastSend >= sendInterval) {
    sendPacket();
  }
}
