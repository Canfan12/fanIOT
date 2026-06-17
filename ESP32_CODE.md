# Kode Program ESP32 IoT Node

```cpp
//Firebase Realtime Database

#if defined(ESP32)
  #include <WiFi.h> // Library WiFi untuk ESP32
#elif defined(ESP8266)
  #include <ESP8266WiFi.h> // Library WiFi untuk ESP8266
#endif

#include <Firebase_ESP_Client.h> // Library utama untuk koneksi ke Firebase
#include <addons/TokenHelper.h>  // Helper untuk manajemen token Firebase
#include <addons/RTDBHelper.h>   // Helper untuk Realtime Database
#include "DHT.h"                 // Library untuk sensor suhu & kelembapan DHT

// ================= PENGATURAN WIFI & FIREBASE =================
#define WIFI_SSID ""      // Masukkan nama WiFi (SSID)
#define WIFI_PASSWORD ""  // Masukkan password WiFi

#define API_KEY ""        // Firebase Web API Key
#define DATABASE_URL ""   // URL Firebase Realtime Database
#define USER_EMAIL ""     // Email user Firebase Auth (Jika ada)
#define USER_PASSWORD ""  // Password user Firebase Auth (Jika ada)

// ================= KONFIGURASI PIN & HARDWARE =================
#if defined(ESP32)
  #define RELAY1 5
  #define RELAY2 18
  #define RELAY3 19
  #define RELAY4 23
  #define DHTPIN 4
#elif defined(ESP8266)
  #define RELAY1 5  // D1
  #define RELAY2 4  // D2
  #define RELAY3 0  // D3
  #define RELAY4 2  // D4
  #define DHTPIN 14 // D5
#endif

#define DHTTYPE DHT11       // Jenis sensor DHT yang digunakan (DHT11/DHT22)
DHT dht(DHTPIN, DHTTYPE);   // Inisialisasi onjek sensor DHT

// ================= LOGIKA RELAY (ACTIVE LOW) =================
#define RELAY_ON LOW   // Konfigurasi menyalakan relay (active low)
#define RELAY_OFF HIGH // Konfigurasi mematikan relay (active low)

// ================= OBJEK FIREBASE =================
FirebaseData fbdo;       // Objek data firebase
FirebaseAuth auth;       // Objek autentikasi firebase
FirebaseConfig config;   // Objek konfigurasi firebase

// ================= VARIABEL TIMER =================
unsigned long previousMillisDHT = 0;
unsigned long previousMillisFirebase = 0;

const long intervalDHT = 5000;      // Baca DHT tiap 5 detik
const long intervalFirebase = 200;  // Cek Firebase tiap 0.2 detik agar variasi pergerakan cepat tidak terlewat

void setup() {
  Serial.begin(115200); // Mulai komunikasi serial
  
  // Inisialisasi Pin Relay sebagai Output
  pinMode(RELAY1, OUTPUT);
  pinMode(RELAY2, OUTPUT);
  pinMode(RELAY3, OUTPUT);
  pinMode(RELAY4, OUTPUT);
  
  // Matikan semua relay di awal
  matikanSemuaRelay();

  dht.begin(); // Mulai sensor DHT

  // Koneksi WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Koneksi ke Wi-Fi");
  
  // Cek koneksi wifi dengan batas iterasi agar tidak stuck bila wifi mati
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    Serial.print(".");
    delay(500);
    attempts++;
  }

  if(WiFi.status() == WL_CONNECTED) {
    Serial.println("\nTerhubung ke Wi-Fi!");
  } else {
    Serial.println("\nGagal terhubung Wifi. Cek SSID dan Password.");
  }

  // Konfigurasi Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  // Optimasi timeout untuk token request
  config.timeout.wifiReconnect = 10 * 1000;
  config.timeout.socketConnection = 10 * 1000;

  config.token_status_callback = tokenStatusCallback;

  Firebase.begin(&config, &auth); // Mulai koneksi Firebase
  Firebase.reconnectWiFi(true);   // Reconnect otomatis jika WiFi putus
}

void loop() {
  unsigned long currentMillis = millis();

  // ================= BACA SENSOR DHT =================
  if (currentMillis - previousMillisDHT >= intervalDHT) {
    previousMillisDHT = currentMillis;

    float h = dht.readHumidity();    // Baca kelembapan
    float t = dht.readTemperature(); // Baca suhu (Celcius)

    if (!isnan(h) && !isnan(t)) {
      Serial.printf("Suhu: %.2f C | Kelembapan: %.2f %%\n", t, h);
      if (Firebase.ready()) { // Pastikan firebase siap sebelum kirim data
        Firebase.RTDB.setFloat(&fbdo, "/IoT/Suhu", t);        // Kirim suhu ke database
        Firebase.RTDB.setFloat(&fbdo, "/IoT/Kelembapan", h);  // Kirim kelembapan ke database
      }
    } else {
      Serial.println("Gagal membaca DHT!");
    }
  }

  // ================= CEK STATUS RELAY DARI FIREBASE =================
  if (currentMillis - previousMillisFirebase >= intervalFirebase) {
    previousMillisFirebase = currentMillis;

    if (Firebase.ready()) { // Pastikan firebase siap sebelum terima data
      bool r1 = false, r2 = false, r3 = false, r4 = false;

      // Ambil data status relay terbaru dari database
      if (Firebase.RTDB.getBool(&fbdo, "/IoT/Relay1")) r1 = fbdo.boolData();
      if (Firebase.RTDB.getBool(&fbdo, "/IoT/Relay2")) r2 = fbdo.boolData();
      if (Firebase.RTDB.getBool(&fbdo, "/IoT/Relay3")) r3 = fbdo.boolData();
      if (Firebase.RTDB.getBool(&fbdo, "/IoT/Relay4")) r4 = fbdo.boolData();

      // Update pin relay sesuai status dari Firebase
      digitalWrite(RELAY1, r1 ? RELAY_ON : RELAY_OFF);
      digitalWrite(RELAY2, r2 ? RELAY_ON : RELAY_OFF);
      digitalWrite(RELAY3, r3 ? RELAY_ON : RELAY_OFF);
      digitalWrite(RELAY4, r4 ? RELAY_ON : RELAY_OFF);
    }
  }
}

// ================= FUNGSI BANTUAN =================
void matikanSemuaRelay() {
  digitalWrite(RELAY1, RELAY_OFF);
  digitalWrite(RELAY2, RELAY_OFF);
  digitalWrite(RELAY3, RELAY_OFF);
  digitalWrite(RELAY4, RELAY_OFF);
}
```
