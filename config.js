// ===== PKRU Air Quality — ค่าเชื่อมต่อ MQTT (ใช้ร่วมกันทั้ง index.html และ dashboard.html) =====
// ✏️ แก้ค่าตรงนี้ที่เดียว
//
// หัวข้อ (topic) ที่หน้าเว็บรับได้ มี 2 แบบ:
//   1) {topicPrefix}/{nodeId}            ส่ง JSON  เช่น  sensor/node2  →  {"pm25":18.2,"temperature":30.1,"humidity":78}
//   2) {topicPrefix}/{nodeId}/{ค่า}       ส่งตัวเลข เช่น  sensor/node2/pm25  →  18.2
//      (ค่า = pm25 | temperature หรือ temp | humidity หรือ hum)
// nodeId ของแต่ละคณะ: node2 = วิทยาศาสตร์ฯ, node3 = มนุษยศาสตร์ฯ, node4 = วิทยาการจัดการ
window.PKRU_MQTT_CONFIG = {
    host: 'broker.hivemq.com',
    port: 8884,          // พอร์ต WebSocket แบบปลอดภัย (wss) — เบราว์เซอร์ต่อ MQTT ตรงไม่ได้ ต้องผ่าน WebSocket
    protocol: 'wss',
    path: '/mqtt',
    username: '',
    password: '',
    topicPrefix: 'sensor',
};
