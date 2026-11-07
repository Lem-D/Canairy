#include <RH_ASK.h>
#include <SPI.h>          // required for RadioHead to compile

RH_ASK rf;                // 2000 bps, RX=11, TX=12

struct Packet { uint8_t nodeId; uint16_t gas; };

void setup() { rf.init(); }

void loop() {
  Packet p = { 1, (uint16_t)analogRead(A0) };
  rf.send((uint8_t*)&p, sizeof(p));
  rf.waitPacketSent();
  delay(1000);
}