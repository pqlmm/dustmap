// ===== PKRU Air Quality — หน้าแรก (Redesign 2026) =====
// ปุ่มสลับธีม · เมนู Tubelight ตามตำแหน่งที่เลื่อน · แท็บ "เกี่ยวกับโครงการ" · เอฟเฟกต์ปรากฏตอนเลื่อน · ขอบเรืองแสงตามเมาส์
(function () {
    'use strict';

    // ---------- ธีม (ใช้ key เดียวกับแดชบอร์ด) ----------
    const THEME_KEY = 'pkru_aqm_theme';
    const root = document.documentElement;
    const themeBtn = document.getElementById('themeToggle');
    const metaTheme = document.querySelector('meta[name="theme-color"]');

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        if (metaTheme) metaTheme.content = theme === 'light' ? '#f4f7f5' : '#060b12';
        if (themeBtn) {
            // ใช้ข้อความเดียวกับแดชบอร์ด เพื่อให้ระบบแปลภาษาเดิมทำงานได้
            themeBtn.setAttribute('aria-label', theme === 'light' ? 'เปลี่ยนเป็นแผนที่มืด' : 'เปลี่ยนเป็นแผนที่สว่าง');
            themeBtn.setAttribute('aria-pressed', String(theme === 'light'));
        }
    }
    applyTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            applyTheme(next);
            try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
        });
    }
    // เปลี่ยนธีมจากอีกแท็บ (เช่นกดที่แดชบอร์ด)
    window.addEventListener('storage', e => {
        if (e.key === THEME_KEY && (e.newValue === 'light' || e.newValue === 'dark')) applyTheme(e.newValue);
    });

    // ---------- Tubelight navbar + tab bar มือถือ: ไฮไลต์ส่วนที่กำลังดู ----------
    const navLinks = [...document.querySelectorAll('#navpill a, #tabbar a')];
    const sections = [...new Set(navLinks.map(a => a.getAttribute('href')).filter(h => h && h.startsWith('#')))]
        .map(h => document.querySelector(h)).filter(Boolean);

    function setActive(id) {
        navLinks.forEach(a => {
            const on = a.getAttribute('href') === '#' + id;
            a.classList.toggle('active', on);
            if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
        });
    }
    function onScroll() {
        const y = window.scrollY + window.innerHeight * 0.35;
        let current = sections[0] && sections[0].id;
        sections.forEach(s => { if (s.offsetTop <= y) current = s.id; });
        if (current) setActive(current);
    }
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { onScroll(); ticking = false; });
    }, { passive: true });
    onScroll();

    // ---------- Animated Tabs ----------
    const tablist = document.getElementById('aboutTabs');
    if (tablist) {
        tablist.classList.remove('no-js');
        const tabs = [...tablist.querySelectorAll('[role="tab"]')];
        const indicator = tablist.querySelector('.tab-indicator');

        function moveIndicator(tab) {
            if (!indicator) return;
            indicator.style.width = tab.offsetWidth + 'px';
            indicator.style.height = tab.offsetHeight + 'px';
            indicator.style.transform = `translate(${tab.offsetLeft - 5}px, ${tab.offsetTop - 5}px)`;
        }
        function select(tab, focus) {
            tabs.forEach(t => {
                const on = t === tab;
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
                const panel = document.getElementById(t.getAttribute('aria-controls'));
                if (panel) panel.hidden = !on;
            });
            moveIndicator(tab);
            if (focus) tab.focus();
        }
        tabs.forEach((t, i) => {
            t.addEventListener('click', () => select(t));
            t.addEventListener('keydown', e => {
                let n = null;
                if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
                if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
                if (e.key === 'Home') n = tabs[0];
                if (e.key === 'End') n = tabs[tabs.length - 1];
                if (n) { e.preventDefault(); select(n, true); }
            });
        });
        const current = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
        requestAnimationFrame(() => moveIndicator(current));
        window.addEventListener('resize', () => moveIndicator(tabs.find(t => t.getAttribute('aria-selected') === 'true')));
        // ความกว้างปุ่มเปลี่ยนเมื่อสลับภาษา / ฟอนต์โหลดเสร็จ
        document.addEventListener('pkru:langchange', () => setTimeout(() => moveIndicator(tabs.find(t => t.getAttribute('aria-selected') === 'true')), 50));
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveIndicator(tabs.find(t => t.getAttribute('aria-selected') === 'true')));
    }

    // ---------- Reveal on scroll ----------
    const revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) { entry.target.classList.add('revealed'); io.unobserve(entry.target); }
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(el => io.observe(el));
    } else {
        root.classList.add('no-io');
    }

    // ---------- Glowing Effect: ขอบเรืองแสงหันตามเมาส์ ----------
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
        document.querySelectorAll('.glow').forEach(card => {
            card.addEventListener('pointermove', e => {
                const r = card.getBoundingClientRect();
                const angle = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI + 90 - 72 * 3.6;
                card.style.setProperty('--glow-angle', angle.toFixed(0) + 'deg');
            });
        });
    }

    // ---------- แผนที่ Campus (Leaflet + OpenStreetMap) — หมุดแบบเดียวกับแดชบอร์ด ----------
    // พิกัดและไอคอนคณะเหมือนใน app.js (SENSOR_NODES / FACULTY_ICONS)
    const MINI_NODES = [
        { id: 'node2', short: 'วิทยาศาสตร์', place: 'right', lat: 7.914588491091475, lng: 98.38881665269558,
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/></svg>' },
        { id: 'node3', short: 'มนุษยศาสตร์', place: 'bottom', lat: 7.9090528204855755, lng: 98.38655930865212,
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5c2.8-1.3 5.3-.8 8 1.1v12c-2.7-1.9-5.2-2.4-8-1.1z"/><path d="M20 5.5c-2.8-1.3-5.3-.8-8 1.1v12c2.7-1.9 5.2-2.4 8-1.1z"/><path d="M8 10h2M14 10h2"/></svg>' },
        { id: 'node4', short: 'วิทยาการจัดการ', place: 'left', lat: 7.913082581293544, lng: 98.38724860930434,
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V10M10 19V5M16 19v-7M22 19V8"/><path d="m4 7 5-3 5 3 6-5"/><path d="M17 2h3v3"/></svg>' },
    ];
    const miniEl = document.getElementById('miniMap');
    if (miniEl && window.L) {
        const art = miniEl.parentElement.querySelector('.map-art');
        const map = L.map(miniEl, {
            zoomControl: true,
            scrollWheelZoom: false,          // ไม่แย่งการเลื่อนหน้าเว็บ
            dragging: !L.Browser.mobile,     // มือถือ: ใช้นิ้วเลื่อนหน้าได้ตามปกติ
            tap: false,
            zoomSnap: 0.25,
            attributionControl: true,
        });
        map.attributionControl.setPrefix(false);
        map.zoomControl.setPosition('topleft');
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 20,
        }).addTo(map);
        const bounds = L.latLngBounds(MINI_NODES.map(n => [n.lat, n.lng]));
        const foot = miniEl.parentElement.querySelector('.map-tile-foot');
        const fit = () => {
            const side = Math.min(130, miniEl.clientWidth * 0.28);
            const bottom = (foot ? foot.offsetHeight : 90) + 64;
            map.fitBounds(bounds, { paddingTopLeft: [side, 56], paddingBottomRight: [side, bottom], maxZoom: 17.5 });
        };
        fit();
        MINI_NODES.forEach(n => {
            const icon = L.divIcon({
                className: 'lm-marker',
                html: `<div class="lm-outer" data-pin="${n.id}"><span class="lm-inner">${n.icon}</span><b class="lm-val">--</b><span class="lm-label ${n.place}">${n.short}</span></div>`,
                iconSize: [48, 48],
                iconAnchor: [24, 24],
            });
            L.marker([n.lat, n.lng], { icon, keyboard: false, title: n.short })
                .on('click', () => { window.location.href = 'dashboard.html'; })
                .addTo(map);
        });
        if (art) art.style.display = 'none';
        // การ์ดอยู่ใน Bento grid — ขนาดเปลี่ยนตามจอ
        if ('ResizeObserver' in window) new ResizeObserver(() => { map.invalidateSize(); fit(); }).observe(miniEl);
    }
})();
