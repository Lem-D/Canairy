#include <RH_ASK.h>
#include <SPI.h>

RH_ASK rf;
struct Packet { uint8_t nodeId; uint16_t gas; };

void setup() {
  Serial.begin(9600);
  if (rf.init()) Serial.println("receiver ready");
  else           Serial.println("receiver init failed");
}

void loop() {
  uint8_t buf[RH_ASK_MAX_MESSAGE_LEN];
  uint8_t len = sizeof(buf);
  if (rf.recv(buf, &len) && len == sizeof(Packet)) {
    Packet p;
    memcpy(&p, buf, sizeof(p));
    Serial.print(p.nodeId); Serial.print(",");
    Serial.println(p.gas);     // e.g. "1,342"
  }
}