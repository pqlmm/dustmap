// ===== PKRU Air Quality — ส่วนเสริมแดชบอร์ด (Redesign 2026) =====
// Dock ด้านล่างแผนที่ · ป้ายค่า PM2.5 บนหมุด · คำอธิบายสีบนแผนที่ (ลิงก์ไปเกณฑ์ กรมควบคุมมลพิษ)
// ทุกอย่างเรียกใช้ข้อมูล/ฟังก์ชันเดิมของ app.js (SENSOR_NODES, selectNode, state.markers) ไม่มีตรรกะข้อมูลใหม่
(function () {
    'use strict';
    const map = document.getElementById('mapContainer');
    if (!map) return;

    const icons = {
        home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
        panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
        history: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
        compare: '<path d="M4 6h10M4 12h16M4 18h7"/>',
        sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
    };
    const svg = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

    const dock = document.createElement('nav');
    dock.className = 'rd-dock';
    dock.setAttribute('aria-label', 'เครื่องมือแผนที่');
    dock.innerHTML = `
        <a class="rd-dock-item" href="index.html" aria-label="หน้าแรก">${svg(icons.home)}<span class="rd-tip" aria-hidden="true">หน้าแรก</span></a>
        <button type="button" class="rd-dock-item" data-act="panel" aria-label="แสดง/ซ่อนแถบข้อมูล">${svg(icons.panel)}<span class="rd-tip" aria-hidden="true">แสดง/ซ่อนแถบข้อมูล</span></button>
        <button type="button" class="rd-dock-item is-accent" data-act="history" aria-label="ดูข้อมูลย้อนหลังทั้งหมด">${svg(icons.history)}<span class="rd-tip" aria-hidden="true">ดูข้อมูลย้อนหลังทั้งหมด</span></button>
        <button type="button" class="rd-dock-item" data-act="compare" aria-label="เปรียบเทียบ PM2.5 กับแหล่งอื่น">${svg(icons.compare)}<span class="rd-tip" aria-hidden="true">เปรียบเทียบ PM2.5 กับแหล่งอื่น</span></button>
        <span class="rd-dock-sep" aria-hidden="true"></span>
        <button type="button" class="rd-dock-item" data-act="theme" aria-label="สลับธีมมืด/สว่าง">${svg(icons.sun, 'rd-icon-sun')}${svg(icons.moon, 'rd-icon-moon')}<span class="rd-tip" aria-hidden="true">สลับธีมมืด/สว่าง</span></button>
        <button type="button" class="rd-dock-item" data-act="lang" aria-label="เปลี่ยนภาษา TH/EN"><span data-role="lang">EN</span><span class="rd-tip" aria-hidden="true">เปลี่ยนภาษา TH/EN</span></button>`;
    map.appendChild(dock);

    const sidebar = document.getElementById('sidebar');
    const openSidebarIfClosed = () => {
        if (sidebar && sidebar.classList.contains('collapsed')) document.getElementById('sidebarToggle')?.click();
    };
    const langLabel = dock.querySelector('[data-role="lang"]');
    const syncLang = () => { langLabel.textContent = window.PKRU_LANG === 'en' ? 'TH' : 'EN'; };
    syncLang();
    document.addEventListener('pkru:langchange', syncLang);

    dock.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        switch (btn.dataset.act) {
            case 'panel':
                document.getElementById('sidebarToggle')?.click();
                break;
            case 'history':
                document.getElementById('archiveOpen')?.click();
                break;
            case 'compare': {
                openSidebarIfClosed();
                const target = document.querySelector('.compare-sources');
                if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 360);
                break;
            }
            case 'theme':
                document.getElementById('themeToggle')?.click();
                break;
            case 'lang':
                if (typeof window.PKRU_setLanguage === 'function') window.PKRU_setLanguage(window.PKRU_LANG === 'en' ? 'th' : 'en');
                break;
        }
    });

    // ---------- ข้อมูลจาก app.js ----------
    const nodes = () => (typeof SENSOR_NODES !== 'undefined' ? SENSOR_NODES : []);
    const t = s2 => (window.PKRU_LANG === 'en' && typeof window.PKRU_T === 'function' ? window.PKRU_T(s2) : s2);
    const fmt = v => (Number.isFinite(v) ? v.toFixed(1) : '--');

    // ---------- ป้ายค่า PM2.5 บนหมุด ----------
    function syncBadges() {
        if (typeof state === 'undefined' || !state.markers) return;
        nodes().forEach(n => {
            const m = state.markers[n.id];
            const el = m && m.getElement && m.getElement();
            const outer = el && el.querySelector('.marker-outer');
            if (!outer) return;
            let badge = outer.querySelector('.rd-val');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'rd-val';
                badge.setAttribute('aria-hidden', 'true');
                outer.appendChild(badge);
            }
            const txt = fmt(n.data && n.data.pm25);
            if (badge.textContent !== txt) badge.textContent = txt;
        });
    }
    let badgeQueued = false;
    const queueBadges = () => {
        if (badgeQueued) return;
        badgeQueued = true;
        requestAnimationFrame(() => { badgeQueued = false; syncBadges(); });
    };
    const startBadgeObserver = () => {
        const pane = map.querySelector('.leaflet-marker-pane');
        if (!pane) { setTimeout(startBadgeObserver, 300); return; }
        new MutationObserver(queueBadges).observe(pane, { childList: true, subtree: true });
        syncBadges();
        setInterval(syncBadges, 5000);
    };
    startBadgeObserver();

    // ---------- คำอธิบายสีบนแผนที่ ----------
    const legend = document.createElement('div');
    legend.className = 'rd-map-legend';
    legend.setAttribute('aria-label', 'มาตรฐานสีคุณภาพอากาศ (PM2.5)');
    legend.innerHTML = `<a class="rd-legend-title" href="https://epo03.pcd.go.th/th/news/detail/154265/" target="_blank" rel="noopener noreferrer">มาตรฐาน PM2.5 <span aria-hidden="true">↗</span></a>
        <span><i style="background:#22d3ee"></i>ดีมาก</span>
        <span><i style="background:#10b981"></i>ดี</span>
        <span><i style="background:#eab308"></i>ปานกลาง</span>
        <span><i style="background:#f97316"></i>เริ่มมีผลกระทบ</span>
        <span><i style="background:#f43f5e"></i>มีผลต่อสุขภาพ</span>`;
    map.appendChild(legend);

    // ---------- เลือกจุดแล้วเลื่อนแผนที่ไม่ให้หมุดถูกแผงรายละเอียด (ด้านขวา) บัง ----------
    if (typeof window.selectNode === 'function') {
        const originalSelect = window.selectNode;
        window.selectNode = function (nodeId) {
            originalSelect(nodeId);
            if (window.innerWidth <= 768 || typeof state === 'undefined' || !state.map) return;
            const panel = document.getElementById('detailPanel');
            const w = panel ? panel.offsetWidth : 0;
            if (w) setTimeout(() => state.map.panBy([(w + 48) / 2, 0], { animate: true, duration: 0.4 }), 550);
        };
    }
})();
