// ===== PKRU Air Quality — แบบจำลองพยากรณ์ PM2.5 (คำนวณในเบราว์เซอร์ ไม่ต้องแก้เซิร์ฟเวอร์) =====
// ข้อมูลเข้า: ค่าย้อนหลังจากเซนเซอร์ (InfluxDB ผ่าน /api/history) + PM2.5 จากแบบจำลอง CAMS ของ Open-Meteo
//
// วิธีคิด (อธิบายได้ ตรวจสอบได้):
//   1) รูปแบบรายชั่วโมงของวัน  — ค่ามัธยฐาน PM2.5 ของแต่ละชั่วโมง (00:00–23:00) จากข้อมูลจริง 14 วันล่าสุด
//   2) ค่าที่ต่างจากปกติตอนนี้ — (ค่าจริงล่าสุด − รูปแบบปกติ) แล้วค่อยๆ จางลงตามเวลา
//      ความเร็วที่จางลง (tau) คำนวณจากข้อมูลจริงด้วย autocorrelation
//   3) แบบจำลอง Open-Meteo     — ปรับสเกลด้วยอัตราส่วน (เซนเซอร์เรา ÷ Open-Meteo) ช่วงที่ผ่านมา
//      ยิ่งพยากรณ์ไกล ยิ่งให้น้ำหนักกับข้อ 3 มากขึ้น (เพราะรู้เรื่องลม ฝน ควันข้ามแดน)
//   4) ทดสอบย้อนหลัง           — สมมติว่าพยากรณ์จากจุดเวลาในอดีต แล้ววัดความคลาดเคลื่อนเทียบค่าจริง
//      ใช้บอกความแม่นยำ และกำหนดความกว้างของช่วงคาดการณ์ (80%)
(function (global) {
    'use strict';

    const HOUR = 3600e3;
    const TZ_OFFSET_H = 7; // Asia/Bangkok
    const floorHour = t => Math.floor(t / HOUR) * HOUR;
    const hod = t => (new Date(t).getUTCHours() + TZ_OFFSET_H) % 24;
    const fin = v => typeof v === 'number' && Number.isFinite(v);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    function median(arr) {
        const a = arr.filter(fin).sort((x, y) => x - y);
        if (!a.length) return null;
        const m = a.length >> 1;
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }

    // ค่าเฉลี่ยทั้งวิทยาเขตรายชั่วโมง: เฉลี่ยในแต่ละจุดก่อน แล้วเฉลี่ยข้ามจุด (จุดที่ส่งถี่ไม่ได้น้ำหนักมากกว่า)
    function campusHourly(rows) {
        const perNode = new Map(); // key `${node}|${hour}` → [sum, n]
        (rows || []).forEach(r => {
            if (!fin(r.pm25) || !fin(r.t) || r.pm25 < 0 || r.pm25 > 1000) return;
            const k = `${r.nodeId || 'x'}|${floorHour(r.t)}`;
            const cur = perNode.get(k) || [0, 0];
            cur[0] += r.pm25; cur[1] += 1;
            perNode.set(k, cur);
        });
        const perHour = new Map(); // hour → [sum of node means, nodes]
        perNode.forEach(([s, n], k) => {
            const h = +k.split('|')[1];
            const cur = perHour.get(h) || [0, 0];
            cur[0] += s / n; cur[1] += 1;
            perHour.set(h, cur);
        });
        const out = new Map();
        perHour.forEach(([s, n], h) => out.set(h, s / n));
        return out; // Map<hourMs, value>
    }

    // รูปแบบรายชั่วโมงของวัน (มัธยฐาน + ปรับให้เรียบด้วยค่าเฉลี่ยเคลื่อนที่ 3 ชั่วโมง)
    function hourProfile(obs, before, days = 14) {
        const from = before - days * 24 * HOUR;
        const buckets = Array.from({ length: 24 }, () => []);
        let total = 0;
        obs.forEach((v, t) => { if (t >= from && t < before) { buckets[hod(t)].push(v); total++; } });
        if (total < 48) return null;
        const overall = median([...buckets.flat()]);
        const raw = buckets.map(b => (b.length >= 3 ? median(b) : overall));
        return raw.map((v, i) => (raw[(i + 23) % 24] + 2 * v + raw[(i + 1) % 24]) / 4);
    }

    // ความเร็วที่ "ค่าผิดปกติ" จางลง (ชั่วโมง) จาก autocorrelation ที่ lag 1 ชั่วโมง
    function decayTau(obs, profile, before) {
        if (!profile) return 6;
        let num = 0, den = 0, pairs = 0;
        obs.forEach((v, t) => {
            if (t >= before) return;
            const next = obs.get(t + HOUR);
            if (!fin(next) || t + HOUR >= before) return;
            const a0 = v - profile[hod(t)];
            const a1 = next - profile[hod(t + HOUR)];
            num += a0 * a1; den += a0 * a0; pairs++;
        });
        if (pairs < 24 || den <= 0) return 6;
        const rho = num / den;
        if (!(rho > 0 && rho < 1)) return rho >= 1 ? 24 : 2;
        return clamp(-1 / Math.log(rho), 2, 24);
    }

    // อัตราส่วนปรับสเกล Open-Meteo ให้ตรงกับเซนเซอร์ของเรา
    function omRatio(obs, om, before, days = 7) {
        const from = before - days * 24 * HOUR;
        const ratios = [];
        obs.forEach((v, t) => {
            if (t < from || t >= before) return;
            const m = om.get(t);
            if (fin(m) && m > 1) ratios.push(v / m);
        });
        return ratios.length >= 12 ? clamp(median(ratios), 0.25, 4) : null;
    }

    // ค่าผิดปกติล่าสุด (เฉลี่ยไม่เกิน 3 ชั่วโมงที่มีข้อมูล ภายใน 3 ชั่วโมงก่อนจุดเริ่ม)
    function currentAnomaly(obs, profile, origin) {
        if (!profile) return 0;
        const vals = [];
        for (let k = 0; k <= 3; k++) {
            const t = origin - k * HOUR;
            const v = obs.get(t);
            if (fin(v)) vals.push(v - profile[hod(t)]);
        }
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }

    function omWeight(h) { return 0.25 + 0.5 * Math.min(1, h / 72); }

    // พยากรณ์จากจุดเริ่ม (origin) ไป H ชั่วโมง โดยใช้ข้อมูลก่อน origin เท่านั้น
    function forecastFrom(obs, om, origin, H, fixed) {
        const profile = fixed ? fixed.profile : hourProfile(obs, origin + HOUR);
        const tau = fixed ? fixed.tau : decayTau(obs, profile, origin + HOUR);
        const ratio = fixed ? fixed.ratio : omRatio(obs, om, origin + HOUR);
        const a0 = currentAnomaly(obs, profile, origin);
        const out = [];
        for (let h = 1; h <= H; h++) {
            const t = origin + h * HOUR;
            const local = profile ? profile[hod(t)] + a0 * Math.exp(-h / tau) : null;
            const m = om.get(t);
            const omc = fin(m) ? m * (ratio || 1) : null;
            let v = null, src = null;
            if (fin(local) && fin(omc)) { const w = omWeight(h); v = (1 - w) * local + w * omc; src = 'blend'; }
            else if (fin(local)) { v = local; src = 'local'; }
            else if (fin(omc)) { v = omc; src = 'om'; }
            out.push({ t, h, v: fin(v) ? Math.max(0, v) : null, src });
        }
        return { points: out, profile, tau, ratio };
    }

    // ทดสอบย้อนหลัง: จุดเริ่มทุก 6 ชั่วโมงในช่วง 7 วันก่อน (ต้องมีค่าจริงให้เทียบ)
    function backtest(obs, om, now) {
        const errs = { short: [], long: [] }; // 1–6 ชม., 7–24 ชม.
        const absErr = [], naiveErr = [];
        let origins = 0;
        for (let o = floorHour(now) - 7 * 24 * HOUR; o <= floorHour(now) - 6 * HOUR; o += 6 * HOUR) {
            const last = obs.get(o);
            if (!fin(last)) continue;
            const f = forecastFrom(obs, om, o, 24);
            if (!f.profile && f.ratio === null) continue;
            let used = false;
            f.points.forEach(p => {
                const actual = obs.get(p.t);
                if (!fin(actual) || !fin(p.v)) return;
                const e = p.v - actual;
                (p.h <= 6 ? errs.short : errs.long).push(e);
                absErr.push(Math.abs(e));
                naiveErr.push(Math.abs(last - actual));
                used = true;
            });
            if (used) origins++;
        }
        const rmse = a => (a.length ? Math.sqrt(a.reduce((s, e) => s + e * e, 0) / a.length) : null);
        const mean = a => (a.length ? a.reduce((s, e) => s + e, 0) / a.length : null);
        return {
            origins,
            samples: absErr.length,
            mae: mean(absErr),
            maeNaive: mean(naiveErr),
            rmseShort: rmse(errs.short),
            rmseLong: rmse(errs.long),
        };
    }

    /**
     * สร้างพยากรณ์
     * @param {object} p
     * @param {Array<{nodeId,t,pm25}>} p.rows   ข้อมูลย้อนหลังจากเซนเซอร์ (+ ค่าล่าสุดก็ได้)
     * @param {Array<{t,v}>} p.om               PM2.5 รายชั่วโมงจาก Open-Meteo (รวมอดีตเพื่อใช้ปรับสเกล)
     * @param {number} p.now                     เวลาปัจจุบัน (ms)
     * @param {number} p.hours                   จำนวนชั่วโมงที่ต้องการพยากรณ์
     */
    function build({ rows = [], om = [], now = Date.now(), hours = 120 } = {}) {
        const obs = campusHourly(rows);
        const omMap = new Map();
        om.forEach(p => { if (fin(p.v) && fin(p.t)) omMap.set(floorHour(p.t), p.v); });

        // จุดเริ่ม = ชั่วโมงล่าสุดที่มีค่าจริง (ไม่เก่ากว่า 3 ชั่วโมง) ไม่งั้นใช้ชั่วโมงปัจจุบัน
        const nowH = floorHour(now);
        let origin = nowH;
        let lastObs = null;
        for (let k = 0; k <= 3; k++) {
            const v = obs.get(nowH - k * HOUR);
            if (fin(v)) { origin = nowH - k * HOUR; lastObs = { t: origin, v }; break; }
        }

        const f = forecastFrom(obs, omMap, origin, hours + (nowH - origin) / HOUR);
        const bt = obs.size >= 72 ? backtest(obs, omMap, now) : null;
        const sigma = h => {
            if (bt && fin(bt.rmseShort) && fin(bt.rmseLong)) {
                if (h <= 6) return bt.rmseShort;
                if (h <= 24) return bt.rmseLong;
                return bt.rmseLong * (1 + (h - 24) / 96);
            }
            return null;
        };
        const points = f.points
            .filter(p => p.t > nowH - HOUR && fin(p.v))
            .map(p => {
                const s = sigma(p.h);
                const spread = fin(s) ? 1.28 * s : 0.35 * p.v + 2; // ช่วงคาดการณ์ ~80%
                return { t: p.t, v: p.v, lo: Math.max(0, p.v - spread), hi: p.v + spread, src: p.src };
            });

        const sources = new Set(points.map(p => p.src));
        const method = sources.has('blend') || (sources.has('local') && sources.has('om')) ? 'blend'
            : sources.has('local') ? 'local' : sources.has('om') ? 'om' : null;

        return {
            method,                  // 'blend' | 'local' | 'om' | null
            points,                  // [{t, v, lo, hi, src}] ทุกชั่วโมงหลังจุดเริ่ม
            observed: obs,           // Map<hourMs, ค่าเฉลี่ยทั้งวิทยาเขต>
            lastObs,                 // {t, v} | null
            tau: f.tau,
            ratio: f.ratio,
            hasProfile: !!f.profile,
            historyHours: obs.size,
            backtest: bt,
        };
    }

    const api = { build, campusHourly, hourProfile, decayTau, omRatio, backtest, forecastFrom, hod, floorHour };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.PKRU_PM_FORECAST = api;
})(typeof window !== 'undefined' ? window : globalThis);
