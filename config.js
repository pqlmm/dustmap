// ===== PKRU Air Quality — ค่าเชื่อมต่อ MQTT (ใช้ร่วมกันทั้ง index.html และ dashboard.html) =====
// ✏️ แก้ค่าตรงนี้ที่เดียว
//
// หัวข้อ (topic) ที่หน้าเว็บรับได้ มี 2 แบบ:
//   1) {topicPrefix}/{nodeId}            ส่ง JSON  เช่น  sensor/node2  →  {"pm25":18.2,"temperature":30.1,"humidity":78}
//   2) {topicPrefix}/{nodeId}/{ค่า}       ส่งตัวเลข เช่น  sensor/node2/pm25  →  18.2
//      (ค่า = pm25 | temperature หรือ temp | humidity หรือ hum)
// nodeId ของแต่ละคณะ: node2 = วิทยาศาสตร์ฯ, node3 = มนุษยศาสตร์ฯ, node4 = วิทยาการจัดการ
window.PKRU_MQTT_CONFIG = {
    // test.mosquitto.org — broker ทดสอบสาธารณะของ Eclipse Mosquitto
    //   ESP32 / MQTT Explorer ใช้  mqtt://test.mosquitto.org:1883
    //   หน้าเว็บ (เบราว์เซอร์) ต้องใช้ WebSocket → wss://test.mosquitto.org:8081
    host: 'test.mosquitto.org',
    port: 8081,          // WebSocket แบบเข้ารหัส (wss) — ใช้ได้ทั้งเปิดไฟล์ในเครื่องและบน GitHub Pages (https)
    protocol: 'wss',
    path: '/mqtt',
    username: '',
    password: '',
    topicPrefix: 'sensor',
};
