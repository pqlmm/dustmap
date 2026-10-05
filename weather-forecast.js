// ===== PKRU Air Quality — พยากรณ์อากาศและฝุ่น PM2.5 หน้าแรก =====
// ข้อมูล:
//   - เซนเซอร์ มรภ. (Aerolink API → InfluxDB): PM2.5, PM10, อุณหภูมิ, ความชื้น ล่าสุด + ย้อนหลัง 14 วัน
//   - Open-Meteo (ฟรี ไม่ต้องใช้ key): ลม ฝน UV สภาพท้องฟ้า และ PM2.5 จากแบบจำลอง CAMS
//   - พยากรณ์ PM2.5: pm25-forecast.js (ผสมข้อมูลเซนเซอร์ย้อนหลังกับ Open-Meteo ที่ปรับสเกลแล้ว)
// ✏️ ปรับค่าได้ที่ FORECAST_CONFIG ด้านล่าง
// ลบส่วนนี้ออก: ลบ <section class="forecast-section"> และบรรทัดที่โหลด weather-forecast.css, pm25-forecast.js, weather-forecast.js ใน index.html
(function () {
    'use strict';

    const FORECAST_CONFIG = {
        lat: 7.9126,              // มรภ.ภูเก็ต (จุดเดียวกับที่แดชบอร์ดใช้เปรียบเทียบ)
        lng: 98.3872,
        days: 5,                  // จำนวนวันในแท็บ
        slots: 9,                 // จำนวนช่องรายชั่วโมงที่แสดง
        historyDays: 14,          // ดึงข้อมูลเซนเซอร์ย้อนหลังกี่วันมาใช้พยากรณ์
        refreshMinutes: 30,       // ดึงพยากรณ์อากาศ / ข้อมูลย้อนหลังใหม่ทุกกี่นาที
        latestSeconds: 60,        // ดึงค่าล่าสุดจากเซนเซอร์ทุกกี่วินาที
        cacheKey: 'pkru_forecast_v2',
        historyCacheKey: 'pkru_pm_history_v1',
    };

    const root = document.getElementById('pkruForecast');
    if (!root) return;
    const API = window.PKRU_API || { enabled: false };
    const MODEL = window.PKRU_PM_FORECAST || null;
    const HOUR = 3600e3;

    // ---------- ภาษา ----------
    const lang = () => (window.PKRU_LANG === 'en' ? 'en' : 'th');
    const TXT = {
        th: {
            badge: 'พยากรณ์อากาศและฝุ่น', title: 'คุณภาพอากาศรอบมหาวิทยาลัย',
            sub: 'ค่าจริงจากเซนเซอร์ มรภ.ภูเก็ต พร้อมพยากรณ์ PM2.5 และสภาพอากาศล่วงหน้า 5 วัน',
            today: 'วันนี้', hourly: 'พยากรณ์รายชั่วโมง', hourlyDay: 'พยากรณ์ทั้งวัน',
            feels: 'รู้สึกเหมือน', wind: 'ลม', humidity: 'ความชื้น', uv: 'ดัชนี UV', rain: 'โอกาสฝน',
            temp: 'อุณหภูมิ', pm10: 'PM10', pmMax: 'PM2.5 สูงสุด', avgDay: 'ค่าเฉลี่ยทั้งวัน', peakAt: 'สูงสุด',
            now: 'ตอนนี้', measured: 'วัดจริง', sensor: 'เซนเซอร์ มรภ.', estimate: 'ค่าประมาณ Open-Meteo',
            modePm: 'PM2.5', modeTemp: 'อุณหภูมิ', band: 'แถบจาง = ช่วงที่ค่าน่าจะอยู่ (80%)', watch: 'เกณฑ์เฝ้าระวัง 37.5',
            loading: 'กำลังโหลดพยากรณ์…', error: 'โหลดพยากรณ์อากาศไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', retry: 'ลองอีกครั้ง',
            mBlend: (d, r) => `พยากรณ์ PM2.5 จากข้อมูลเซนเซอร์ย้อนหลัง ${d} วัน (InfluxDB) ร่วมกับแบบจำลอง Open-Meteo ที่ปรับให้ตรงกับเซนเซอร์ของเรา (×${r})`,
            mLocal: d => `พยากรณ์ PM2.5 จากรูปแบบข้อมูลเซนเซอร์ย้อนหลัง ${d} วัน (InfluxDB)`,
            mOm: 'ยังใช้ข้อมูลเซนเซอร์พยากรณ์ไม่ได้ — PM2.5 ล่วงหน้าเป็นค่าประมาณจาก Open-Meteo',
            mWait: 'กำลังดึงข้อมูลย้อนหลังจากเซนเซอร์เพื่อพยากรณ์ PM2.5…',
            acc: (mae, pct) => `ทดสอบย้อนหลัง: คลาดเคลื่อนเฉลี่ย ±${mae} µg/m³ ใน 24 ชม. ข้างหน้า` + (pct > 0 ? ` (แม่นกว่าการใช้ค่าล่าสุดคงที่ ${pct}%)` : ''),
            sources: 'PM2.5 · PM10 · อุณหภูมิ · ความชื้น จากเซนเซอร์ มรภ. — ลม ฝน UV และสภาพท้องฟ้าจาก Open-Meteo',
            sourcesOff: 'เชื่อมต่อเซนเซอร์ไม่ได้ ค่าทั้งหมดเป็นค่าประมาณจาก Open-Meteo',
            days: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'],
            mmh: 'มม./ชม.', ms: 'ม./วิ',
            dirs: ['เหนือ', 'ตอ.เฉียงเหนือ', 'ตะวันออก', 'ตอ.เฉียงใต้', 'ใต้', 'ตต.เฉียงใต้', 'ตะวันตก', 'ตต.เฉียงเหนือ'],
            levels: ['ดีมาก', 'ดี', 'ปานกลาง', 'เริ่มมีผลกระทบ', 'มีผลต่อสุขภาพ'],
            advice: ['ทำกิจกรรมกลางแจ้งได้ตามปกติ', 'ทำกิจกรรมกลางแจ้งได้ตามปกติ', 'ผู้มีโรคประจำตัวควรระวัง', 'ควรสวมหน้ากากอนามัย', 'งดกิจกรรมกลางแจ้ง ปิดหน้าต่าง'],
        },
        en: {
            badge: 'Air & weather forecast', title: 'Air quality around campus',
            sub: 'Live readings from the PKRU sensors with a 5-day PM2.5 and weather forecast',
            today: 'Today', hourly: 'Hourly forecast', hourlyDay: 'Forecast for the day',
            feels: 'Feels like', wind: 'Wind', humidity: 'Humidity', uv: 'UV Index', rain: 'Chance of rain',
            temp: 'Temperature', pm10: 'PM10', pmMax: 'Peak PM2.5', avgDay: 'Daily average', peakAt: 'Peak',
            now: 'Now', measured: 'measured', sensor: 'PKRU sensors', estimate: 'Open-Meteo estimate',
            modePm: 'PM2.5', modeTemp: 'Temperature', band: 'Shaded band = likely range (80%)', watch: 'Watch level 37.5',
            loading: 'Loading the forecast…', error: 'Could not load the forecast. Check your connection and try again.', retry: 'Try again',
            mBlend: (d, r) => `PM2.5 forecast from ${d} days of sensor history (InfluxDB) combined with the Open-Meteo model scaled to our sensors (×${r})`,
            mLocal: d => `PM2.5 forecast from the pattern in ${d} days of sensor history (InfluxDB)`,
            mOm: 'Sensor data is not available for forecasting yet — upcoming PM2.5 is an Open-Meteo estimate',
            mWait: 'Fetching sensor history to forecast PM2.5…',
            acc: (mae, pct) => `Back-test: average error ±${mae} µg/m³ over the next 24 h` + (pct > 0 ? ` (${pct}% better than repeating the latest value)` : ''),
            sources: 'PM2.5 · PM10 · temperature · humidity from the PKRU sensors — wind, rain, UV and sky from Open-Meteo',
            sourcesOff: 'The sensors cannot be reached, so every value is an Open-Meteo estimate',
            days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            mmh: 'mm/h', ms: 'm/s',
            dirs: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
            levels: ['Very good', 'Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy'],
            advice: ['Outdoor activities are fine', 'Outdoor activities are fine', 'People with health conditions should take care', 'Wear a face mask', 'Avoid outdoor activities and close windows'],
        },
    };
    const t = k => TXT[lang()][k];

    // ---------- เกณฑ์ PM2.5 (เหมือนแดชบอร์ด) ----------
    const PM_COLORS = ['#22d3ee', '#10b981', '#eab308', '#f97316', '#f43f5e'];
    const pmLevel = v => (v <= 15 ? 0 : v <= 25 ? 1 : v <= 37.5 ? 2 : v <= 75 ? 3 : 4);
    const pmColor = v => PM_COLORS[pmLevel(v)];

    const WMO = {
        0: ['ท้องฟ้าแจ่มใส', 'Clear Sky', 'clear'],
        1: ['เมฆเล็กน้อย', 'Mainly Clear', 'partly'],
        2: ['เมฆบางส่วน', 'Partly Cloudy', 'partly'],
        3: ['เมฆมาก', 'Overcast', 'cloud'],
        45: ['หมอก', 'Fog', 'fog'], 48: ['หมอกน้ำแข็ง', 'Rime Fog', 'fog'],
        51: ['ฝนปรอยเล็กน้อย', 'Light Drizzle', 'drizzle'], 53: ['ฝนปรอย', 'Drizzle', 'drizzle'], 55: ['ฝนปรอยหนาแน่น', 'Dense Drizzle', 'drizzle'],
        56: ['ฝนปรอยเยือกแข็ง', 'Freezing Drizzle', 'drizzle'], 57: ['ฝนปรอยเยือกแข็ง', 'Freezing Drizzle', 'drizzle'],
        61: ['ฝนเล็กน้อย', 'Light Rain', 'rain'], 63: ['ฝนปานกลาง', 'Moderate Rain', 'rain'], 65: ['ฝนหนัก', 'Heavy Rain', 'heavy'],
        66: ['ฝนเยือกแข็ง', 'Freezing Rain', 'rain'], 67: ['ฝนเยือกแข็งหนัก', 'Heavy Freezing Rain', 'heavy'],
        71: ['หิมะเล็กน้อย', 'Light Snow', 'cloud'], 73: ['หิมะ', 'Snow', 'cloud'], 75: ['หิมะหนัก', 'Heavy Snow', 'cloud'], 77: ['เกล็ดหิมะ', 'Snow Grains', 'cloud'],
        80: ['ฝนตกเป็นช่วง', 'Rain Showers', 'shower'], 81: ['ฝนตกเป็นช่วงปานกลาง', 'Moderate Showers', 'shower'], 82: ['ฝนตกหนักเป็นช่วง', 'Violent Showers', 'heavy'],
        85: ['หิมะตกเป็นช่วง', 'Snow Showers', 'cloud'], 86: ['หิมะตกหนักเป็นช่วง', 'Heavy Snow Showers', 'cloud'],
        95: ['พายุฝนฟ้าคะนอง', 'Thunderstorm', 'thunder'], 96: ['พายุฝนฟ้าคะนอง ลูกเห็บ', 'Thunderstorm, Hail', 'thunder'], 99: ['พายุฝนฟ้าคะนองรุนแรง', 'Severe Thunderstorm', 'thunder'],
    };
    const wmo = code => WMO[code] || WMO[Math.floor(code / 10) * 10] || ['--', '--', 'cloud'];
    const describe = code => wmo(code)[lang() === 'en' ? 1 : 0];

    // ---------- ไอคอน (SVG วาดเอง) ----------
    const SUN = '<circle cx="24" cy="24" r="8" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"><path d="M24 7v4M24 37v4M7 24h4M37 24h4M12 12l2.8 2.8M33.2 33.2 36 36M12 36l2.8-2.8M33.2 14.8 36 12"/></g>';
    const MOON = '<path d="M30 9a14 14 0 1 0 9 22A12 12 0 0 1 30 9z" fill="#c7d2fe"/>';
    const CLOUD = (x = 0, y = 0, fill = '#fff') => `<path transform="translate(${x} ${y})" d="M15 38h20a8 8 0 0 0 .6-16A11 11 0 0 0 14.4 25 6.6 6.6 0 0 0 15 38z" fill="${fill}" stroke="#94a3b8" stroke-width="1.4" stroke-linejoin="round"/>`;
    const DROPS = (n, color = '#3b82f6') => `<g stroke="${color}" stroke-width="2.4" stroke-linecap="round">${[17, 25, 33].slice(0, n).map(x => `<path d="M${x} 41l-2 5"/>`).join('')}</g>`;
    function icon(code, isDay = 1) {
        const kind = wmo(code)[2];
        const orb = isDay ? `<g transform="translate(-6 -7) scale(.8)">${SUN}</g>` : `<g transform="translate(-4 -6) scale(.8)">${MOON}</g>`;
        let body;
        switch (kind) {
            case 'clear': body = isDay ? SUN : `<g transform="translate(-2 0)">${MOON}</g>`; break;
            case 'partly': body = orb + CLOUD(2, 1); break;
            case 'fog': body = CLOUD(0, -4) + '<g stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round"><path d="M10 40h28M14 45h20"/></g>'; break;
            case 'drizzle': body = CLOUD(0, -6) + DROPS(2, '#60a5fa'); break;
            case 'rain': body = CLOUD(0, -6) + DROPS(3); break;
            case 'shower': body = orb + CLOUD(2, -5) + DROPS(2); break;
            case 'heavy': body = CLOUD(0, -6, '#e2e8f0') + DROPS(3, '#1d4ed8'); break;
            case 'thunder': body = CLOUD(0, -6, '#e2e8f0') + '<path d="M25 33l-5 8h5l-3 7 8-10h-5l3-5z" fill="#facc15" stroke="#ca8a04" stroke-width=".8"/>'; break;
            default: body = CLOUD(-4, -4, '#f1f5f9') + CLOUD(3, 1);
        }
        return `<svg class="fc-icon" viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
    }
    const TILE_ICON = {
        wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
        humidity: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
        visibility: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        pressure: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/>',
        uv: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
        dew: '<path d="M12 4s-5 6-5 9.5a5 5 0 0 0 10 0C17 10 12 4 12 4z"/>',
    };
    const tileIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TILE_ICON[k]}</svg>`;
    Object.assign(TILE_ICON, {
        temp: '<path d="M10 4a2 2 0 1 1 4 0v10a4 4 0 1 1-4 0z"/>',
        pm10: '<circle cx="7" cy="8" r="2"/><circle cx="16" cy="7" r="2.5"/><circle cx="9" cy="16" r="2.5"/><circle cx="17" cy="16" r="1.5"/>',
        rain: '<path d="M7 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.5 2 3.5 3.5 0 0 1-1 6.9"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
    });

    // ---------- เวลา (Asia/Bangkok) ----------
    const bkkParts = ms => new Date(ms + 7 * HOUR).toISOString(); // "2026-10-04T17:00:00.000Z" (เวลาไทย)
    const bkkIso = ms => bkkParts(ms).slice(0, 16);               // "2026-10-04T17:00"
    const isoToMs = iso => Date.parse(`${iso}:00+07:00`);
    const hourOf = iso => +iso.slice(11, 13);
    function hourLabel(iso) {
        const h = hourOf(iso);
        if (lang() === 'th') return `${String(h).padStart(2, '0')}:00`;
        if (h === 0) return '12 a.m';
        if (h === 12) return '12 p.m';
        return h < 12 ? `${h} a.m` : `${h - 12} p.m`;
    }
    function clockLabel() {
        const d = new Date();
        return lang() === 'th'
            ? d.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) + ' น.'
            : d.toLocaleTimeString('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', minute: '2-digit' });
    }
    function dayName(dateStr, i) {
        if (i === 0) return t('today');
        const [y, m, d] = dateStr.split('-').map(Number);
        return t('days')[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    }
    function dateLabel(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang() === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' });
    }

    // ---------- ตัวช่วย ----------
    const num = v => typeof v === 'number' && Number.isFinite(v);
    const r0 = v => (num(v) ? Math.round(v) : '--');
    const r1 = v => (num(v) ? v.toFixed(1) : '--');
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const compass = deg => (num(deg) ? t('dirs')[Math.round(deg / 45) % 8] : '');
    const avg = arr => { const a = arr.filter(num); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };

    // ---------- ดึงข้อมูล Open-Meteo ----------
    const HOURLY = 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m,wind_direction_10m,uv_index';
    const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,uv_index,precipitation_probability';
    const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max';

    async function getJSON(url) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
            const res = await fetch(url, { signal: ctrl.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } finally { clearTimeout(timer); }
    }

    async function loadOpenMeteo() {
        const { lat, lng, days } = FORECAST_CONFIG;
        const base = `latitude=${lat}&longitude=${lng}&timezone=Asia%2FBangkok&forecast_days=${days}`;
        const [wx, aq] = await Promise.all([
            getJSON(`https://api.open-meteo.com/v1/forecast?${base}&wind_speed_unit=ms&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}`),
            // past_days=7 → ใช้เทียบกับเซนเซอร์เพื่อปรับสเกล
            getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${base}&past_days=7&hourly=pm2_5,pm10`).catch(() => null),
        ]);
        if (!wx || !wx.hourly || !Array.isArray(wx.hourly.time) || !wx.daily) throw new Error('bad data');
        return { wx, aq, at: Date.now() };
    }

    // ---------- ดึงข้อมูลเซนเซอร์ (ผ่าน api.js เดิม) ----------
    async function loadHistory() {
        const res = await API.history(FORECAST_CONFIG.historyDays * 24, { fields: ['pm25'] });
        // เก็บแค่ค่าเฉลี่ยทั้งวิทยาเขตรายชั่วโมง (เล็กพอจะจำไว้ในเบราว์เซอร์)
        const hourly = MODEL ? MODEL.campusHourly(res.rows) : new Map();
        return { rows: [...hourly].map(([tt, v]) => ({ nodeId: 'campus', t: tt, pm25: v })), at: Date.now() };
    }

    function readCache(key, maxAgeMin) {
        try {
            const c = JSON.parse(localStorage.getItem(key) || 'null');
            if (c && c.at && Date.now() - c.at < maxAgeMin * 60000) return c;
        } catch { /* ignore */ }
        return null;
    }
    function writeCache(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    }

    // ---------- สถานะ ----------
    const state = {
        om: null,             // { wx, aq }
        history: null,        // { rows }
        latest: null,         // { pm25, pm10, temperature, humidity, time }
        sensor: API.enabled ? 'loading' : 'off',   // 'loading' | 'ok' | 'off'
        historyState: API.enabled && MODEL ? 'loading' : 'off',
        fc: null,             // ผลจาก pm25-forecast.js
        selected: 0,
        mode: 'pm',           // 'pm' | 'temp'
    };

    function rebuildForecast() {
        if (!state.om) return;
        const aq = state.om.aq && state.om.aq.hourly;
        const om = aq ? aq.time.map((iso, i) => ({ t: isoToMs(iso), v: aq.pm2_5?.[i] })) : [];
        const rows = (state.history ? state.history.rows : []).slice();
        if (state.latest && num(state.latest.pm25) && state.latest.time) rows.push({ nodeId: 'campus-now', t: state.latest.time, pm25: state.latest.pm25 });
        if (!MODEL) { state.fc = null; return; }
        state.fc = MODEL.build({ rows, om, now: Date.now(), hours: FORECAST_CONFIG.days * 24 + 24 });
    }

    // PM2.5 ที่ชั่วโมงหนึ่ง: ค่าจริง (ถ้ามี) → พยากรณ์ → Open-Meteo ดิบ
    function pmAt(ms) {
        const fc = state.fc;
        if (fc) {
            const obs = fc.observed.get(ms);
            if (num(obs) && ms <= Date.now()) return { v: obs, measured: true };
            const p = fc.points.find(x => x.t === ms);
            if (p) return { v: p.v, lo: p.lo, hi: p.hi };
        }
        const aq = state.om && state.om.aq && state.om.aq.hourly;
        if (aq) {
            const i = aq.time.indexOf(bkkIso(ms));
            if (i >= 0 && num(aq.pm2_5?.[i])) return { v: aq.pm2_5[i], raw: true };
        }
        return null;
    }
    function pm10Now() {
        if (state.sensor === 'ok' && state.latest && num(state.latest.pm10)) return state.latest.pm10;
        const aq = state.om && state.om.aq && state.om.aq.hourly;
        if (!aq) return null;
        const i = aq.time.indexOf(bkkIso(Math.floor(Date.now() / HOUR) * HOUR));
        return i >= 0 ? aq.pm10?.[i] : null;
    }

    function hourlyRow(i) {
        const h = state.om.wx.hourly;
        const iso = h.time[i];
        const ms = isoToMs(iso);
        return {
            time: iso, ms,
            temp: h.temperature_2m?.[i], pop: h.precipitation_probability?.[i], rain: h.precipitation?.[i],
            code: h.weather_code?.[i], isDay: h.is_day?.[i] ?? 1, hum: h.relative_humidity_2m?.[i],
            wind: h.wind_speed_10m?.[i], windDir: h.wind_direction_10m?.[i], uv: h.uv_index?.[i],
            pm: pmAt(ms),
        };
    }

    function rowsFor(dayIndex) {
        const h = state.om.wx.hourly;
        const date = state.om.wx.daily.time[dayIndex];
        const n = FORECAST_CONFIG.slots;
        const out = [];
        if (dayIndex === 0) {
            const nowIso = bkkIso(Math.floor(Date.now() / HOUR) * HOUR);
            let start = h.time.findIndex(x => x >= nowIso);
            if (start < 0) start = 0;
            for (let i = start; i < h.time.length && out.length < n; i++) out.push(hourlyRow(i));
            // ช่องแรก = ตอนนี้: ใช้ค่าจริงจากเซนเซอร์
            if (out[0] && state.sensor === 'ok' && state.latest) {
                if (num(state.latest.pm25)) out[0].pm = { v: state.latest.pm25, measured: true };
                if (num(state.latest.temperature)) out[0].temp = state.latest.temperature;
                out[0].isNow = true;
            } else if (out[0]) out[0].isNow = true;
        } else {
            const start = h.time.indexOf(`${date}T00:00`);
            for (let k = 0; k < n; k++) {
                const i = start + k * 3;
                if (start < 0 || i >= h.time.length) break;
                out.push(hourlyRow(i));
            }
        }
        return out;
    }

    function dayPm(dayIndex) {
        const date = state.om.wx.daily.time[dayIndex];
        const vals = [];
        for (let hh = 0; hh < 24; hh++) {
            const ms = isoToMs(`${date}T${String(hh).padStart(2, '0')}:00`);
            const p = pmAt(ms);
            if (p && num(p.v)) vals.push({ ms, v: p.v });
        }
        if (!vals.length) return null;
        const peak = vals.reduce((a, b) => (b.v > a.v ? b : a));
        return { mean: avg(vals.map(x => x.v)), max: peak.v, peakIso: bkkIso(peak.ms) };
    }

    function summaryFor(dayIndex) {
        const d = state.om.wx.daily;
        const date = d.time[dayIndex];
        const h = state.om.wx.hourly;
        if (dayIndex === 0) {
            const c = state.om.wx.current || {};
            const live = state.sensor === 'ok' && state.latest;
            const nowPm = live && num(state.latest.pm25) ? state.latest.pm25 : (pmAt(Math.floor(Date.now() / HOUR) * HOUR) || {}).v;
            return {
                today: true, date, live: !!live, code: c.weather_code, isDay: c.is_day ?? 1,
                pm: nowPm,
                temp: live && num(state.latest.temperature) ? state.latest.temperature : c.temperature_2m,
                feels: c.apparent_temperature,
                hum: live && num(state.latest.humidity) ? state.latest.humidity : c.relative_humidity_2m,
                pm10: pm10Now(),
                wind: c.wind_speed_10m, windDir: c.wind_direction_10m, uv: c.uv_index,
                pop: num(c.precipitation_probability) ? c.precipitation_probability : h.precipitation_probability?.[h.time.indexOf(bkkIso(Math.floor(Date.now() / HOUR) * HOUR))],
            };
        }
        let i = h.time.indexOf(`${date}T13:00`);
        if (i < 0) i = h.time.findIndex(x => x.startsWith(date));
        const dp = dayPm(dayIndex);
        return {
            today: false, date, code: d.weather_code?.[dayIndex], isDay: 1,
            pm: dp ? dp.mean : null, pmMax: dp ? dp.max : null, peakIso: dp ? dp.peakIso : null,
            tMax: d.temperature_2m_max?.[dayIndex], tMin: d.temperature_2m_min?.[dayIndex],
            hum: h.relative_humidity_2m?.[i], wind: h.wind_speed_10m?.[i], windDir: h.wind_direction_10m?.[i],
            uv: d.uv_index_max?.[dayIndex], pop: d.precipitation_probability_max?.[dayIndex],
        };
    }

    // ---------- วาดหน้า ----------
    const header = () => `<div class="fc-head">
        <div class="section-badge">${t('badge')}</div>
        <h2 class="section-heading" id="forecastTitle">${t('title')}</h2>
        <p class="section-subtext">${t('sub')}</p>
    </div>`;
    const renderShell = inner => { root.innerHTML = header() + inner; };
    const renderLoading = () => renderShell(`<div class="fc-state" role="status">${t('loading')}</div>`);
    function renderError() {
        renderShell(`<div class="fc-state fc-error" role="alert"><span>${t('error')}</span><button type="button" class="fc-retry">${t('retry')}</button></div>`);
        root.querySelector('.fc-retry').addEventListener('click', () => refreshOpenMeteo(true));
    }

    function smoothPath(pts, W) {
        if (!pts.length) return '';
        const all = [[0, pts[0][1]], ...pts, [W, pts[pts.length - 1][1]]];
        let d = `M${all[0][0]},${all[0][1].toFixed(1)}`;
        for (let i = 0; i < all.length - 1; i++) {
            const p0 = all[i - 1] || all[i], p1 = all[i], p2 = all[i + 1], p3 = all[i + 2] || p2;
            const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
            const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
            d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
        }
        return d;
    }

    function chartSvg(rows) {
        const W = 900, H = 240, top = 30, bottom = 185;
        const xs = i => ((i + 0.5) / rows.length) * W;
        if (state.mode === 'temp') {
            const temps = rows.map(r => r.temp).filter(num);
            if (temps.length < 2) return '';
            const min = Math.min(...temps), max = Math.max(...temps);
            const span = Math.max(max - min, 4), mid = (max + min) / 2;
            const y = v => 60 + (1 - (v - (mid - span / 2)) / span) * (bottom - 60);
            const pts = rows.map((r, i) => (num(r.temp) ? [xs(i), y(r.temp)] : null)).filter(Boolean);
            const d = smoothPath(pts, W);
            return `<svg class="fc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${t('modeTemp')}">
                <path class="fc-area" d="${d} L${W},${H} L0,${H} Z"/><path class="fc-line" d="${d}"/></svg>`;
        }
        // โหมด PM2.5: เส้นพยากรณ์ + ช่วงคาดการณ์ + เส้นเกณฑ์
        const pms = rows.map(r => r.pm);
        const highs = pms.map(p => (p ? (num(p.hi) ? p.hi : p.v) : null)).filter(num);
        if (highs.length < 2) return '';
        const maxV = Math.max(40, ...highs) * 1.08;
        const y = v => bottom - (v / maxV) * (bottom - top);
        const pts = pms.map((p, i) => (p && num(p.v) ? [xs(i), y(p.v)] : null)).filter(Boolean);
        const d = smoothPath(pts, W);
        const bandIdx = pms.map((p, i) => (p && num(p.lo) && num(p.hi) ? i : -1)).filter(i => i >= 0);
        let band = '';
        if (bandIdx.length >= 2) {
            const hi = bandIdx.map(i => [xs(i), y(pms[i].hi)]);
            const lo = bandIdx.map(i => [xs(i), y(pms[i].lo)]).reverse();
            band = `<path class="fc-band" d="M${hi.map(p => p.map(n => n.toFixed(1)).join(',')).join(' L')} L${lo.map(p => p.map(n => n.toFixed(1)).join(',')).join(' L')} Z"/>`;
        }
        const guides = [15, 25, 37.5, 75].filter(v => v < maxV).map(v =>
            `<line class="fc-guide${v === 37.5 ? ' is-watch' : ''}" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" style="stroke:${pmColor(v - 0.1)}"/>`).join('');
        const dots = pms.map((p, i) => (p && num(p.v)
            ? `<circle class="fc-pmdot${p.measured ? ' is-measured' : ''}" cx="${xs(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="5" style="fill:${pmColor(p.v)}"/>` : '')).join('');
        return `<svg class="fc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${t('modePm')}">
            ${guides}${band}<path class="fc-line is-pm" d="${d}"/>${dots}</svg>`;
    }

    function rainBadges(rows) {
        return rows.map(r => {
            if (!num(r.rain) || r.rain < 0.05) return '<span></span>';
            return `<span><b class="fc-rain${r.rain >= 0.2 ? ' is-strong' : ''}">${r.rain.toFixed(2)}${t('mmh')}</b></span>`;
        }).join('');
    }

    function methodNote() {
        const fc = state.fc;
        if (state.historyState === 'loading' && API.enabled) return t('mWait');
        if (!fc || !fc.method || fc.method === 'om') return t('mOm');
        const days = Math.max(1, Math.round(fc.historyHours / 24));
        let text = fc.method === 'blend' && num(fc.ratio) ? t('mBlend')(days, fc.ratio.toFixed(2)) : t('mLocal')(days);
        const bt = fc.backtest;
        if (bt && num(bt.mae) && bt.samples >= 24) {
            const pct = num(bt.maeNaive) && bt.maeNaive > 0 ? Math.round((1 - bt.mae / bt.maeNaive) * 100) : 0;
            text += `<br>${t('acc')(bt.mae.toFixed(1), pct)}`;
        }
        return text;
    }

    function render() {
        if (!state.om) return;
        const keep = {
            hours: root.querySelector('.fc-scroll')?.scrollLeft || 0,
            tabs: root.querySelector('.fc-tabs')?.scrollLeft || 0,
            focus: root.contains(document.activeElement) ? (document.activeElement.dataset.day !== undefined ? `.fc-tab[data-day="${document.activeElement.dataset.day}"]` : document.activeElement.dataset.mode ? `.fc-mode [data-mode="${document.activeElement.dataset.mode}"]` : null) : null,
        };
        draw();
        const sc = root.querySelector('.fc-scroll'); if (sc) sc.scrollLeft = keep.hours;
        const tb = root.querySelector('.fc-tabs'); if (tb) tb.scrollLeft = keep.tabs;
        if (keep.focus) root.querySelector(keep.focus)?.focus({ preventScroll: true });
    }

    function draw() {
        const d = state.om.wx.daily;
        const dayCount = Math.min(FORECAST_CONFIG.days, d.time.length);
        if (state.selected >= dayCount) state.selected = 0;
        const sel = state.selected;
        const s = summaryFor(sel);
        const rows = rowsFor(sel);
        const sky = wmo(s.code)[2];
        const night = s.today && !s.isDay;
        const lvl = num(s.pm) ? pmLevel(s.pm) : null;

        const tabs = Array.from({ length: dayCount }, (_, i) => {
            const isDay = i === 0 && state.om.wx.current ? state.om.wx.current.is_day ?? 1 : 1;
            const dp = dayPm(i);
            const pmChip = dp ? `<span class="fc-tab-pm" style="--pm:${pmColor(dp.max)}" title="${t('pmMax')}"><i></i>${r0(dp.max)}</span>` : '';
            return `<button type="button" class="fc-tab${i === sel ? ' active' : ''}" data-day="${i}" aria-pressed="${i === sel}">
                <span class="fc-tab-day">${dayName(d.time[i], i)}</span>
                <span class="fc-tab-temp">${r0(d.temperature_2m_max?.[i])}<sup>°</sup></span>
                ${icon(d.weather_code?.[i], isDay)}${pmChip}
            </button>`;
        }).join('');

        const tile = (key, label, value, note) => `<div class="fc-tile">
            <span class="fc-tile-label">${tileIcon(key)}${label}</span>
            <span class="fc-tile-value">${value}</span>${note ? `<small>${note}</small>` : ''}
        </div>`;
        const windVal = num(s.wind) ? `${s.wind.toFixed(0)} ${t('ms')} ${compass(s.windDir)}` : '--';
        const tiles = s.today ? [
            tile('temp', t('temp'), num(s.temp) ? `${r1(s.temp)}°C` : '--', num(s.feels) ? `${t('feels')} ${r0(s.feels)}°` : ''),
            tile('humidity', t('humidity'), num(s.hum) ? `${Math.round(s.hum)}%` : '--'),
            tile('pm10', t('pm10'), num(s.pm10) ? `${r1(s.pm10)} µg/m³` : '--'),
            tile('wind', t('wind'), windVal),
            tile('rain', t('rain'), num(s.pop) ? `${Math.round(s.pop)}%` : '--'),
            tile('uv', t('uv'), num(s.uv) ? `${Math.round(s.uv)} UV` : '--'),
        ] : [
            tile('temp', t('temp'), num(s.tMax) ? `${r0(s.tMax)}° / ${r0(s.tMin)}°` : '--'),
            tile('humidity', t('humidity'), num(s.hum) ? `${Math.round(s.hum)}%` : '--'),
            tile('pm10', t('pmMax'), num(s.pmMax) ? `${r1(s.pmMax)} µg/m³` : '--', s.peakIso ? `${t('peakAt')} ${hourLabel(s.peakIso)}` : ''),
            tile('wind', t('wind'), windVal),
            tile('rain', t('rain'), num(s.pop) ? `${Math.round(s.pop)}%` : '--'),
            tile('uv', t('uv'), num(s.uv) ? `${Math.round(s.uv)} UV` : '--'),
        ];

        const sourceChip = s.today
            ? `<span class="fc-src${s.live ? ' is-live' : ''}"><i></i>${s.live ? t('sensor') : t('estimate')}</span>`
            : `<span class="fc-src"><i></i>${t('avgDay')}</span>`;
        const current = `<article class="fc-now" style="--aqi:${lvl === null ? '#64748b' : PM_COLORS[lvl]}">
            <div class="fc-photo fc-sky-${sky}${night ? ' is-night' : ''}">
                <div class="fc-photo-top">${sourceChip}<span class="fc-clock">${s.today ? clockLabel() : esc(dateLabel(s.date))}</span></div>
                <div class="fc-photo-bottom">
                    <div class="fc-big-wrap">
                        <span class="fc-big-label">PM2.5</span>
                        <span class="fc-big">${r1(s.pm)}</span>
                        <span class="fc-big-unit">µg/m³</span>
                    </div>
                    <div class="fc-desc">
                        <strong class="fc-level">${lvl === null ? '--' : t('levels')[lvl]}</strong>
                        <span>${lvl === null ? '' : t('advice')[lvl]}</span>
                        <span class="fc-sky-text">${icon(s.code, s.isDay)}${esc(describe(s.code))}</span>
                    </div>
                </div>
            </div>
            <div class="fc-tiles">${tiles.join('')}</div>
        </article>`;

        const big = r => (state.mode === 'pm'
            ? `<span class="fc-hour-main" style="--pm:${r.pm ? pmColor(r.pm.v) : '#94a3b8'}">${r.pm ? r0(r.pm.v) : '--'}</span>`
            : `<span class="fc-hour-main is-temp">${r0(r.temp)}°</span>`);
        const small = r => (state.mode === 'pm'
            ? `<span class="fc-hour-sub">${r0(r.temp)}° · ${num(r.pop) ? Math.round(r.pop) : '--'}%</span>`
            : `<span class="fc-hour-sub">${r.pm ? `<i style="background:${pmColor(r.pm.v)}"></i>${r0(r.pm.v)}` : '--'} · ${num(r.pop) ? Math.round(r.pop) : '--'}%</span>`);
        const cards = rows.map(r => `<div class="fc-hour${r.isNow ? ' is-now' : ''}">
            <span class="fc-hour-time">${r.isNow ? t('now') : hourLabel(r.time)}</span>
            ${icon(r.code, r.isDay)}
            ${big(r)}
            ${small(r)}
        </div>`).join('');

        const hourly = `<article class="fc-hourly">
            <div class="fc-hourly-head">
                <h3>${sel === 0 ? t('hourly') : `${t('hourlyDay')} · ${esc(dateLabel(s.date))}`}</h3>
                <div class="fc-mode" role="group" aria-label="${t('hourly')}">
                    <button type="button" data-mode="pm" aria-pressed="${state.mode === 'pm'}">${t('modePm')}</button>
                    <button type="button" data-mode="temp" aria-pressed="${state.mode === 'temp'}">${t('modeTemp')}</button>
                </div>
            </div>
            <div class="fc-scroll">
                <div class="fc-track" style="--fc-cols:${rows.length}">
                    <div class="fc-chart-box">
                        ${chartSvg(rows)}
                        ${state.mode === 'pm' ? `<span class="fc-chart-legend"><i class="fc-legend-band"></i>${t('band')}<i class="fc-legend-watch"></i>${t('watch')}</span>` : ''}
                        <div class="fc-rain-row">${rainBadges(rows)}</div>
                    </div>
                    <div class="fc-hours">${cards}</div>
                </div>
            </div>
            <p class="fc-method">${methodNote()}</p>
        </article>`;

        renderShell(`<div class="fc-tabs" role="group" aria-label="${t('badge')}">${tabs}</div>
            <div class="fc-grid">${current}${hourly}</div>
            <p class="fc-source">${state.sensor === 'ok' ? t('sources') : t('sourcesOff')}</p>`);

        root.querySelectorAll('.fc-tab').forEach(b => b.addEventListener('click', () => {
            state.selected = +b.dataset.day;
            const sc = root.querySelector('.fc-scroll'); if (sc) sc.scrollLeft = 0;
            render();
        }));
        root.querySelectorAll('.fc-mode button').forEach(b => b.addEventListener('click', () => {
            state.mode = b.dataset.mode;
            render();
        }));
    }

    // ---------- รอบการดึงข้อมูล ----------
    let omBusy = false;
    async function refreshOpenMeteo(force) {
        if (omBusy) return;
        const cached = !force && readCache(FORECAST_CONFIG.cacheKey, FORECAST_CONFIG.refreshMinutes);
        if (cached) { state.om = cached; rebuildForecast(); render(); return; }
        omBusy = true;
        if (!state.om) renderLoading();
        try {
            state.om = await loadOpenMeteo();
            writeCache(FORECAST_CONFIG.cacheKey, state.om);
            rebuildForecast();
            render();
        } catch (err) {
            console.warn('[forecast] Open-Meteo:', err.message || err);
            if (!state.om) renderError();
        } finally { omBusy = false; }
    }

    async function refreshHistory(force) {
        if (!API.enabled || !MODEL) { state.historyState = 'off'; return; }
        const cached = !force && readCache(FORECAST_CONFIG.historyCacheKey, FORECAST_CONFIG.refreshMinutes);
        if (cached) { state.history = cached; state.historyState = 'ok'; rebuildForecast(); render(); return; }
        try {
            state.history = await loadHistory();
            state.historyState = 'ok';
            writeCache(FORECAST_CONFIG.historyCacheKey, state.history);
        } catch (err) {
            console.warn('[forecast] history:', err.message || err);
            state.historyState = state.history ? 'ok' : 'off';
        }
        rebuildForecast();
        render();
    }

    async function refreshLatest() {
        if (!API.enabled) { state.sensor = 'off'; return; }
        try {
            const list = await API.latest();
            const fresh = list.filter(r => r.time && Date.now() - r.time.getTime() < (API.staleMs || 600000));
            if (fresh.length) {
                state.latest = {
                    pm25: avg(fresh.map(r => r.pm25)), pm10: avg(fresh.map(r => r.pm10)),
                    temperature: avg(fresh.map(r => r.temperature)), humidity: avg(fresh.map(r => r.humidity)),
                    time: Math.max(...fresh.map(r => r.time.getTime())),
                };
                state.sensor = 'ok';
            } else {
                state.latest = null;
                state.sensor = 'off';
            }
        } catch (err) {
            console.warn('[forecast] latest:', err.message || err);
            state.sensor = 'off';
        }
        rebuildForecast();
        render();
    }

    refreshOpenMeteo(false);
    refreshLatest();
    refreshHistory(false);
    setInterval(() => refreshOpenMeteo(true), FORECAST_CONFIG.refreshMinutes * 60000);
    setInterval(() => refreshHistory(true), FORECAST_CONFIG.refreshMinutes * 60000);
    setInterval(refreshLatest, FORECAST_CONFIG.latestSeconds * 1000);
    // นาฬิกาและชั่วโมงปัจจุบัน
    setInterval(() => { if (state.om && state.selected === 0) render(); }, 60000);
    document.addEventListener('pkru:langchange', () => {
        if (state.om) render();
        else if (root.querySelector('.fc-error')) renderError();
        else renderLoading();
    });
})();
