// ===== PKRU Air Quality — ค่าเชื่อมต่อ (ใช้ร่วมกันทั้ง index.html และ dashboard.html) =====
// ✏️ แก้ค่าตรงนี้ที่เดียว

// ---------- 1) Aerolink API (แหล่งข้อมูลหลัก) ----------
// ⚠️ URL แบบ trycloudflare.com จะเปลี่ยนทุกครั้งที่เพื่อน (kitti) รัน docker compose ใหม่
//    → ขอ URL ล่าสุดจากเพื่อนแล้วแก้ baseUrl บรรทัดเดียว
//    → ทดสอบ URL ใหม่ได้ทันทีโดยไม่ต้องแก้ไฟล์: เปิด dashboard.html?api=https://xxxx.trycloudflare.com
//      (เว็บจะจำค่านี้ไว้ในเบราว์เซอร์นั้น — ล้างค่าได้ด้วย ?api=reset)
// ⚠️ API อนุญาต CORS เฉพาะ https://pqlmm.github.io — เปิดไฟล์ตรงๆ (file://) จะดึงข้อมูลไม่ได้
// ตั้ง baseUrl เป็น '' เพื่อปิดการใช้ API (จะกลับไปใช้ MQTT ด้านล่าง)
window.PKRU_API_CONFIG = {
    baseUrl: 'https://stretch-civilization-extraction-compatible.trycloudflare.com',
    pollMs: 30000,          // ดึงค่าล่าสุดทุก 30 วินาที (เซนเซอร์ส่งทุก ~30 วินาทีอยู่แล้ว)
    timeoutMs: 15000,
    staleMinutes: 10,       // ค่าที่เก่ากว่านี้ถือว่า "ไม่ได้อัปเดต"
    // จับคู่ device_id ของ API → จุดบนแผนที่ของเว็บเรา
    devices: {
        'esp32-sci': 'node2',   // คณะวิทยาศาสตร์และเทคโนโลยี
        'esp32-hss': 'node3',   // คณะมนุษยศาสตร์และสังคมศาสตร์
        'esp32-fms': 'node4',   // คณะวิทยาการจัดการ
    },
    // true = ใช้พิกัดจาก /api/buildings แทนพิกัดในเว็บ (ตอนนี้พิกัดใน API ยังคลาดไปทางใต้ ~3 กม. จึงปิดไว้)
    useApiCoordinates: false,
};

// ---------- 2) MQTT (สำรอง — ใช้เมื่อ baseUrl ว่าง) ----------
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
