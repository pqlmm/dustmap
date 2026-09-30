// ===== PKRU Air Quality — ตัวเชื่อมต่อ Aerolink API =====
// ใช้ร่วมกันทั้ง index.html และ dashboard.html (โหลดหลัง config.js)
//
//   PKRU_API.enabled                 มี URL ให้ใช้หรือไม่
//   PKRU_API.latest()                → [{ nodeId, time, pm25, pm1, pm10, temperature, humidity, lux }]
//                                      (API ตอบ 404 = ไม่มีข้อมูลใน 10 นาที → คืน [] และ PKRU_API.lastLatestEmpty = true)
//   PKRU_API.history(hours, opts)    → { resolution, rows: [{ nodeId, t, pm25, ... }] }
//   PKRU_API.buildings()             → [{ nodeId, lat, lon, ... }]
//
// ข้อผิดพลาดทุกแบบโยนเป็น PKRU_API.Error ที่มี .kind:
//   'network'  เชื่อมต่อไม่ได้ (เซิร์ฟเวอร์ปิด / URL เปลี่ยน / CORS บล็อก)
//   'timeout'  เซิร์ฟเวอร์ตอบช้าเกินไป
//   'http'     เซิร์ฟเวอร์ตอบ error (มี .status)
//   'parse'    ข้อมูลที่ได้ไม่ใช่ JSON ที่คาดไว้
(function () {
    'use strict';

    const CFG = Object.assign({
        baseUrl: '',
        pollMs: 30000,
        timeoutMs: 15000,
        staleMinutes: 10,
        devices: { 'esp32-sci': 'node2', 'esp32-hss': 'node3', 'esp32-fms': 'node4' },
        useApiCoordinates: false,
    }, window.PKRU_API_CONFIG || {});

    const OVERRIDE_KEY = 'pkru_api_override';
    const clean = u => String(u || '').trim().replace(/\/+$/, '');

    // ---------- เลือก URL: ?api=... > ค่าที่จำไว้ > config.js ----------
    function resolveBaseUrl() {
        const configUrl = clean(CFG.baseUrl);
        let override = null;
        try {
            const param = new URLSearchParams(location.search).get('api');
            if (param === 'reset' || param === '') {
                localStorage.removeItem(OVERRIDE_KEY);
            } else if (param && /^https?:\/\//i.test(param)) {
                override = { url: clean(param), configUrl };
                localStorage.setItem(OVERRIDE_KEY, JSON.stringify(override));
            } else {
                override = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null');
                // ถ้าแก้ config.js เป็น URL ใหม่แล้ว ให้เลิกใช้ค่าที่จำไว้
                if (override && override.configUrl !== configUrl) {
                    localStorage.removeItem(OVERRIDE_KEY);
                    override = null;
                }
            }
        } catch { /* ไม่มี localStorage */ }
        return override?.url || configUrl;
    }

    const BASE = resolveBaseUrl();

    class ApiError extends Error {
        constructor(kind, message, status) {
            super(message);
            this.name = 'PKRUApiError';
            this.kind = kind;
            this.status = status;
        }
    }

    async function request(path, params) {
        if (!BASE) throw new ApiError('config', 'ยังไม่ได้ตั้ง URL ของ API');
        const qs = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v); });
        const url = `${BASE}${path}${qs.toString() ? '?' + qs : ''}`;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CFG.timeoutMs);
        let res;
        try {
            res = await fetch(url, { cache: 'no-store', signal: ctrl.signal, headers: { Accept: 'application/json' } });
        } catch (err) {
            if (err.name === 'AbortError') throw new ApiError('timeout', 'API ตอบช้าเกินไป');
            throw new ApiError('network', 'เชื่อมต่อ API ไม่ได้ (เซิร์ฟเวอร์ปิด, URL เปลี่ยน หรือถูกบล็อก CORS)');
        } finally {
            clearTimeout(timer);
        }

        let body = null;
        try { body = await res.json(); } catch { /* ไม่ใช่ JSON */ }
        if (!res.ok) {
            const err = new ApiError(res.status === 404 ? 'nodata' : 'http', body?.detail || `API ตอบกลับ ${res.status}`, res.status);
            throw err;
        }
        if (body === null) throw new ApiError('parse', 'ข้อมูลจาก API ไม่ใช่ JSON');
        return body;
    }

    // ---------- แปลงข้อมูลให้ตรงกับรูปแบบของเว็บ ----------
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

    function parseTime(t) {
        if (!t) return null;
        let s = String(t);
        // ไม่มีเขตเวลา → API ใช้ UTC
        if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
        const d = new Date(s);
        return isNaN(d) ? null : d;
    }

    function nodeIdFor(deviceId) {
        return CFG.devices[deviceId] || null;
    }
    function deviceIdFor(nodeId) {
        return Object.keys(CFG.devices).find(k => CFG.devices[k] === nodeId) || null;
    }

    function normalize(row) {
        return {
            deviceId: row.device_id,
            nodeId: nodeIdFor(row.device_id),
            location: row.location || '',
            locationTh: row.location_th || '',
            time: parseTime(row.time),
            pm1: num(row.pm1_0),
            pm25: num(row.pm2_5),
            pm10: num(row.pm10),
            temperature: num(row.temperature),
            humidity: num(row.humidity),
            lux: num(row.lux),
        };
    }

    const FIELD_MAP = { pm1: 'pm1_0', pm25: 'pm2_5', pm10: 'pm10', temperature: 'temperature', humidity: 'humidity', lux: 'lux' };
    const toApiFields = list => (list || []).map(k => FIELD_MAP[k] || k).join(',');

    const api = {
        Error: ApiError,
        config: CFG,
        baseUrl: BASE,
        enabled: !!BASE,
        pollMs: Math.max(10000, CFG.pollMs || 30000),
        staleMs: (CFG.staleMinutes || 10) * 60000,
        nodeIdFor,
        deviceIdFor,
        lastLatestEmpty: false,

        async health() {
            return request('/api/health');
        },

        async buildings() {
            const list = await request('/api/buildings');
            return (Array.isArray(list) ? list : []).map(b => ({
                deviceId: b.device_id,
                nodeId: nodeIdFor(b.device_id),
                location: b.location || '',
                locationTh: b.location_th || '',
                lat: num(b.lat),
                lon: num(b.lon),
            }));
        },

        // ค่าล่าสุดของทุกจุด — 404 (ไม่มีข้อมูลใน 10 นาที) คืน [] ไม่ถือเป็น error
        async latest(opts = {}) {
            try {
                const list = await request('/api/latest', { device_id: opts.deviceId, fields: toApiFields(opts.fields) });
                api.lastLatestEmpty = false;
                return (Array.isArray(list) ? list : [list]).map(normalize).filter(r => r.nodeId);
            } catch (err) {
                if (err.kind === 'nodata') { api.lastLatestEmpty = true; return []; }
                throw err;
            }
        },

        // ข้อมูลย้อนหลัง (hours > 48 ระบบของเพื่อนจะส่งเป็นค่าเฉลี่ยรายชั่วโมง)
        async history(hours = 24, opts = {}) {
            const h = Math.max(1, Math.min(35000, Math.ceil(hours)));
            let body;
            try {
                body = await request('/api/history', { hours: h, device_id: opts.deviceId, fields: toApiFields(opts.fields) });
            } catch (err) {
                if (err.kind === 'nodata') return { resolution: null, rows: [] };
                throw err;
            }
            const data = Array.isArray(body) ? body : (body?.data || []);
            const rows = data.map(normalize)
                .filter(r => r.nodeId && r.time)
                .map(r => ({ ...r, t: r.time.getTime() }))
                .sort((a, b) => a.t - b.t);
            return { resolution: body?.resolution || null, rows };
        },
    };

    window.PKRU_API = api;
})();
