#include<RH_ASK.h> 
#ifdef RH_HAVE_HARDWARE_SPI
#include <SPI.h> // Not actually used but needed to compile
#endif

RH_ASK driver(2000, 11, 12, 0); // 2000 bps, Pin 11 RX, Pin 12 TX
int BaudRate = 9600; // Baud rate can be changed to match expected from the serial reader

void setup() {
  Serial.begin(BaudRate);
  driver.init();
}

void loop() {
  
  uint8_t buf[RH_ASK_MAX_MESSAGE_LEN];
  uint8_t buflen = sizeof(buf);
 
  if (driver.recv(buf, &buflen) & buflen == 7) // Non-blocking
  {
    // Collect values from the receive buffer
    
    uint8_t id_recv = buf[0];

    union {
      float value;
      uint8_t bytes[4];
    } ppm;
  
    for (int i = 0; i < sizeof(float); i++)
    {
      ppm.bytes[i] = buf[i + 1];
    }
    
    int sos = buf[5];

    int seq = buf[6];

    char float_buf[12];

    dtostrf(ppm.value, 4, 3, float_buf);

    // Data is sent over serial formatted as: id, ppm, sos, seq

    Serial.print(id_recv);
    Serial.print(", ");
    Serial.print(float_buf);
    Serial.print(", ");
    Serial.print(sos);
    Serial.print(", ");
    Serial.println(seq);
  }
}
