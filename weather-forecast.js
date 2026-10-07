// ===== PKRU Air Quality — พยากรณ์อากาศและฝุ่น PM2.5 หน้าแรก =====
// ข้อมูล: เซนเซอร์ มรภ. อย่างเดียว (Aerolink API → InfluxDB) — ไม่ใช้แหล่งข้อมูลภายนอก
//   - ค่าล่าสุด (/api/latest): PM2.5, PM10, PM1.0, อุณหภูมิ, ความชื้น, ความสว่าง
//   - ย้อนหลัง 14 วัน (/api/history): ใช้พยากรณ์ PM2.5 / อุณหภูมิ / ความชื้น ด้วย pm25-forecast.js
//     (รูปแบบรายชั่วโมงของวันจากข้อมูลจริง + ค่าที่ต่างจากปกติตอนนี้ ค่อยๆ จางลงตามเวลา)
// ✏️ ปรับค่าได้ที่ FORECAST_CONFIG ด้านล่าง
// ลบส่วนนี้ออก: ลบ <section class="forecast-section"> และบรรทัดที่โหลด weather-forecast.css, pm25-forecast.js, weather-forecast.js ใน index.html
(function () {
    'use strict';

    const FORECAST_CONFIG = {
        days: 5,                  // จำนวนวันในแท็บ
        slots: 9,                 // จำนวนช่องรายชั่วโมงที่แสดง
        historyDays: 14,          // ดึงข้อมูลเซนเซอร์ย้อนหลังกี่วันมาใช้พยากรณ์ (ต้องมีอย่างน้อย 2 วันจึงจะพยากรณ์ได้)
        refreshMinutes: 30,       // ดึงข้อมูลย้อนหลังใหม่ทุกกี่นาที
        latestSeconds: 60,        // ดึงค่าล่าสุดจากเซนเซอร์ทุกกี่วินาที
        historyCacheKey: 'pkru_sensor_history_v2',
        nodes: 3,                 // จำนวนจุดตรวจวัดทั้งหมด (ใช้แสดง "ออนไลน์ x/3")
    };
    const FIELDS = ['pm25', 'temperature', 'humidity'];

    const root = document.getElementById('pkruForecast');
    if (!root) return;
    const API = window.PKRU_API || { enabled: false };
    const MODEL = window.PKRU_PM_FORECAST || null;
    const HOUR = 3600e3;

    // ล้างแคชเก่าที่มาจาก Open-Meteo / รูปแบบเดิม
    try { ['pkru_forecast_v2', 'pkru_forecast_v1', 'pkru_pm_history_v1'].forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }

    // ---------- ภาษา ----------
    const lang = () => (window.PKRU_LANG === 'en' ? 'en' : 'th');
    const TXT = {
        th: {
            badge: 'พยากรณ์อากาศและฝุ่น', title: 'คุณภาพอากาศรอบมหาวิทยาลัย',
            sub: 'ค่าจริงจากเซนเซอร์ มรภ.ภูเก็ต พร้อมพยากรณ์ PM2.5 อุณหภูมิ และความชื้นล่วงหน้า 5 วัน จากข้อมูลย้อนหลังของเซนเซอร์เอง',
            today: 'วันนี้', hourly: 'พยากรณ์รายชั่วโมง', hourlyDay: 'พยากรณ์ทั้งวัน',
            feels: 'รู้สึกเหมือน', humidity: 'ความชื้น', humAvg: 'ความชื้นเฉลี่ย', temp: 'อุณหภูมิ', tempRange: 'อุณหภูมิ สูง/ต่ำ',
            pm10: 'PM10', pm1: 'PM1.0', lux: 'ความสว่าง', online: 'ออนไลน์', updated: 'อัปเดต',
            heatMax: 'รู้สึกร้อนสุด', pmMax: 'PM2.5 สูงสุด', pmMin: 'PM2.5 ต่ำสุด', over: 'เกินเกณฑ์ 37.5', hoursUnit: 'ชม.',
            avgDay: 'ค่าพยากรณ์เฉลี่ยทั้งวัน', peakAt: 'เวลา',
            now: 'ตอนนี้', sensor: 'เซนเซอร์ มรภ.', noLive: 'ไม่มีข้อมูลสด', lastKnown: 'ข้อมูลล่าสุด', forecastChip: 'ค่าพยากรณ์',
            modePm: 'PM2.5', modeTemp: 'อุณหภูมิ', band: 'แถบจาง = ช่วงที่ค่าน่าจะอยู่ (80%)', watch: 'เกณฑ์เฝ้าระวัง 37.5',
            loading: 'กำลังดึงข้อมูลจากเซนเซอร์…',
            apiOff: 'ยังไม่ได้ตั้งค่า API ของเซนเซอร์ (config.js) จึงยังพยากรณ์ไม่ได้',
            error: 'เชื่อมต่อเซนเซอร์ไม่ได้ — ระบบจะลองใหม่อัตโนมัติ', retry: 'ลองอีกครั้ง',
            noLiveText: 'ยังไม่ได้รับค่าล่าสุดจากเซนเซอร์',
            measuredAt: tm => `วัดเมื่อ ${tm}`,
            staleAt: tm => `วัดเมื่อ ${tm} · เซนเซอร์ยังไม่ส่งค่าใหม่`,
            mLocal: d => `พยากรณ์จากรูปแบบรายชั่วโมงของข้อมูลเซนเซอร์ย้อนหลัง ${d} วัน (InfluxDB) — ยิ่งไกลจากตอนนี้ ค่าจะยิ่งเข้าใกล้ค่าปกติของช่วงเวลานั้น`,
            mNeed: h => `ต้องมีข้อมูลเซนเซอร์ย้อนหลังอย่างน้อย 2 วันจึงจะพยากรณ์ได้ (ตอนนี้มี ${h} ชม.)`,
            mWait: 'กำลังดึงข้อมูลย้อนหลังจากเซนเซอร์เพื่อพยากรณ์…',
            mFail: 'ดึงข้อมูลย้อนหลังจากเซนเซอร์ไม่ได้ จึงยังพยากรณ์ไม่ได้',
            acc: (pm, tc, pct) => `ทดสอบย้อนหลัง 24 ชม. ข้างหน้า: PM2.5 คลาดเคลื่อนเฉลี่ย ±${pm} µg/m³` + (pct > 0 ? ` (แม่นกว่าการใช้ค่าล่าสุดคงที่ ${pct}%)` : '') + (tc ? ` · อุณหภูมิ ±${tc}°C` : ''),
            sources: 'ข้อมูลทั้งหมดจากเซนเซอร์ มรภ.ภูเก็ต (InfluxDB ผ่าน Aerolink API) — ไม่ใช้แหล่งข้อมูลภายนอก',
            days: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'],
            levels: ['ดีมาก', 'ดี', 'ปานกลาง', 'เริ่มมีผลกระทบ', 'มีผลต่อสุขภาพ'],
            advice: ['ทำกิจกรรมกลางแจ้งได้ตามปกติ', 'ทำกิจกรรมกลางแจ้งได้ตามปกติ', 'ผู้มีโรคประจำตัวควรระวัง', 'ควรสวมหน้ากากอนามัย', 'งดกิจกรรมกลางแจ้ง ปิดหน้าต่าง'],
        },
        en: {
            badge: 'Air & weather forecast', title: 'Air quality around campus',
            sub: 'Live readings from the PKRU sensors with a 5-day PM2.5, temperature and humidity forecast built from the sensors’ own history',
            today: 'Today', hourly: 'Hourly forecast', hourlyDay: 'Forecast for the day',
            feels: 'Feels like', humidity: 'Humidity', humAvg: 'Avg. humidity', temp: 'Temperature', tempRange: 'High / low',
            pm10: 'PM10', pm1: 'PM1.0', lux: 'Light', online: 'Online', updated: 'Updated',
            heatMax: 'Hottest feel', pmMax: 'Peak PM2.5', pmMin: 'Lowest PM2.5', over: 'Above 37.5', hoursUnit: 'h',
            avgDay: 'Forecast daily average', peakAt: 'at',
            now: 'Now', sensor: 'PKRU sensors', noLive: 'No live data', lastKnown: 'Last reading', forecastChip: 'Forecast',
            modePm: 'PM2.5', modeTemp: 'Temperature', band: 'Shaded band = likely range (80%)', watch: 'Watch level 37.5',
            loading: 'Fetching sensor data…',
            apiOff: 'The sensor API is not configured (config.js), so there is no forecast yet',
            error: 'Cannot reach the sensors — retrying automatically', retry: 'Try again',
            noLiveText: 'No recent reading from the sensors yet',
            measuredAt: tm => `Measured ${tm}`,
            staleAt: tm => `Measured ${tm} · no new readings yet`,
            mLocal: d => `Forecast from the hourly pattern in ${d} days of sensor history (InfluxDB) — further ahead, values move toward the usual level for that hour`,
            mNeed: h => `At least 2 days of sensor history are needed to forecast (currently ${h} h)`,
            mWait: 'Fetching sensor history to build the forecast…',
            mFail: 'Could not fetch the sensor history, so there is no forecast yet',
            acc: (pm, tc, pct) => `Back-test over the next 24 h: PM2.5 average error ±${pm} µg/m³` + (pct > 0 ? ` (${pct}% better than repeating the latest value)` : '') + (tc ? ` · temperature ±${tc}°C` : ''),
            sources: 'All values come from the PKRU sensors (InfluxDB via the Aerolink API) — no outside data sources',
            days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            levels: ['Very good', 'Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy'],
            advice: ['Outdoor activities are fine', 'Outdoor activities are fine', 'People with health conditions should take care', 'Wear a face mask', 'Avoid outdoor activities and close windows'],
        },
    };
    const t = k => TXT[lang()][k];

    // ---------- เกณฑ์ PM2.5 (เหมือนแดชบอร์ด) ----------
    const PM_COLORS = ['#22d3ee', '#10b981', '#eab308', '#f97316', '#f43f5e'];
    const pmLevel = v => (v <= 15 ? 0 : v <= 25 ? 1 : v <= 37.5 ? 2 : v <= 75 ? 3 : 4);
    const pmColor = v => PM_COLORS[pmLevel(v)];

    // ---------- ไอคอนการ์ดย่อย ----------
    const TILE_ICON = {
        temp: '<path d="M10 4a2 2 0 1 1 4 0v10a4 4 0 1 1-4 0z"/>',
        humidity: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
        pm10: '<circle cx="7" cy="8" r="2"/><circle cx="16" cy="7" r="2.5"/><circle cx="9" cy="16" r="2.5"/><circle cx="17" cy="16" r="1.5"/>',
        pm1: '<circle cx="8" cy="9" r="1.2"/><circle cx="15" cy="7" r="1.5"/><circle cx="11" cy="15" r="1.5"/><circle cx="17" cy="15" r="1"/><circle cx="6" cy="16" r="1"/>',
        lux: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
        online: '<path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0"/><circle cx="12" cy="18.5" r="1.2"/>',
        heat: '<path d="M10 4a2 2 0 1 1 4 0v10a4 4 0 1 1-4 0z"/><path d="M18 5c1 1.2 1 2.8 0 4M20.5 3.5c1.8 2 1.8 5 0 7"/>',
        up: '<path d="M4 17l5-5 4 4 7-8"/><path d="M15 8h5v5"/>',
        down: '<path d="M4 7l5 5 4-4 7 8"/><path d="M15 16h5v-5"/>',
        alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    };
    const tileIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TILE_ICON[k]}</svg>`;

    // ---------- เวลา (Asia/Bangkok) ----------
    const bkkIso = ms => new Date(ms + 7 * HOUR).toISOString().slice(0, 16); // "2026-10-04T17:00" (เวลาไทย)
    const isoToMs = iso => Date.parse(`${iso}:00+07:00`);
    const hourOf = iso => +iso.slice(11, 13);
    const floorHour = ms => Math.floor(ms / HOUR) * HOUR;
    function hourLabel(iso) {
        const h = hourOf(iso);
        if (lang() === 'th') return `${String(h).padStart(2, '0')}:00`;
        if (h === 0) return '12 a.m';
        if (h === 12) return '12 p.m';
        return h < 12 ? `${h} a.m` : `${h - 12} p.m`;
    }
    function clockLabel(ms = Date.now()) {
        const d = new Date(ms);
        return lang() === 'th'
            ? d.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) + ' น.'
            : d.toLocaleTimeString('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', minute: '2-digit' });
    }
    // เวลา + วันที่ (ถ้าไม่ใช่วันนี้)
    function whenLabel(ms) {
        if (bkkIso(ms).slice(0, 10) === bkkIso(Date.now()).slice(0, 10)) return clockLabel(ms);
        const d = new Date(ms).toLocaleDateString(lang() === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
        return `${d} ${clockLabel(ms)}`;
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
    // วันที่ (เวลาไทย) ของวันนี้และวันถัดไป
    const dayDates = () => Array.from({ length: FORECAST_CONFIG.days }, (_, i) => bkkIso(Date.now() + i * 24 * HOUR).slice(0, 10));

    // ---------- ตัวช่วย ----------
    const num = v => typeof v === 'number' && Number.isFinite(v);
    const r0 = v => (num(v) ? Math.round(v) : '--');
    const r1 = v => (num(v) ? v.toFixed(1) : '--');
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const avg = arr => { const a = arr.filter(num); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };

    // ดัชนีความร้อน (รู้สึกเหมือน) จากอุณหภูมิและความชื้นของเซนเซอร์ — สูตร NOAA (Rothfusz)
    function heatIndex(tc, rh) {
        if (!num(tc) || !num(rh)) return null;
        const T = tc * 9 / 5 + 32;
        let hi = 0.5 * (T + 61 + (T - 68) * 1.2 + rh * 0.094);
        if ((hi + T) / 2 >= 80) {
            hi = -42.379 + 2.04901523 * T + 10.14333127 * rh - 0.22475541 * T * rh - 0.00683783 * T * T
                - 0.05481717 * rh * rh + 0.00122874 * T * T * rh + 0.00085282 * T * rh * rh - 0.00000199 * T * T * rh * rh;
            if (rh < 13 && T >= 80 && T <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
            else if (rh > 85 && T >= 80 && T <= 87) hi += ((rh - 85) / 10) * ((87 - T) / 5);
        }
        return (hi - 32) * 5 / 9;
    }
    function luxText(v) {
        if (!num(v)) return '--';
        return v >= 10000 ? `${(v / 1000).toFixed(0)}k lux` : `${Math.round(v).toLocaleString('en-US')} lux`;
    }

    // ---------- ดึงข้อมูลเซนเซอร์ (ผ่าน api.js) ----------
    async function loadHistory() {
        const res = await API.history(FORECAST_CONFIG.historyDays * 24, { fields: FIELDS });
        // เก็บแค่ค่าเฉลี่ยทั้งวิทยาเขตรายชั่วโมง (เล็กพอจะจำไว้ในเบราว์เซอร์)
        const byHour = new Map();
        FIELDS.forEach(f => {
            MODEL.campusHourly(res.rows, f).forEach((v, tt) => {
                const row = byHour.get(tt) || { t: tt };
                row[f] = v;
                byHour.set(tt, row);
            });
        });
        const rows = [...byHour.values()].sort((a, b) => a.t - b.t).map(r => ({ nodeId: 'campus', ...r }));
        return { rows, at: Date.now() };
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
        history: null,        // { rows: [{t, pm25, temperature, humidity}] } ค่าเฉลี่ยทั้งวิทยาเขตรายชั่วโมง
        historyState: API.enabled && MODEL ? 'loading' : 'off',   // 'loading' | 'ok' | 'fail' | 'off'
        latest: null,         // { pm25, pm10, pm1, temperature, humidity, lux, time, online, stale }
        latestState: API.enabled ? 'loading' : 'off',              // 'loading' | 'ok' | 'stale' | 'empty' | 'fail' | 'off'
        fc: {},               // { pm25, temperature, humidity } ผลจาก pm25-forecast.js
        selected: 0,
        mode: 'pm',           // 'pm' | 'temp'
    };
    const live = () => state.latestState === 'ok' && !!state.latest;
    // ค่าที่จะแสดงในการ์ด "วันนี้": ค่าสด → ถ้าไม่มี ใช้ค่าล่าสุดที่เซนเซอร์เคยส่ง (บอกเวลาที่วัดชัดเจน)
    function known() {
        if (state.latest) return state.latest;
        const rows = state.history ? state.history.rows : [];
        const last = rows[rows.length - 1];
        if (!last) return null;
        return { pm25: last.pm25, temperature: last.temperature, humidity: last.humidity, pm10: null, pm1: null, lux: null, time: last.t, online: 0, stale: true, hourly: true };
    }

    function rebuildForecast() {
        state.fc = {};
        if (!MODEL) return;
        FIELDS.forEach(f => {
            const rows = (state.history ? state.history.rows : []).filter(r => num(r[f]));
            if (live() && num(state.latest[f])) rows.push({ nodeId: 'campus-now', t: state.latest.time, [f]: state.latest[f] });
            if (!rows.length) return;
            state.fc[f] = MODEL.build({ rows, field: f, now: Date.now(), hours: FORECAST_CONFIG.days * 24 + 24 });
        });
    }
    const canForecast = () => !!(state.fc.pm25 && state.fc.pm25.hasProfile);

    // ค่าที่ชั่วโมงหนึ่ง: ค่าจริง (ถ้ามี) → ค่าพยากรณ์
    function valueAt(field, ms) {
        const fc = state.fc[field];
        if (!fc) return null;
        const obs = fc.observed.get(ms);
        if (num(obs) && ms <= Date.now()) return { v: obs, measured: true };
        if (!fc.hasProfile) return null;
        const p = fc.points.find(x => x.t === ms);
        return p ? { v: p.v, lo: p.lo, hi: p.hi } : null;
    }

    function hourRow(ms) {
        const pm = valueAt('pm25', ms), tp = valueAt('temperature', ms), hm = valueAt('humidity', ms);
        return { time: bkkIso(ms), ms, pm, temp: tp ? tp.v : null, hum: hm ? hm.v : null };
    }

    function rowsFor(dayIndex) {
        const n = FORECAST_CONFIG.slots;
        const out = [];
        if (dayIndex === 0) {
            const start = floorHour(Date.now());
            for (let k = 0; k < n; k++) out.push(hourRow(start + k * HOUR));
            // ช่องแรก = ตอนนี้: ใช้ค่าล่าสุดจากเซนเซอร์
            out[0].isNow = true;
            if (live()) {
                if (num(state.latest.pm25)) out[0].pm = { v: state.latest.pm25, measured: true };
                if (num(state.latest.temperature)) out[0].temp = state.latest.temperature;
                if (num(state.latest.humidity)) out[0].hum = state.latest.humidity;
            }
        } else {
            const start = isoToMs(`${dayDates()[dayIndex]}T00:00`);
            for (let k = 0; k < n; k++) out.push(hourRow(start + k * 3 * HOUR));
        }
        return out;
    }

    // สรุปค่าทั้งวัน (ค่าจริงที่ผ่านมาแล้ว + ค่าพยากรณ์)
    function dayStats(dayIndex) {
        const date = dayDates()[dayIndex];
        const hours = Array.from({ length: 24 }, (_, hh) => isoToMs(`${date}T${String(hh).padStart(2, '0')}:00`));
        const series = f => hours.map(ms => { const p = valueAt(f, ms); return p && num(p.v) ? { ms, v: p.v } : null; }).filter(Boolean);
        const pm = series('pm25'), tp = series('temperature'), hm = series('humidity');
        const pick = (arr, cmp) => (arr.length ? arr.reduce((a, b) => (cmp(b.v, a.v) ? b : a)) : null);
        const pmMax = pick(pm, (a, b) => a > b), pmMin = pick(pm, (a, b) => a < b);
        const hmBy = new Map(hm.map(x => [x.ms, x.v]));
        const heat = tp.map(x => heatIndex(x.v, hmBy.get(x.ms))).filter(num);
        return {
            date,
            pm: pm.length ? avg(pm.map(x => x.v)) : null,
            pmMax: pmMax ? pmMax.v : null, pmMaxIso: pmMax ? bkkIso(pmMax.ms) : null,
            pmMin: pmMin ? pmMin.v : null, pmMinIso: pmMin ? bkkIso(pmMin.ms) : null,
            over: pm.length ? pm.filter(x => x.v > 37.5).length : null,
            tMax: tp.length ? Math.max(...tp.map(x => x.v)) : null,
            tMin: tp.length ? Math.min(...tp.map(x => x.v)) : null,
            hum: hm.length ? avg(hm.map(x => x.v)) : null,
            heatMax: heat.length ? Math.max(...heat) : null,
        };
    }

    // ---------- วาดหน้า ----------
    const header = () => `<div class="fc-head">
        <div class="section-badge">${t('badge')}</div>
        <h2 class="section-heading" id="forecastTitle">${t('title')}</h2>
        <p class="section-subtext">${t('sub')}</p>
    </div>`;
    const renderShell = inner => { root.innerHTML = header() + inner; };
    const renderMessage = (text, retry) => {
        renderShell(`<div class="fc-state${retry ? ' fc-error' : ''}" role="${retry ? 'alert' : 'status'}"><span>${text}</span>${retry ? `<button type="button" class="fc-retry">${t('retry')}</button>` : ''}</div>`);
        root.querySelector('.fc-retry')?.addEventListener('click', () => { renderMessage(t('loading')); refreshAll(true); });
    };

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
        const W = 900, H = 240, top = 30, bottom = 205;
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

    function methodNote() {
        if (state.historyState === 'loading') return t('mWait');
        if (state.historyState === 'fail' && !state.history) return t('mFail');
        const fc = state.fc.pm25;
        if (!canForecast()) return t('mNeed')(fc ? fc.historyHours : 0);
        const days = Math.max(1, Math.round(fc.historyHours / 24));
        let text = t('mLocal')(days);
        const bt = fc.backtest, btT = state.fc.temperature && state.fc.temperature.backtest;
        if (bt && num(bt.mae) && bt.samples >= 24) {
            const pct = num(bt.maeNaive) && bt.maeNaive > 0 ? Math.round((1 - bt.mae / bt.maeNaive) * 100) : 0;
            const tc = btT && num(btT.mae) && btT.samples >= 24 ? btT.mae.toFixed(1) : null;
            text += `<br>${t('acc')(bt.mae.toFixed(1), tc, pct)}`;
        }
        return text;
    }

    function render() {
        // ยังไม่มีข้อมูลอะไรเลย → แสดงสถานะแทน
        if (!API.enabled) { renderMessage(t('apiOff')); return; }
        const anyData = state.latest || (state.history && state.history.rows.length);
        if (!anyData) {
            if (state.latestState === 'loading' || state.historyState === 'loading') renderMessage(t('loading'));
            else renderMessage(t('error'), true);
            return;
        }
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
        const dates = dayDates();
        // ยังพยากรณ์ไม่ได้ → แสดงเฉพาะวันนี้
        const dayCount = canForecast() ? dates.length : 1;
        if (state.selected >= dayCount) state.selected = 0;
        const sel = state.selected;
        const today = sel === 0;
        const L = known();
        const ds = dayStats(sel);
        const rows = rowsFor(sel);

        const pmNow = today ? (L && num(L.pm25) ? L.pm25 : null) : ds.pm;
        const lvl = num(pmNow) ? pmLevel(pmNow) : null;
        const hourNow = hourOf(bkkIso(Date.now()));
        const night = today && (hourNow < 6 || hourNow >= 18);

        const tabs = dates.slice(0, dayCount).map((date, i) => {
            const s = dayStats(i);
            const tMax = i === 0 && live() && num(L.temperature) ? Math.max(L.temperature, s.tMax ?? -99) : s.tMax;
            const pmChip = num(s.pmMax) ? `<span class="fc-tab-pm" style="--pm:${pmColor(s.pmMax)}" title="${t('pmMax')}"><i></i>${r0(s.pmMax)}</span>` : '';
            return `<button type="button" class="fc-tab${i === sel ? ' active' : ''}" data-day="${i}" aria-pressed="${i === sel}">
                <span class="fc-tab-day">${dayName(date, i)}</span>
                <span class="fc-tab-temp">${r0(tMax)}<sup>°</sup></span>
                ${pmChip}
            </button>`;
        }).join('');

        const tile = (key, label, value, note) => `<div class="fc-tile">
            <span class="fc-tile-label">${tileIcon(key)}${label}</span>
            <span class="fc-tile-value">${value}</span>${note ? `<small>${note}</small>` : ''}
        </div>`;
        let tiles;
        if (today) {
            const feels = L ? heatIndex(L.temperature, L.humidity) : null;
            tiles = [
                tile('temp', t('temp'), L && num(L.temperature) ? `${r1(L.temperature)}°C` : '--', num(feels) ? `${t('feels')} ${r0(feels)}°` : ''),
                tile('humidity', t('humidity'), L && num(L.humidity) ? `${Math.round(L.humidity)}%` : '--'),
                tile('pm10', t('pm10'), L && num(L.pm10) ? `${r1(L.pm10)} µg/m³` : '--'),
                tile('pm1', t('pm1'), L && num(L.pm1) ? `${r1(L.pm1)} µg/m³` : '--'),
                tile('lux', t('lux'), L ? luxText(L.lux) : '--'),
                tile('online', t('online'), `${live() ? L.online : 0}/${FORECAST_CONFIG.nodes}`, L ? `${t('updated')} ${whenLabel(L.time)}` : ''),
            ];
        } else {
            tiles = [
                tile('temp', t('tempRange'), num(ds.tMax) ? `${r0(ds.tMax)}° / ${r0(ds.tMin)}°` : '--'),
                tile('humidity', t('humAvg'), num(ds.hum) ? `${Math.round(ds.hum)}%` : '--'),
                tile('heat', t('heatMax'), num(ds.heatMax) ? `${r0(ds.heatMax)}°C` : '--'),
                tile('up', t('pmMax'), num(ds.pmMax) ? `${r1(ds.pmMax)} µg/m³` : '--', ds.pmMaxIso ? `${t('peakAt')} ${hourLabel(ds.pmMaxIso)}` : ''),
                tile('down', t('pmMin'), num(ds.pmMin) ? `${r1(ds.pmMin)} µg/m³` : '--', ds.pmMinIso ? `${t('peakAt')} ${hourLabel(ds.pmMinIso)}` : ''),
                tile('alert', t('over'), num(ds.over) ? `${ds.over} ${t('hoursUnit')}` : '--'),
            ];
        }

        const sourceChip = today
            ? `<span class="fc-src${live() ? ' is-live' : ''}"><i></i>${live() ? t('sensor') : L ? t('lastKnown') : t('noLive')}</span>`
            : `<span class="fc-src"><i></i>${t('forecastChip')}</span>`;
        const descLine = today
            ? (!L ? t('noLiveText') : L.stale ? t('staleAt')(whenLabel(L.time)) : t('measuredAt')(clockLabel(L.time)))
            : t('avgDay');
        const current = `<article class="fc-now" style="--aqi:${lvl === null ? '#64748b' : PM_COLORS[lvl]}">
            <div class="fc-photo${night ? ' is-night' : ''}">
                <div class="fc-photo-top">${sourceChip}<span class="fc-clock">${today ? clockLabel() : esc(dateLabel(ds.date))}</span></div>
                <div class="fc-photo-bottom">
                    <div class="fc-big-wrap">
                        <span class="fc-big-label">PM2.5</span>
                        <span class="fc-big">${r1(pmNow)}</span>
                        <span class="fc-big-unit">µg/m³</span>
                    </div>
                    <div class="fc-desc">
                        <strong class="fc-level">${lvl === null ? '--' : t('levels')[lvl]}</strong>
                        <span>${lvl === null ? '' : t('advice')[lvl]}</span>
                        <span class="fc-sky-text">${esc(descLine)}</span>
                    </div>
                </div>
            </div>
            <div class="fc-tiles">${tiles.join('')}</div>
        </article>`;

        const big = r => (state.mode === 'pm'
            ? `<span class="fc-hour-main" style="--pm:${r.pm ? pmColor(r.pm.v) : '#94a3b8'}">${r.pm ? r0(r.pm.v) : '--'}</span>`
            : `<span class="fc-hour-main is-temp">${r0(r.temp)}°</span>`);
        const hum = r => `${num(r.hum) ? Math.round(r.hum) : '--'}%`;
        const small = r => (state.mode === 'pm'
            ? `<span class="fc-hour-sub">${r0(r.temp)}° · ${hum(r)}</span>`
            : `<span class="fc-hour-sub">${r.pm ? `<i style="background:${pmColor(r.pm.v)}"></i>${r0(r.pm.v)}` : '--'} · ${hum(r)}</span>`);
        const cards = rows.map(r => `<div class="fc-hour${r.isNow ? ' is-now' : ''}">
            <span class="fc-hour-time">${r.isNow ? t('now') : hourLabel(r.time)}</span>
            ${big(r)}
            ${small(r)}
        </div>`).join('');

        const hourly = `<article class="fc-hourly">
            <div class="fc-hourly-head">
                <h3>${today ? t('hourly') : `${t('hourlyDay')} · ${esc(dateLabel(ds.date))}`}</h3>
                <div class="fc-mode" role="group" aria-label="${t('hourly')}">
                    <button type="button" data-mode="pm" aria-pressed="${state.mode === 'pm'}">${t('modePm')}</button>
                    <button type="button" data-mode="temp" aria-pressed="${state.mode === 'temp'}">${t('modeTemp')}</button>
                </div>
            </div>
            <div class="fc-scroll">
                <div class="fc-track" style="--fc-cols:${rows.length}">
                    <div class="fc-chart-box">
                        ${chartSvg(rows)}
                        ${state.mode === 'pm' && canForecast() ? `<span class="fc-chart-legend"><i class="fc-legend-band"></i>${t('band')}<i class="fc-legend-watch"></i>${t('watch')}</span>` : ''}
                    </div>
                    <div class="fc-hours">${cards}</div>
                </div>
            </div>
            <p class="fc-method">${methodNote()}</p>
        </article>`;

        renderShell(`<div class="fc-tabs" role="group" aria-label="${t('badge')}">${tabs}</div>
            <div class="fc-grid">${current}${hourly}</div>
            <p class="fc-source">${t('sources')}</p>`);

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
            state.historyState = state.history ? 'ok' : 'fail';
        }
        rebuildForecast();
        render();
    }

    async function refreshLatest() {
        if (!API.enabled) { state.latestState = 'off'; return; }
        try {
            const list = await API.latest();
            const fresh = list.filter(r => r.time && Date.now() - r.time.getTime() < (API.staleMs || 600000));
            // ไม่มีค่าใหม่ใน 10 นาที แต่ API ยังส่งค่าเก่ามา → ใช้ค่าเก่าพร้อมบอกเวลาที่วัด
            const use = fresh.length ? fresh : list.filter(r => r.time);
            if (use.length) {
                const pick = k => avg(use.map(r => r[k]));
                state.latest = {
                    pm25: pick('pm25'), pm10: pick('pm10'), pm1: pick('pm1'),
                    temperature: pick('temperature'), humidity: pick('humidity'), lux: pick('lux'),
                    time: Math.max(...use.map(r => r.time.getTime())),
                    online: new Set(fresh.map(r => r.nodeId)).size,
                    stale: !fresh.length,
                };
                state.latestState = fresh.length ? 'ok' : 'stale';
            } else {
                state.latest = null;
                state.latestState = 'empty';
            }
        } catch (err) {
            console.warn('[forecast] latest:', err.message || err);
            state.latest = null;
            state.latestState = 'fail';
        }
        rebuildForecast();
        render();
    }

    function refreshAll(force) {
        refreshLatest();
        refreshHistory(force);
    }

    render();
    refreshAll(false);
    setInterval(() => refreshHistory(true), FORECAST_CONFIG.refreshMinutes * 60000);
    setInterval(refreshLatest, FORECAST_CONFIG.latestSeconds * 1000);
    // นาฬิกาและชั่วโมงปัจจุบัน
    setInterval(() => { if (state.selected === 0) render(); }, 60000);
    document.addEventListener('pkru:langchange', render);
})();
