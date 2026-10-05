// ===== PKRU Air Quality — กราฟ "สถิติค่า PM2.5 รายสัปดาห์" (หน้าแรก) =====
// ดึงค่าย้อนหลัง 7 วันจาก InfluxDB ผ่าน Aerolink API (PKRU_API.history → /api/history)
// แล้วคิด "ค่าเฉลี่ยรายวันของทุกจุดตรวจวัด" ตามวันที่เวลาไทย (Asia/Bangkok)
// ถ้า API ปิดอยู่ / ดึงไม่ได้ / ยังไม่มีข้อมูล → คงข้อมูลตัวอย่างไว้ และบอกเหตุผลใต้หัวข้อ
(function () {
    'use strict';
    const API = window.PKRU_API;
    const $ = id => document.getElementById(id);
    const card = $('weeklyCard');
    if (!card) return;

    const TZ = 'Asia/Bangkok';
    const WATCH = 37.5;                 // เกณฑ์เฝ้าระวัง (เส้นประ)
    const W = 700, H = 240, TOP = 14;   // ขนาด viewBox ของกราฟ
    const dayKey = d => d.toLocaleDateString('en-CA', { timeZone: TZ });                 // 2026-10-05
    const dayLabel = d => d.toLocaleDateString('th-TH', { timeZone: TZ, weekday: 'short' }); // จ. อ. ...
    const dayFull = d => d.toLocaleDateString('th-TH', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

    function setNote(text) { $('weeklyNote').textContent = text; }

    // เส้นโค้งผ่านทุกจุด (Catmull-Rom → Bézier)
    function smoothPath(pts) {
        if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
        let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
            const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
            const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C${c1x.toFixed(1)},${Math.min(H, c1y).toFixed(1)} ${c2x.toFixed(1)},${Math.min(H, c2y).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        }
        return d;
    }

    function render(days) {
        const withData = days.filter(d => d.avg !== null);
        const vals = withData.map(d => d.avg);
        const yMax = Math.max(50, Math.ceil(Math.max(...vals) * 1.15 / 5) * 5);
        const y = v => TOP + (H - TOP) * (1 - v / yMax);
        const x = i => (W * i) / (days.length - 1);

        const pts = days.map((d, i) => (d.avg === null ? null : { x: x(i), y: y(d.avg), d }))
            .filter(Boolean);
        const line = smoothPath(pts);
        const first = pts[0], last = pts[pts.length - 1];
        $('weeklyLine').setAttribute('d', line);
        $('weeklyArea').setAttribute('d', `${line} L${last.x.toFixed(1)},${H} L${first.x.toFixed(1)},${H} Z`);
        const ty = y(WATCH).toFixed(1);
        $('weeklyThreshold').setAttribute('y1', ty);
        $('weeklyThreshold').setAttribute('y2', ty);

        // จุดค่ารายวัน (HTML เพื่อไม่ให้วงกลมยืดตามกราฟ)
        $('weeklyDots').innerHTML = pts.map(p =>
            `<i class="chart-dot${p.d.avg > WATCH ? ' over' : ''}${p.x < 40 ? ' edge-l' : ''}${p.x > W - 40 ? ' edge-r' : ''}" style="left:${(p.x / W * 100).toFixed(2)}%;top:${(p.y / H * 100).toFixed(2)}%" title="${dayFull(p.d.date)} · PM2.5 ${p.d.avg.toFixed(1)} μg/m³"><span>${p.d.avg.toFixed(1)}</span></i>`
        ).join('');
        $('weeklyDays').innerHTML = days.map(d => `<span>${dayLabel(d.date)}</span>`).join('');

        const min = Math.min(...vals), max = Math.max(...vals);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        $('weeklyMin').textContent = min.toFixed(1);
        $('weeklyAvg').textContent = avg.toFixed(1);
        $('weeklyMax').textContent = max.toFixed(1);
        $('weeklyOver').textContent = `${vals.filter(v => v > WATCH).length} วัน`;

        setNote(withData.length === days.length
            ? 'ค่าเฉลี่ยรายวันจากเซนเซอร์ทุกจุด (InfluxDB) · ย้อนหลัง 7 วัน'
            : `ค่าเฉลี่ยรายวันจากเซนเซอร์ทุกจุด (InfluxDB) · มีข้อมูล ${withData.length} จาก 7 วัน`);
    }

    async function load() {
        if (!API || !API.enabled) return;            // ไม่มี API → ใช้ข้อมูลตัวอย่างเดิม
        card.classList.add('is-loading');
        setNote('กำลังดึงข้อมูลย้อนหลังจาก InfluxDB…');
        try {
            const res = await API.history(7 * 24, { fields: ['pm25'] });
            const rows = (res.rows || []).filter(r => Number.isFinite(r.pm25));

            // 7 วันล่าสุด (รวมวันนี้) ตามเวลาไทย
            const now = Date.now();
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date(now - i * 86400000);
                days.push({ key: dayKey(date), date, sum: 0, n: 0, avg: null });
            }
            const byKey = Object.fromEntries(days.map(d => [d.key, d]));
            rows.forEach(r => {
                const d = byKey[dayKey(new Date(r.t))];
                if (d) { d.sum += r.pm25; d.n += 1; }
            });
            days.forEach(d => { if (d.n) d.avg = d.sum / d.n; });

            if (!days.some(d => d.avg !== null)) {
                setNote('ยังไม่มีข้อมูลใน InfluxDB — แสดงข้อมูลตัวอย่าง');
                return;
            }
            render(days);
        } catch (err) {
            console.warn('[weekly] ดึงข้อมูลย้อนหลังไม่ได้:', err && (err.message || err));
            setNote('ดึงข้อมูลจาก InfluxDB ไม่ได้ — แสดงข้อมูลตัวอย่าง');
        } finally {
            card.classList.remove('is-loading');
        }
    }

    load();
    // อัปเดตทุก 30 นาที (ค่ารายวันเปลี่ยนช้า)
    setInterval(load, 30 * 60 * 1000);
})();
