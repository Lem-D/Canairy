#include <RH_ASK.h>
#ifdef RH_HAVE_HARDWARE_SPI
#include <SPI.h> // Not actually used but needed to compile
#endif
 
RH_ASK driver(2000, 11, 12, 0); // 2000 bps, Pin 11 RX, Pin 12 TX

uint8_t seq = 0; // number of messages sent
uint8_t id = 67; // id for this board
uint8_t sensor_pin = A0; // Pin for analog output of the MQ-2 Sensor Module
uint8_t sos_pin = 2; // Pin connected to the SOS button
uint8_t self_led_pin = 4; // Pin connected to alert led 
float ppm_thresh = 2000; // Threshold ppm, can be changed depending on gas
unsigned long time_ref = 0;
bool sos_on = false;

void setup()
{
  driver.init();
  pinMode(sos_pin, INPUT_PULLUP);
  pinMode(self_led_pin, OUTPUT);
}
 
void loop()
{
  unsigned long time = micros();
  checkSensors();

  if ((time - time_ref >= 1000000)) 
  {
    transmitData();
    time_ref = micros();
  }
}

// Checks sensors when a transmission is not being sent
// Sends a distress signal if the SOS button is pressed or the ppm is above the threshold
void checkSensors()
{
  int sensor_val = analogRead(sensor_pin);
  float voltage = 5 * sensor_val / 1024;
  float ppm = 605.18 * pow(((1/6.7) * ((5 - voltage) / voltage)), -2.052); // Formula for ppm of LPG

  int sos = !digitalRead(sos_pin);

  if (ppm > ppm_thresh | sos)
  {
    distressSignal();
  }
}

// Transmits sensor data to the dashboard receiver using the RF transmitter
// Checks the sensor values and packages it to be sent to the dashboard
void transmitData()
{
  int sensor_val = analogRead(sensor_pin);
  float voltage = 5 * sensor_val / 1024;
  uint8_t msg_len = 7; // 7 bytes are being sent
  uint8_t msg[msg_len]; // format: id, gas ppm, sos, seq

  msg[0] = id;
  
  union { 
    float value;
    uint8_t bytes[4];
  } ppm;

  ppm.value = 605.18 * pow(((1/6.7) * ((5 - voltage) / voltage)), -2.052);
  
  for (int i = 0; i < sizeof(ppm); i++)
  {
    msg[i + 1] = ppm.bytes[i];
  }
  
  uint8_t sos = sos_on;
  msg[5] = sos;

  seq++;
  msg[6] = seq;
  
  driver.send(&msg[0], msg_len);
  driver.waitPacketSent();
  delay(100);
}

// Sends a distress signal containing the ID of the user
// Turns on an indicator LED to indicate the SOS button has been successfully been pressed
// or the ppm of gas is above the threshold
void distressSignal() 
{
  uint8_t msg_len = 1; // 1 byte is being sent
  uint8_t msg[1] = {id}; // format: id

  if (!sos_on)
  {
    sos_on = true;
    digitalWrite(self_led_pin, HIGH);
  }

  driver.send(msg, msg_len);
  driver.waitPacketSent();
}
