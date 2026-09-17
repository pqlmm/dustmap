/**
 * PKRU Air Quality Map — Interactive Campus Map
 * มหาวิทยาลัยราชภัฏภูเก็ต
 * Real-time PM2.5, Temperature, Humidity via MQTT
 */

// ===== Sensor Node Definitions =====
// จุดติดตั้งเซ็นเซอร์ภายใน มรภ.ภูเก็ต
const SENSOR_NODES = [
    {
        id: 'node2',
        name: 'คณะวิทยาศาสตร์และเทคโนโลยี',
        description: 'Faculty of Science & Technology',
        lat: 7.914588491091475,
        lng: 98.38881665269558,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    },
    {
        id: 'node3',
        name: 'คณะมนุษยศาสตร์และสังคมศาสตร์',
        description: 'Faculty of Humanities & Social Sciences',
        lat: 7.9090528204855755,
        lng: 98.38655930865212,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    },
    {
        id: 'node4',
        name: 'คณะวิทยาการจัดการ',
        description: 'Faculty of Management Sciences',
        lat: 7.913082581293544,
        lng: 98.38724860930434,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    }
];

// ไอคอนช่วยแยกประเภทคณะเมื่อมองบนแผนที่
const FACULTY_ICONS = {
    node2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-label="คณะวิทยาศาสตร์"><ellipse cx="12" cy="12" rx="9" ry="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/></svg>',
    node3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-label="คณะมนุษยศาสตร์"><path d="M4 5.5c2.8-1.3 5.3-.8 8 1.1v12c-2.7-1.9-5.2-2.4-8-1.1z"/><path d="M20 5.5c-2.8-1.3-5.3-.8-8 1.1v12c2.7-1.9 5.2-2.4 8-1.1z"/><path d="M8 10h2M14 10h2"/></svg>',
    node4: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-label="คณะวิทยาการจัดการ"><path d="M4 19V10M10 19V5M16 19v-7M22 19V8"/><path d="m4 7 5-3 5 3 6-5"/><path d="M17 2h3v3"/></svg>',
};

function getFacultyIcon(nodeId) {
    return FACULTY_ICONS[nodeId] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>';
}

// ===== Simulation =====
let simulationInterval = null;

function randomInRange(min, max) {
    return min + Math.random() * (max - min);
}

// สุ่มค่าเริ่มต้นให้แต่ละ node สมจริง
function generateSimulatedData() {
    SENSOR_NODES.forEach(node => {
        // สุ่ม PM2.5: ภูเก็ตปกติอยู่ 8-45 μg/m³
        const basePM25 = node.data.pm25 !== null ? node.data.pm25 : randomInRange(10, 40);
        node.data.pm25 = Math.max(1, basePM25 + randomInRange(-3, 3));

        // สุ่ม อุณหภูมิ: ภูเก็ต 27-36°C
        const baseTemp = node.data.temperature !== null ? node.data.temperature : randomInRange(28, 35);
        node.data.temperature = Math.max(20, Math.min(42, baseTemp + randomInRange(-0.5, 0.5)));

        // สุ่ม ความชื้น: ภูเก็ต 60-90%
        const baseHum = node.data.humidity !== null ? node.data.humidity : randomInRange(60, 88);
        node.data.humidity = Math.max(30, Math.min(99, baseHum + randomInRange(-2, 2)));

        node.data.lastUpdate = new Date();
        onNodeDataUpdate(node.id);
    });
}

function startSimulation() {
    if (simulationInterval) return;
    generateSimulatedData();
    // อัปเดตทุก 5 วินาที
    simulationInterval = setInterval(generateSimulatedData, 5000);
    showToast('โหมดจำลองข้อมูล — สุ่มค่าอัตโนมัติ', 'info', 4000);
}

function stopSimulation() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
}

// ===== MQTT Configuration =====
// ✏️ แก้ไขค่าเชื่อมต่อ MQTT ตรงนี้
const MQTT_CONFIG = {
    host: 'broker.hivemq.com',
    port: 8884,
    protocol: 'wss',
    path: '/mqtt',
    username: '',
    password: '',
    topicPrefix: 'sensor',
};

// ===== Discord Webhook Configuration =====
// ✏️ ใส่ Discord Webhook URL เพื่อรับแจ้งเตือนเมื่อ PM2.5 เกิน threshold
const DISCORD_CONFIG = {
    webhookUrl: '',  // ← ใส่ URL webhook ของ Discord ที่นี่
    threshold: 50,   // แจ้งเตือนเมื่อ PM2.5 เกินค่านี้ (μg/m³)
    cooldownMinutes: 15,  // ระยะเวลาขั้นต่ำระหว่างการแจ้งเตือนของแต่ละจุด (นาที)
};

// ===== State =====
const state = {
    client: null,
    connected: false,
    map: null,
    tileLayer: null,
    markers: {},
    selectedNodeId: null,
    theme: 'dark',
    historyRange: 1,
    overviewHistoryRange: 1,
    discordLastAlert: {},  // { nodeId: timestamp } cooldown tracker
};

// ===== DOM =====
const dom = {
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    mobileToggle: document.getElementById('mobileToggle'),
    themeToggle: document.getElementById('themeToggle'),
    // Overview
    avgPM25: document.getElementById('avgPM25'),
    avgTemp: document.getElementById('avgTemp'),
    avgHum: document.getElementById('avgHum'),
    // Health advisory
    healthAdvisory: document.getElementById('healthAdvisory'),
    healthIcon: document.getElementById('healthIcon'),
    healthText: document.getElementById('healthText'),
    healthSub: document.getElementById('healthSub'),
    // Global timestamp
    globalTimestamp: document.getElementById('globalTimestamp'),
    globalTimestampText: document.getElementById('globalTimestampText'),
    globalTimestampDot: document.getElementById('globalTimestampDot'),
    // Campus-wide historical chart
    overviewChart: document.getElementById('overviewChart'),
    overviewChartEmpty: document.getElementById('overviewChartEmpty'),
    // Detail health advisory
    detailHealthIcon: document.getElementById('detailHealthIcon'),
    detailHealthText: document.getElementById('detailHealthText'),
    // Node list
    nodeList: document.getElementById('nodeList'),
    // Detail panel
    detailPanel: document.getElementById('detailPanel'),
    detailClose: document.getElementById('detailClose'),
    detailNodeName: document.getElementById('detailNodeName'),
    detailNodeLocation: document.getElementById('detailNodeLocation'),
    detailMarkerIcon: document.getElementById('detailMarkerIcon'),
    detailPM25: document.getElementById('detailPM25'),
    detailTemp: document.getElementById('detailTemp'),
    detailHum: document.getElementById('detailHum'),
    detailPM25Bar: document.getElementById('detailPM25Bar'),
    detailTempBar: document.getElementById('detailTempBar'),
    detailHumBar: document.getElementById('detailHumBar'),
    detailPM25Status: document.getElementById('detailPM25Status'),
    detailTempStatus: document.getElementById('detailTempStatus'),
    detailHumStatus: document.getElementById('detailHumStatus'),
    detailUpdate: document.getElementById('detailUpdate'),
    // History chart
    historyChart: document.getElementById('historyChart'),
    historyEmpty: document.getElementById('historyEmpty'),
    historySummary: document.getElementById('historySummary'),
    historyRangeLabel: document.getElementById('historyRangeLabel'),
    historyDownload: document.getElementById('historyDownload'),
    // Toast
    toastContainer: document.getElementById('toastContainer'),
};

// ===== AQI Helpers =====
function getAQILevel(pm25) {
    if (pm25 === null || pm25 === undefined) return { class: 'nodata', text: 'ไม่มีข้อมูล', color: '#64748b' };
    if (pm25 <= 15.0) return { class: 'very-good', text: 'ดีมาก', color: '#22d3ee' };
    if (pm25 <= 25.0) return { class: 'good', text: 'ดี', color: '#10b981' };
    if (pm25 <= 37.5) return { class: 'moderate', text: 'ปานกลาง', color: '#eab308' };
    if (pm25 <= 75.0) return { class: 'unhealthy-sg', text: 'เริ่มมีผลกระทบ', color: '#f97316' };
    return { class: 'unhealthy', text: 'มีผลต่อสุขภาพ', color: '#f43f5e' };
}

// ===== Health Advice (เกณฑ์ กรมควบคุมมลพิษ 2566) =====
function getHealthAdvice(pm25) {
    if (pm25 === null || pm25 === undefined) return { text: 'รอข้อมูล', sub: '', class: 'nodata' };
    if (pm25 <= 15.0) return { text: 'อากาศดีมาก', sub: 'ทำกิจกรรมกลางแจ้งได้ตามปกติ', class: 'very-good' };
    if (pm25 <= 25.0) return { text: 'อากาศดี', sub: 'ทำกิจกรรมกลางแจ้งได้ตามปกติ', class: 'good' };
    if (pm25 <= 37.5) return { text: 'ปานกลาง', sub: 'ผู้ที่มีโรคประจำตัวควรลดกิจกรรมกลางแจ้ง', class: 'moderate' };
    if (pm25 <= 75.0) return { text: 'เริ่มมีผลกระทบ', sub: 'ควรสวมหน้ากาก ลดกิจกรรมกลางแจ้ง', class: 'unhealthy-sg' };
    return { text: 'มีผลต่อสุขภาพ', sub: 'งดกิจกรรมกลางแจ้ง สวมหน้ากาก N95', class: 'unhealthy' };
}

function getHealthFaceIcon(level) {
    const head = '<path d="M7.7 14.2c.2-5.7 3.2-9.7 8.3-9.7 5.2 0 8.2 4 8.3 9.7v4.2c0 5.7-3.4 9.6-8.3 9.6s-8.3-3.9-8.3-9.6z"/><path d="M8 13.2c.3-2.5 1.1-5 3.4-6.5 2.5 1.3 5.5 1.8 8.6 1.3M22.7 7.9c1.1 1.4 1.5 3 1.4 5"/><path d="M5.8 15.3c-1.1.4-1.2 4.4 1.6 4.4M26.2 15.3c1.1.4 1.2 4.4-1.6 4.4"/>';
    const faces = {
        'very-good': `${head}<path d="M11.8 16.1h.1M20.1 16.1h.1M12.4 21.2c2 2.2 5.2 2.2 7.2 0"/>`,
        good: `${head}<path d="M12.2 16.1h.1M19.7 16.1h.1M13 22c1.7 1.1 4.3 1.1 6 0"/>`,
        moderate: `${head}<path d="M12.2 16.1h.1M19.7 16.1h.1M13 22h6"/>`,
        'unhealthy-sg': `${head}<path d="M12.2 15.7h.1M19.7 15.7h.1"/><path d="M8.2 18.1 11 17l5 1.1 5-1.1 2.8 1.1M10.7 18.3v5.5c3.3 2.1 7.3 2.1 10.6 0v-5.5"/><path d="M13 20.5h6M13 22.3h6"/>`,
        unhealthy: `${head}<path d="M11.6 15.8h.1M20.2 15.8h.1"/><path d="M7.5 18.2 10.8 17l5.2 1.1 5.2-1.1 3.3 1.2M10.4 18.4v5.8c3.5 2.3 7.7 2.3 11.2 0v-5.8"/><path d="M12.3 20.6h7.4M12.3 22.5h7.4M16 19.4v5.6"/>`,
        nodata: '<circle cx="16" cy="16" r="10"/><path d="M13.4 12.8a2.8 2.8 0 0 1 5.2 1.4c0 2-2.6 2.1-2.6 4M16 22h.1"/>',
    };
    const face = faces[level] || faces.nodata;
    return `<span class="health-face health-face-${level}" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${face}</svg></span>`;
}

function setHealthIcon(element, advice) {
    if (element) element.innerHTML = getHealthFaceIcon(advice.class);
}

function getTempStatus(temp) {
    if (temp === null) return '--';
    if (temp < 20) return 'เย็น';
    if (temp < 28) return 'สบาย';
    if (temp < 35) return 'อบอุ่น';
    return 'ร้อน';
}

function getHumStatus(hum) {
    if (hum === null) return '--';
    if (hum < 30) return 'แห้ง';
    if (hum < 60) return 'สบาย';
    if (hum < 80) return 'ชื้น';
    return 'ชื้นมาก';
}

// ===== Toast =====
function showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    dom.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== Theme =====
function initTheme() {
    const savedTheme = localStorage.getItem('pkru_aqm_theme');
    if (savedTheme) {
        state.theme = savedTheme;
    } else {
        // Auto detect system theme
        state.theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', state.theme);
    if (dom.themeToggle) {
        dom.themeToggle.setAttribute('aria-label', state.theme === 'light' ? 'เปลี่ยนเป็นแผนที่มืด' : 'เปลี่ยนเป็นแผนที่สว่าง');
    }
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('pkru_aqm_theme', state.theme);
    if (dom.themeToggle) {
        dom.themeToggle.setAttribute('aria-label', state.theme === 'light' ? 'เปลี่ยนเป็นแผนที่มืด' : 'เปลี่ยนเป็นแผนที่สว่าง');
    }
    
    // OpenStreetMap tiles do not require an API key; keep the same source in both UI themes.
    if (state.tileLayer) {
        state.tileLayer.setUrl('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    }
}

// ===== Initialize Map =====
function initMap() {
    // Center on PKRU campus
    state.map = L.map('map', {
        center: [7.9126, 98.3872],
        zoom: 17,
        zoomControl: false,
        attributionControl: true,
    });

    // Add custom sidebar-toggle control
    const SidebarToggleControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control-sidebar-toggle leaflet-bar leaflet-control');
            const link = L.DomUtil.create('a', '', container);
            link.href = '#';
            link.title = 'เปิดเมนู';
            link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><polyline points="9 18 15 12 9 6"/></svg>';
            link.setAttribute('role', 'button');
            link.setAttribute('aria-label', 'เปิดแถบข้อมูล');

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(link, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                dom.sidebar.classList.remove('collapsed');
                container.classList.remove('visible');
                if (dom.sidebarToggle) dom.sidebarToggle.setAttribute('aria-expanded', 'true');
                setTimeout(() => state.map.invalidateSize(), 350);
            });

            state.sidebarToggleControl = container;
            return container;
        }
    });
    new SidebarToggleControl().addTo(state.map);

    // OpenStreetMap public tiles — no API key needed
    const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        
    state.tileLayer = L.tileLayer(tileUrl, {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 20
    }).addTo(state.map);

    // Add markers for each sensor node
    SENSOR_NODES.forEach(node => {
        createMarker(node);
    });

    // Map click to deselect
    state.map.on('click', () => {
        deselectNode();
    });
}

// ===== Create Custom Marker =====
function createMarker(node) {
    const aqi = getAQILevel(node.data.pm25);
    const markerClass = `marker-${aqi.class}`;

    const icon = L.divIcon({
        className: `custom-marker ${markerClass}`,
        html: `
            <div class="marker-outer">
                <div class="marker-inner">${getFacultyIcon(node.id)}</div>
                <span class="marker-label">${node.name}</span>
            </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        popupAnchor: [0, -28],
    });

    const marker = L.marker([node.lat, node.lng], { icon }).addTo(state.map);

    // Popup
    marker.bindPopup(() => createPopupContent(node), {
        closeButton: true,
        className: '',
        maxWidth: 260,
    });

    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        selectNode(node.id);
    });

    state.markers[node.id] = marker;
}

function createPopupContent(node) {
    const aqi = getAQILevel(node.data.pm25);
    const pm25 = node.data.pm25 !== null ? node.data.pm25.toFixed(1) : '--';
    const temp = node.data.temperature !== null ? node.data.temperature.toFixed(1) : '--';
    const hum = node.data.humidity !== null ? node.data.humidity.toFixed(1) : '--';

    return `
        <div class="popup-content">
            <div class="popup-title">${node.name}</div>
            <div class="popup-row">
                <span class="popup-row-label">PM2.5</span>
                <span class="popup-row-value" style="color:${aqi.color}">${pm25} <small>μg/m³</small></span>
            </div>
            <div class="popup-row">
                <span class="popup-row-label">อุณหภูมิ</span>
                <span class="popup-row-value" style="color:#f97316">${temp} <small>°C</small></span>
            </div>
            <div class="popup-row">
                <span class="popup-row-label">ความชื้น</span>
                <span class="popup-row-value" style="color:#22d3ee">${hum} <small>%</small></span>
            </div>
            <button class="popup-btn" onclick="selectNode('${node.id}')">ดูรายละเอียด</button>
        </div>
    `;
}

// ===== Update Marker =====
function updateMarker(nodeId) {
    const node = SENSOR_NODES.find(n => n.id === nodeId);
    if (!node) return;

    const marker = state.markers[nodeId];
    if (!marker) return;

    const aqi = getAQILevel(node.data.pm25);
    const markerClass = `marker-${aqi.class}`;
    const isActive = state.selectedNodeId === nodeId;

    const icon = L.divIcon({
        className: `custom-marker ${markerClass} ${isActive ? 'marker-active' : ''}`,
        html: `
            <div class="marker-outer">
                <div class="marker-inner">${getFacultyIcon(node.id)}</div>
                <span class="marker-label">${node.name}</span>
            </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        popupAnchor: [0, -28],
    });

    marker.setIcon(icon);

    // Update popup content
    marker.setPopupContent(createPopupContent(node));
}

// ===== Node Selection =====
function selectNode(nodeId) {
    const node = SENSOR_NODES.find(n => n.id === nodeId);
    if (!node) return;

    // Deselect previous
    if (state.selectedNodeId) {
        updateMarker(state.selectedNodeId);
    }

    state.selectedNodeId = nodeId;
    updateMarker(nodeId);
    updateDetailPanel(node);
    renderHistoryChart();
    updateNodeList();

    // Pan to marker
    state.map.panTo([node.lat, node.lng], { animate: true, duration: 0.5 });

    // Close popup if open
    const marker = state.markers[nodeId];
    if (marker) marker.closePopup();

    // Show detail panel
    dom.detailPanel.classList.add('active');

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        dom.sidebar.classList.remove('open');
    }
}

function deselectNode() {
    if (state.selectedNodeId) {
        const prevId = state.selectedNodeId;
        state.selectedNodeId = null;
        updateMarker(prevId);
        updateNodeList();
    }
    dom.detailPanel.classList.remove('active');
}

// ===== Detail Panel =====
function updateDetailPanel(node) {
    const aqi = getAQILevel(node.data.pm25);
    const advice = getHealthAdvice(node.data.pm25);

    dom.detailNodeName.textContent = node.name;
    dom.detailNodeLocation.textContent = node.description;
    dom.detailMarkerIcon.style.background = `linear-gradient(135deg, ${aqi.color}, ${aqi.color}dd)`;
    dom.detailMarkerIcon.innerHTML = getFacultyIcon(node.id);

    // PM2.5 — dynamic color
    const pm25 = node.data.pm25;
    dom.detailPM25.textContent = pm25 !== null ? pm25.toFixed(1) : '--';
    dom.detailPM25.style.color = aqi.color;
    dom.detailPM25Bar.style.width = pm25 !== null ? Math.min(pm25 / 150 * 100, 100) + '%' : '0%';
    dom.detailPM25Status.textContent = aqi.text;
    dom.detailPM25Status.style.color = aqi.color;

    // Temperature
    const temp = node.data.temperature;
    dom.detailTemp.textContent = temp !== null ? temp.toFixed(1) : '--';
    dom.detailTempBar.style.width = temp !== null ? Math.min(temp / 50 * 100, 100) + '%' : '0%';
    dom.detailTempStatus.textContent = getTempStatus(temp);

    // Humidity
    const hum = node.data.humidity;
    dom.detailHum.textContent = hum !== null ? hum.toFixed(1) : '--';
    dom.detailHumBar.style.width = hum !== null ? Math.min(hum, 100) + '%' : '0%';
    dom.detailHumStatus.textContent = getHumStatus(hum);

    // Detail health advisory
    setHealthIcon(dom.detailHealthIcon, advice);
    if (dom.detailHealthText) dom.detailHealthText.textContent = `${advice.text} — ${advice.sub}`;

    // Last update
    if (node.data.lastUpdate) {
        const time = node.data.lastUpdate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        dom.detailUpdate.textContent = `อัปเดตล่าสุด: ${time}`;
    } else {
        dom.detailUpdate.textContent = 'รอข้อมูล...';
    }
}

// ===== Node List (Sidebar) =====
function buildNodeList() {
    if (!dom.nodeList) return;
    dom.nodeList.innerHTML = '';
    SENSOR_NODES.forEach(node => {
        const aqi = getAQILevel(node.data.pm25);
        const el = document.createElement('div');
        el.className = `node-item ${state.selectedNodeId === node.id ? 'active' : ''}`;
        el.dataset.nodeId = node.id;

        const pm25 = node.data.pm25 !== null ? node.data.pm25.toFixed(1) : '--';
        const temp = node.data.temperature !== null ? node.data.temperature.toFixed(1) : '--';
        const hum = node.data.humidity !== null ? node.data.humidity.toFixed(1) : '--';

        el.innerHTML = `
            <div class="node-marker" style="background:${aqi.color}">
                ${getFacultyIcon(node.id)}
            </div>
            <div class="node-info">
                <div class="node-name">${node.name}</div>
                <div class="node-readings">
                    <span class="node-reading"><strong>${pm25}</strong> μg/m³</span>
                    <span class="node-reading"><strong>${temp}</strong> °C</span>
                    <span class="node-reading"><strong>${hum}</strong> %</span>
                </div>
            </div>
        `;

        el.addEventListener('click', () => selectNode(node.id));
        dom.nodeList.appendChild(el);
    });
}

function updateNodeList() {
    if (!dom.nodeList) return;
    const items = dom.nodeList.querySelectorAll('.node-item');
    items.forEach(item => {
        const nodeId = item.dataset.nodeId;
        const node = SENSOR_NODES.find(n => n.id === nodeId);
        if (!node) return;

        const aqi = getAQILevel(node.data.pm25);
        item.className = `node-item ${state.selectedNodeId === nodeId ? 'active' : ''}`;

        const marker = item.querySelector('.node-marker');
        marker.style.background = aqi.color;
        marker.style.color = '#fff';

        const pm25 = node.data.pm25 !== null ? node.data.pm25.toFixed(1) : '--';
        const temp = node.data.temperature !== null ? node.data.temperature.toFixed(1) : '--';
        const hum = node.data.humidity !== null ? node.data.humidity.toFixed(1) : '--';

        const readings = item.querySelector('.node-readings');
        readings.innerHTML = `
            <span class="node-reading"><strong>${pm25}</strong> μg/m³</span>
            <span class="node-reading"><strong>${temp}</strong> °C</span>
            <span class="node-reading"><strong>${hum}</strong> %</span>
        `;
    });
}

// ===== Update Overview =====
function updateOverview() {
    const pm25Nodes = SENSOR_NODES.filter(n => n.data.pm25 !== null);
    const tempNodes = SENSOR_NODES.filter(n => n.data.temperature !== null);
    const humNodes = SENSOR_NODES.filter(n => n.data.humidity !== null);

    if (pm25Nodes.length > 0) {
        const avg = pm25Nodes.reduce((s, n) => s + n.data.pm25, 0) / pm25Nodes.length;
        const aqi = getAQILevel(avg);
        const advice = getHealthAdvice(avg);

        dom.avgPM25.textContent = avg.toFixed(1);
        dom.avgPM25.style.color = aqi.color;
        dom.avgPM25.classList.add('value-update');
        setTimeout(() => dom.avgPM25.classList.remove('value-update'), 500);

        // Update sidebar health advisory
        setHealthIcon(dom.healthIcon, advice);
        if (dom.healthText) dom.healthText.textContent = advice.text;
        if (dom.healthSub) dom.healthSub.textContent = advice.sub;
        if (dom.healthAdvisory) {
            dom.healthAdvisory.className = `health-advisory ha-${advice.class}`;
        }
    }

    if (tempNodes.length > 0) {
        const avg = tempNodes.reduce((s, n) => s + n.data.temperature, 0) / tempNodes.length;
        dom.avgTemp.textContent = avg.toFixed(1);
        dom.avgTemp.classList.add('value-update');
        setTimeout(() => dom.avgTemp.classList.remove('value-update'), 500);
    }

    if (humNodes.length > 0) {
        const avg = humNodes.reduce((s, n) => s + n.data.humidity, 0) / humNodes.length;
        dom.avgHum.textContent = avg.toFixed(1);
        dom.avgHum.classList.add('value-update');
        setTimeout(() => dom.avgHum.classList.remove('value-update'), 500);
    }

    renderCompareDiffs();
}

// ===== Compare with other sources (live APIs, no API key) =====
const COMPARE_LOCATION = { lat: 7.9126, lng: 98.3872 }; // PKRU campus
const COMPARE_REFRESH_MS = 10 * 60 * 1000;
const COMPARE_THRESHOLDS = [15, 25, 37.5]; // เกณฑ์ PM2.5 กรมควบคุมมลพิษ
const COMPARE_SERIES = [
    { key: 'pkru', label: 'PKRU', color: '#818cf8' },
    { key: 'air4thai', label: 'Air4Thai', color: '#10b981' },
    { key: 'gistda', label: 'GISTDA', color: '#f59e0b' },
    { key: 'openmeteo', label: 'Open-Meteo', color: '#22d3ee' },
];
const compareState = { view: 'now', data: {} };

function distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function fetchJSON(url, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

// "2026-09-17 20:00:00" / "2026-09-17T20:00" → Date (เวลาไทย)
function parseBangkokTime(text) {
    const clean = String(text).replace(' ', 'T').replace(/\.\d+Z?$|Z$/, '');
    return new Date((clean.length === 16 ? clean + ':00' : clean) + '+07:00');
}

function bangkokDate(offsetDays = 0) {
    return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
}

function formatHour(date) {
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

const COMPARE_SOURCES = {
    // กรมควบคุมมลพิษ — สถานีภาคพื้นดินที่ใกล้มหาวิทยาลัยที่สุด (ค่ารายชั่วโมง)
    async air4thai() {
        const list = await fetchJSON('https://air4thai.com/forweb/getAQI_JSON.php');
        const nearest = (list.stations || [])
            .map(s => ({ s, km: distanceKm(COMPARE_LOCATION.lat, COMPARE_LOCATION.lng, +s.lat, +s.long) }))
            .filter(x => Number.isFinite(x.km) && parseFloat(x.s.AQILast?.PM25?.value) >= 0)
            .sort((a, b) => a.km - b.km)[0];
        if (!nearest) throw new Error('no station');
        const { s, km } = nearest;
        const place = `${s.nameTH} · ${km.toFixed(1)} กม.`;

        try {
            const hist = await fetchJSON(`https://air4thai.com/forweb/getHistoryData.php?stationID=${encodeURIComponent(s.stationID)}&param=PM25&type=hr&sdate=${bangkokDate(-1)}&edate=${bangkokDate(0)}&stime=00&etime=23`);
            const series = (hist.stations?.[0]?.data || [])
                .map(r => ({ t: parseBangkokTime(r.DATETIMEDATA), v: Number(r.PM25) }))
                .filter(p => Number.isFinite(p.v) && p.v >= 0 && !isNaN(p.t));
            if (!series.length) throw new Error('empty history');
            const last = series[series.length - 1];
            return { value: last.v, meta: `${place} · ${formatHour(last.t)}`, series };
        } catch (err) {
            // ถ้าดึงรายชั่วโมงไม่ได้ ใช้ค่าล่าสุดจากรายการสถานี (ค่าเฉลี่ย 24 ชม.)
            console.warn('Air4Thai history failed, using AQILast:', err);
            return { value: parseFloat(s.AQILast.PM25.value), meta: `${place} · เฉลี่ย 24 ชม.`, series: [] };
        }
    },
    // GISTDA — ค่าประมาณจากดาวเทียมรายตำบล
    async gistda() {
        const res = await fetchJSON(`https://pm25.gistda.or.th/rest/getPM25byLocation?lat=${COMPARE_LOCATION.lat}&lng=${COMPARE_LOCATION.lng}`);
        const d = res.data;
        if (!d || !Number.isFinite(d.pm25)) throw new Error('no data');
        // เวลาใน graphHistory24hrs เป็นเวลาไทย (ถึงจะลงท้ายด้วย Z)
        const series = (d.graphHistory24hrs || [])
            .map(([v, t]) => ({ t: parseBangkokTime(t), v: Number(v) }))
            .filter(p => Number.isFinite(p.v) && !isNaN(p.t));
        const place = d.loc?.tb_tn ? `ต.${d.loc.tb_tn}` : 'ตำแหน่งมหาวิทยาลัย';
        const time = (d.datetimeThai?.timeThai || '').replace('เวลา ', '');
        return { value: d.pm25, meta: `${place} · ${time}`, series };
    },
    // Open-Meteo — แบบจำลอง CAMS (Copernicus)
    async openmeteo() {
        const res = await fetchJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${COMPARE_LOCATION.lat}&longitude=${COMPARE_LOCATION.lng}&current=pm2_5&hourly=pm2_5&past_days=1&forecast_days=1&timezone=Asia%2FBangkok`);
        const v = res.current?.pm2_5;
        if (!Number.isFinite(v)) throw new Error('no data');
        const now = Date.now();
        const series = (res.hourly?.time || [])
            .map((t, i) => ({ t: parseBangkokTime(t), v: res.hourly.pm2_5[i] }))
            .filter(p => Number.isFinite(p.v) && p.t.getTime() <= now);
        return { value: v, meta: `แบบจำลอง · ${formatHour(parseBangkokTime(res.current.time))}`, series };
    },
};

function getSelfPM25() {
    const nodes = SENSOR_NODES.filter(n => n.data.pm25 !== null);
    if (!nodes.length) return null;
    return nodes.reduce((s, n) => s + n.data.pm25, 0) / nodes.length;
}

// ค่าเฉลี่ยรายชั่วโมงของเซนเซอร์ PKRU จากประวัติที่เก็บในเบราว์เซอร์
function getSelfSeries(hours = 24) {
    const cutoff = Date.now() - hours * 3600000;
    const buckets = new Map();
    loadHistory().forEach(row => {
        const t = new Date(row.timestamp).getTime();
        const v = Number(row.pm25);
        if (!(t >= cutoff) || !Number.isFinite(v)) return;
        const hour = Math.floor(t / 3600000) * 3600000;
        const b = buckets.get(hour) || { sum: 0, n: 0 };
        b.sum += v; b.n += 1;
        buckets.set(hour, b);
    });
    return [...buckets.entries()].sort((a, b) => a[0] - b[0])
        .map(([hour, b]) => ({ t: new Date(hour + 1800000), v: b.sum / b.n }));
}

function renderCompareBars() {
    const values = { pkru: getSelfPM25() };
    Object.keys(COMPARE_SOURCES).forEach(k => { values[k] = compareState.data[k]?.value ?? null; });
    const finite = Object.values(values).filter(Number.isFinite);
    const max = Math.max(50, Math.ceil(Math.max(0, ...finite) / 10) * 10);
    const pct = v => `${Math.min(100, Math.max(0, v / max * 100)).toFixed(1)}%`;

    document.querySelectorAll('.compare-bar-row').forEach(row => {
        const v = values[row.dataset.source];
        const bar = row.querySelector('[data-role="bar"]');
        const valueEl = row.querySelector('[data-role="value"]');
        const track = row.querySelector('.compare-bar-track');
        track.querySelectorAll('.compare-tick').forEach(t => t.remove());
        COMPARE_THRESHOLDS.forEach(th => {
            const tick = document.createElement('span');
            tick.className = 'compare-tick';
            tick.style.left = pct(th);
            track.appendChild(tick);
        });
        if (Number.isFinite(v)) {
            bar.style.width = pct(v);
            bar.style.backgroundColor = getAQILevel(v).color;
            valueEl.textContent = v.toFixed(1);
        } else {
            bar.style.width = '0';
            valueEl.textContent = '--';
        }
    });

    const axis = document.getElementById('compareAxis');
    if (axis) {
        axis.innerHTML = [0, ...COMPARE_THRESHOLDS, max]
            .map(v => `<span style="left:${pct(v)}">${v}</span>`).join('');
    }
}

function renderCompareTrend() {
    const svg = document.getElementById('compareTrendChart');
    if (!svg) return;
    const W = 300, H = 140, L = 24, R = 6, T = 8, B = 16;
    const w = W - L - R, h = H - T - B;
    const end = Date.now(), start = end - 24 * 3600000;

    const series = COMPARE_SERIES.map(cfg => ({
        ...cfg,
        points: (cfg.key === 'pkru' ? getSelfSeries() : (compareState.data[cfg.key]?.series || []))
            .filter(p => p.t.getTime() >= start && p.t.getTime() <= end),
    }));
    const all = series.flatMap(s => s.points.map(p => p.v));
    if (!all.length) {
        svg.innerHTML = `<text class="compare-trend-empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">ยังไม่มีข้อมูลย้อนหลัง</text>`;
        return;
    }
    const max = Math.max(50, Math.ceil(Math.max(...all) / 10) * 10);
    const x = t => L + (t - start) / (end - start) * w;
    const y = v => T + (1 - Math.min(v, max) / max) * h;

    let out = '';
    // เส้นเกณฑ์ + ป้ายแกน Y
    [0, ...COMPARE_THRESHOLDS, max].forEach(v => {
        const isTh = COMPARE_THRESHOLDS.includes(v);
        out += `<line x1="${L}" x2="${L + w}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${isTh ? getAQILevel(v + 0.1).color : 'rgba(148,163,184,.2)'}" stroke-opacity="${isTh ? .35 : 1}" stroke-dasharray="${isTh ? '3 3' : ''}"/>`;
        out += `<text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`;
    });
    // ป้ายแกน X
    [[start, '-24 ชม.'], [start + 12 * 3600000, '-12 ชม.'], [end, 'ตอนนี้']].forEach(([t, label], i) => {
        out += `<text x="${x(t).toFixed(1)}" y="${H - 3}" text-anchor="${['start', 'middle', 'end'][i]}">${label}</text>`;
    });
    // เส้นข้อมูล
    series.forEach(s => {
        if (!s.points.length) return;
        const pts = s.points.map(p => `${x(p.t.getTime()).toFixed(1)},${y(p.v).toFixed(1)}`);
        if (pts.length > 1) {
            out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.key === 'pkru' ? 2.2 : 1.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        const last = pts[pts.length - 1].split(',');
        out += `<circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="${s.color}"><title>${s.label}: ${s.points[s.points.length - 1].v.toFixed(1)} µg/m³</title></circle>`;
    });
    svg.innerHTML = out;
}

function renderCompare() {
    renderCompareBars();
    if (compareState.view === 'trend') renderCompareTrend();
}

// เรียกจาก updateOverview เมื่อค่าเซนเซอร์เปลี่ยน
function renderCompareDiffs() {
    renderCompare();
}

async function refreshCompareSources() {
    const btn = document.getElementById('compareRefresh');
    const updated = document.getElementById('compareUpdated');
    if (btn) btn.classList.add('loading');

    await Promise.all(Object.entries(COMPARE_SOURCES).map(async ([key, load]) => {
        const row = document.querySelector(`.compare-bar-row[data-source="${key}"]`);
        const metaEl = row?.querySelector('[data-role="meta"]');
        try {
            compareState.data[key] = await load();
            row?.classList.remove('error');
            if (metaEl) { metaEl.textContent = compareState.data[key].meta; metaEl.title = compareState.data[key].meta; }
        } catch (err) {
            console.warn(`Compare source ${key} failed:`, err);
            delete compareState.data[key];
            row?.classList.add('error');
            if (metaEl) { metaEl.textContent = 'ดึงข้อมูลไม่ได้'; metaEl.title = String(err); }
        }
    }));

    renderCompare();
    if (updated) {
        updated.textContent = 'อัปเดต ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }
    if (btn) btn.classList.remove('loading');
}

function setCompareView(view) {
    compareState.view = view;
    document.querySelectorAll('[data-compare-view]').forEach(tab => tab.classList.toggle('active', tab.dataset.compareView === view));
    const nowView = document.getElementById('compareNowView');
    const trendView = document.getElementById('compareTrendView');
    if (nowView) nowView.hidden = view !== 'now';
    if (trendView) trendView.hidden = view !== 'trend';
    renderCompare();
}

function initCompareSources() {
    if (!document.getElementById('compareSourceList')) return;
    document.getElementById('compareRefresh')?.addEventListener('click', refreshCompareSources);
    document.querySelectorAll('[data-compare-view]').forEach(tab => {
        tab.addEventListener('click', () => setCompareView(tab.dataset.compareView));
    });
    renderCompareBars();
    refreshCompareSources();
    setInterval(refreshCompareSources, COMPARE_REFRESH_MS);
}

// ===== Global Timestamp =====
function updateGlobalTimestamp() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (dom.globalTimestampText) {
        dom.globalTimestampText.textContent = `${dateStr} ${timeStr}`;
    }
    if (dom.globalTimestampDot) {
        dom.globalTimestampDot.classList.add('active');
    }
}

// ===== Discord Alert =====
async function sendDiscordAlert(node, pm25) {
    if (!DISCORD_CONFIG.webhookUrl) return;
    if (pm25 < DISCORD_CONFIG.threshold) return;

    // Check cooldown
    const lastAlert = state.discordLastAlert[node.id];
    const now = Date.now();
    if (lastAlert && (now - lastAlert) < DISCORD_CONFIG.cooldownMinutes * 60 * 1000) return;

    const aqi = getAQILevel(pm25);
    const advice = getHealthAdvice(pm25);

    const colorMap = { 'very-good': 0x22d3ee, 'good': 0x10b981, 'moderate': 0xeab308, 'unhealthy-sg': 0xf97316, 'unhealthy': 0xf43f5e, 'hazardous': 0xa855f7 };

    const embed = {
        title: `${advice.icon} แจ้งเตือนค่าฝุ่น PM2.5 สูง!`,
        description: `**${node.name}** มีค่า PM2.5 สูงเกินเกณฑ์`,
        color: colorMap[aqi.class] || 0xff0000,
        fields: [
            { name: '📍 สถานที่', value: node.name, inline: true },
            { name: '💨 PM2.5', value: `${pm25.toFixed(1)} μg/m³`, inline: true },
            { name: '🏷️ ระดับ', value: aqi.text, inline: true },
            { name: '🩺 คำแนะนำ', value: `${advice.text} — ${advice.sub}`, inline: false },
        ],
        footer: { text: 'PKRU Air Quality Monitor' },
        timestamp: new Date().toISOString(),
    };

    try {
        await fetch(DISCORD_CONFIG.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });
        state.discordLastAlert[node.id] = now;
        console.log(`[Discord] Alert sent for ${node.name}: PM2.5 = ${pm25.toFixed(1)}`);
    } catch (err) {
        console.error('[Discord] Failed to send alert:', err);
    }
}

// ===== MQTT =====
function parseValue(payload, key) {
    const str = payload.toString().trim();
    try {
        const json = JSON.parse(str);
        if (typeof json === 'number') return json;
        if (typeof json === 'object') {
            if (json.value !== undefined) return parseFloat(json.value);
            if (json[key] !== undefined) return parseFloat(json[key]);
        }
    } catch {
        // Not JSON
    }
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
}

function connectMQTT() {
    if (state.client) {
        state.client.end(true);
        state.client = null;
    }

    const config = MQTT_CONFIG;
    const url = `${config.protocol}://${config.host}:${config.port}${config.path}`;
    showToast(`กำลังเชื่อมต่อ ${config.host}...`, 'info');

    const options = {
        clientId: 'pkru_aqm_' + Math.random().toString(16).substring(2, 10),
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 5000,
    };

    if (config.username) {
        options.username = config.username;
        options.password = config.password;
    }

    try {
        state.client = mqtt.connect(url, options);
    } catch (err) {
        showToast(`เชื่อมต่อล้มเหลว: ${err.message}`, 'error');
        return;
    }

    state.client.on('connect', () => {
        state.connected = true;
        stopSimulation();
        showToast('เชื่อมต่อ MQTT สำเร็จ! (หยุดจำลองข้อมูล)', 'success');

        // Subscribe to all node topics
        const wildcard = `${config.topicPrefix}/+/+`;
        state.client.subscribe(wildcard, { qos: 0 }, (err) => {
            if (err) showToast(`Subscribe ล้มเหลว: ${wildcard}`, 'error');
        });

        // Also subscribe to per-node JSON topic
        const wildcardSingle = `${config.topicPrefix}/+`;
        state.client.subscribe(wildcardSingle, { qos: 0 });
    });

    state.client.on('message', (topic, message) => {
        const prefix = MQTT_CONFIG.topicPrefix;
        const parts = topic.split('/');

        // Expected patterns:
        // {prefix}/{nodeId}/{dataType} → e.g. sensor/node1/pm25
        // {prefix}/{nodeId} → JSON with all data e.g. sensor/node1 → {"pm25":25,"temperature":32,"humidity":65}

        if (parts.length >= 2) {
            // Check if topic matches pattern with 3 parts
            if (parts.length >= 3) {
                const dataType = parts[parts.length - 1]; // pm25, temperature, humidity
                const nId = parts[parts.length - 2];
                const node = SENSOR_NODES.find(n => n.id === nId);
                if (node) {
                    const val = parseValue(message, dataType);
                    if (val !== null) {
                        if (dataType === 'pm25') node.data.pm25 = val;
                        else if (dataType === 'temperature' || dataType === 'temp') node.data.temperature = val;
                        else if (dataType === 'humidity' || dataType === 'hum') node.data.humidity = val;
                        node.data.lastUpdate = new Date();
                        onNodeDataUpdate(node.id);
                    }
                }
            }
            // Check if topic matches single-level JSON topic: {prefix}/{nodeId}
            else if (parts.length === 2) {
                const nId = parts[1];
                const node = SENSOR_NODES.find(n => n.id === nId);
                if (node) {
                    try {
                        const json = JSON.parse(message.toString());
                        if (json.pm25 !== undefined) node.data.pm25 = parseFloat(json.pm25);
                        if (json.temperature !== undefined) node.data.temperature = parseFloat(json.temperature);
                        if (json.temp !== undefined) node.data.temperature = parseFloat(json.temp);
                        if (json.humidity !== undefined) node.data.humidity = parseFloat(json.humidity);
                        if (json.hum !== undefined) node.data.humidity = parseFloat(json.hum);
                        node.data.lastUpdate = new Date();
                        onNodeDataUpdate(node.id);
                    } catch {
                        // Not valid JSON for single topic
                    }
                }
            }
        }
    });

    state.client.on('error', (err) => {
        console.error('MQTT Error:', err);
        showToast(`MQTT Error: ${err.message}`, 'error');
    });

    state.client.on('close', () => {
        if (state.connected) {
            state.connected = false;
            showToast('ขาดการเชื่อมต่อ — กลับสู่โหมดจำลอง', 'warning');
            startSimulation();
        }
    });

    state.client.on('reconnect', () => {
        showToast('กำลังเชื่อมต่อใหม่...', 'info');
    });
}

function disconnectMQTT() {
    if (state.client) {
        state.client.end(true);
        state.client = null;
        state.connected = false;
        showToast('ตัดการเชื่อมต่อ — กลับสู่โหมดจำลอง', 'info');
        startSimulation();
    }
}

// ===== Historical data =====
// เก็บค่าในเบราว์เซอร์เพื่อให้กราฟและ CSV แสดงข้อมูลที่ได้รับจริง
const HISTORY_STORAGE_KEY = 'pkru-air-quality-history-v1';
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function loadHistory() {
    try {
        const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

function saveHistory(rows) {
    try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(rows)); } catch { /* Storage unavailable */ }
}

function recordHistory(node) {
    if (!node || node.data.pm25 === null || node.data.temperature === null || node.data.humidity === null) return;
    const now = Date.now();
    const rows = loadHistory().filter(row => now - new Date(row.timestamp).getTime() <= HISTORY_RETENTION_MS);
    const last = rows[rows.length - 1];

    // รวมค่าที่เข้ามาในช่วง 20 วินาทีเดียวกันเป็นหนึ่งจุด เพื่อให้กราฟอ่านง่าย
    if (last && last.nodeId === node.id && now - new Date(last.timestamp).getTime() < 20000) {
        last.timestamp = new Date(now).toISOString();
        last.pm25 = node.data.pm25;
        last.temperature = node.data.temperature;
        last.humidity = node.data.humidity;
    } else {
        rows.push({
            nodeId: node.id,
            timestamp: new Date(now).toISOString(),
            pm25: node.data.pm25,
            temperature: node.data.temperature,
            humidity: node.data.humidity,
        });
    }
    saveHistory(rows);
}

function getHistoryRows(nodeId, days = state.historyRange) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return loadHistory()
        .filter(row => row.nodeId === nodeId && new Date(row.timestamp).getTime() >= cutoff)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function getHistoryCoverage(rows) {
    const timestamps = rows
        .map(row => new Date(row.timestamp).getTime())
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    if (!timestamps.length) return null;
    return {
        first: timestamps[0],
        last: timestamps[timestamps.length - 1],
        duration: Math.max(0, timestamps[timestamps.length - 1] - timestamps[0]),
    };
}

function formatHistoryCoverage(duration) {
    const minutes = Math.max(1, Math.round(duration / 60000));
    if (minutes < 60) return `${minutes} นาที`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} ชั่วโมง`;
    const days = Math.round(hours / 24);
    return `${days} วัน`;
}

function getOverviewHistoryRows(days = state.overviewHistoryRange) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const buckets = new Map();
    loadHistory().filter(row => new Date(row.timestamp).getTime() >= cutoff).forEach(row => {
        const bucket = Math.floor(new Date(row.timestamp).getTime() / 20000) * 20000;
        const values = buckets.get(bucket) || [];
        values.push(row);
        buckets.set(bucket, values);
    });
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([timestamp, rows]) => ({
        timestamp: new Date(timestamp).toISOString(),
        pm25: rows.reduce((total, row) => total + Number(row.pm25), 0) / rows.length,
        temperature: rows.reduce((total, row) => total + Number(row.temperature), 0) / rows.length,
        humidity: rows.reduce((total, row) => total + Number(row.humidity), 0) / rows.length,
    }));
}

function renderOverviewChart() {
    if (!dom.overviewChart) return;
    const rows = getOverviewHistoryRows();
    if (dom.overviewChartEmpty) dom.overviewChartEmpty.classList.toggle('visible', rows.length < 2);
    if (!rows.length) {
        dom.overviewChart.innerHTML = '';
        return;
    }

    const metrics = [
        { key: 'pm25', color: '#818cf8' },
        { key: 'temperature', color: '#f97316' },
        { key: 'humidity', color: '#22d3ee' },
    ];
    const sampleStep = Math.max(1, Math.ceil(rows.length / 60));
    const points = rows.filter((_, index) => index % sampleStep === 0 || index === rows.length - 1);
    const upper = Math.max(100, Math.ceil(Math.max(...metrics.flatMap(metric => points.map(row => Number(row[metric.key])))) / 10) * 10);
    const left = 6, right = 6, top = 7, bottom = 7, width = 290 - left - right, height = 120 - top - bottom;
    const x = index => left + (points.length === 1 ? width / 2 : index / (points.length - 1) * width);
    const y = value => top + (upper - Math.max(0, value)) / upper * height;
    const grid = [.25, .5, .75].map(position => `<line x1="${left}" y1="${top + height * position}" x2="${left + width}" y2="${top + height * position}" stroke="rgba(148,163,184,.13)" stroke-dasharray="2 3"/>`).join('');
    const lines = metrics.map(metric => {
        const line = points.map((row, index) => `${x(index).toFixed(1)},${y(Number(row[metric.key])).toFixed(1)}`).join(' ');
        return `<polyline points="${line}" fill="none" stroke="${metric.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');
    dom.overviewChart.innerHTML = `${grid}${lines}`;
}

function renderHistoryChart() {
    if (!dom.historyChart || !state.selectedNodeId) return;
    const metrics = [
        { key: 'pm25', label: 'PM2.5', unit: 'μg/m³', color: '#818cf8' },
        { key: 'temperature', label: 'อุณหภูมิ', unit: '°C', color: '#f97316' },
        { key: 'humidity', label: 'ความชื้น', unit: '%RH', color: '#22d3ee' },
    ];
    const rows = getHistoryRows(state.selectedNodeId);
    const rangeText = `ย้อนหลัง ${state.historyRange} วัน`;
    if (dom.historyRangeLabel) {
        dom.historyRangeLabel.textContent = `${rangeText} · มี ${rows.length.toLocaleString('th-TH')} รายการ`;
    }
    if (dom.historyEmpty) dom.historyEmpty.classList.toggle('visible', rows.length < 2);

    if (rows.length === 0) {
        dom.historyChart.innerHTML = '';
        if (dom.historySummary) dom.historySummary.textContent = 'ยังไม่มีข้อมูลบันทึก';
        return;
    }

    // ลดจำนวนจุดที่วาดเพื่อรักษาความลื่นไหลบนช่วง 30 วัน
    const maxPoints = 90;
    const step = Math.max(1, Math.ceil(rows.length / maxPoints));
    const points = rows.filter((_, index) => index % step === 0 || index === rows.length - 1);
    const values = metrics.flatMap(metric => points.map(row => Number(row[metric.key]))).filter(Number.isFinite);
    const upper = Math.max(100, Math.ceil(Math.max(...values) / 10) * 10);
    const left = 36, right = 10, top = 12, bottom = 28, width = 580 - left - right, height = 180 - top - bottom;
    const x = index => left + (points.length === 1 ? width / 2 : index / (points.length - 1) * width);
    const y = value => top + (upper - Math.max(0, value)) / upper * height;
    const grid = [0, .5, 1].map(position => {
        const value = upper - upper * position;
        const gridY = top + height * position;
        return `<line x1="${left}" y1="${gridY}" x2="${left + width}" y2="${gridY}" stroke="rgba(148,163,184,.18)" stroke-dasharray="3 4"/><text x="0" y="${gridY + 4}" fill="#64748b" font-size="10">${value.toFixed(0)}</text>`;
    }).join('');
    const labels = [points[0], points[points.length - 1]].map((row, index) => {
        const date = new Date(row.timestamp);
        const text = state.historyRange === 1
            ? date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
            : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        return `<text x="${index === 0 ? left : left + width}" y="174" text-anchor="${index === 0 ? 'start' : 'end'}" fill="#64748b" font-size="10">${text}</text>`;
    }).join('');
    const lines = metrics.map(metric => {
        const line = points.map((row, index) => `${x(index).toFixed(1)},${y(Number(row[metric.key])).toFixed(1)}`).join(' ');
        const dots = points.map((row, index) => `<circle cx="${x(index)}" cy="${y(Number(row[metric.key]))}" r="${points.length === 1 ? 4 : 2}" fill="${metric.color}"><title>${metric.label} · ${new Date(row.timestamp).toLocaleString('th-TH')}: ${Number(row[metric.key]).toFixed(1)} ${metric.unit}</title></circle>`).join('');
        return `<polyline points="${line}" fill="none" stroke="${metric.color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
    }).join('');

    dom.historyChart.innerHTML = `${grid}${lines}${labels}`;
    if (dom.historySummary) {
        const latest = points[points.length - 1];
        dom.historySummary.textContent = `ล่าสุด: PM2.5 ${Number(latest.pm25).toFixed(1)} · ${Number(latest.temperature).toFixed(1)}°C · ${Number(latest.humidity).toFixed(1)}%RH`;
    }
}

// ===== On Data Update =====
function onNodeDataUpdate(nodeId) {
    updateMarker(nodeId);
    updateNodeList();
    updateOverview();
    updateGlobalTimestamp();

    // Update detail panel if this node is selected
    if (state.selectedNodeId === nodeId) {
        const node = SENSOR_NODES.find(n => n.id === nodeId);
        if (node) updateDetailPanel(node);
    }

    // Discord alert check
    const node = SENSOR_NODES.find(n => n.id === nodeId);
    recordHistory(node);
    renderOverviewChart();
    if (node && node.data.pm25 !== null) {
        sendDiscordAlert(node, node.data.pm25);
    }

    if (state.selectedNodeId === nodeId) renderHistoryChart();
}

// ===== Event Listeners =====
if (dom.themeToggle) {
    dom.themeToggle.addEventListener('click', toggleTheme);
}

if (dom.sidebarToggle) dom.sidebarToggle.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
        dom.sidebar.classList.toggle('open');
        dom.sidebarToggle.setAttribute('aria-expanded', String(dom.sidebar.classList.contains('open')));
    } else {
        dom.sidebar.classList.toggle('collapsed');
        dom.sidebarToggle.setAttribute('aria-expanded', String(!dom.sidebar.classList.contains('collapsed')));
        // Show/hide the Leaflet sidebar-open control
        if (dom.sidebar.classList.contains('collapsed') && state.sidebarToggleControl) {
            state.sidebarToggleControl.classList.add('visible');
        } else if (state.sidebarToggleControl) {
            state.sidebarToggleControl.classList.remove('visible');
        }
        setTimeout(() => state.map.invalidateSize(), 350);
    }
});

if (dom.mobileToggle) dom.mobileToggle.addEventListener('click', () => {
    dom.sidebar.classList.toggle('open');
    dom.mobileToggle.setAttribute('aria-expanded', String(dom.sidebar.classList.contains('open')));
});

if (dom.detailClose) dom.detailClose.addEventListener('click', () => {
    deselectNode();
});

document.querySelectorAll('[data-history-range]').forEach(button => {
    button.addEventListener('click', () => {
        state.historyRange = Number(button.dataset.historyRange);
        document.querySelectorAll('[data-history-range]').forEach(tab => tab.classList.toggle('active', tab === button));
        renderHistoryChart();
    });
});

document.querySelectorAll('[data-overview-range]').forEach(button => {
    button.addEventListener('click', () => {
        state.overviewHistoryRange = Number(button.dataset.overviewRange);
        document.querySelectorAll('[data-overview-range]').forEach(tab => tab.classList.toggle('active', tab === button));
        renderOverviewChart();
    });
});

if (dom.historyDownload) dom.historyDownload.addEventListener('click', exportCSV);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.detailPanel.classList.contains('active')) {
        deselectNode();
    }
});

// ===== Data Export =====
function exportCSV() {
    const selected = state.selectedNodeId;
    const rows = selected
        ? getHistoryRows(selected)
        : loadHistory()
            .filter(row => new Date(row.timestamp).getTime() >= Date.now() - state.historyRange * 86400000)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (!rows.length) {
        showToast('ยังไม่มีข้อมูลย้อนหลังสำหรับดาวน์โหลด', 'warning');
        return;
    }
    const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    let csv = '\uFEFFTimestamp,Location,PM2.5(µg/m3),Temperature(°C),Humidity(%RH),AQI_Status\n';
    rows.forEach(row => {
        const node = SENSOR_NODES.find(item => item.id === row.nodeId);
        const aqi = getAQILevel(Number(row.pm25));
        csv += [row.timestamp, node ? node.name : 'ไม่ทราบตำแหน่ง', Number(row.pm25).toFixed(1), Number(row.temperature).toFixed(1), Number(row.humidity).toFixed(1), aqi.text].map(csvEscape).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateNow = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const scope = selected || 'all-nodes';
    link.setAttribute("download", `PKRU_AQI_${scope}_${state.historyRange}days_${dateNow}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    const coverage = getHistoryCoverage(rows);
    const requestedDuration = state.historyRange * 24 * 60 * 60 * 1000;
    const hasFullCoverage = coverage && coverage.duration >= requestedDuration - 15 * 60 * 1000;
    const coverageText = coverage ? formatHistoryCoverage(coverage.duration) : 'ไม่ทราบช่วงเวลา';
    showToast(
        hasFullCoverage
            ? `ดาวน์โหลด ${rows.length.toLocaleString('th-TH')} รายการย้อนหลัง ${state.historyRange} วันแล้ว`
            : `ดาวน์โหลด ${rows.length.toLocaleString('th-TH')} รายการ · มีข้อมูลจริง ${coverageText} (ยังไม่ครบ ${state.historyRange} วัน)`,
        hasFullCoverage ? 'success' : 'warning',
        6000
    );
}

// ===== Initialize =====
function init() {
    initTheme();
    initMap();
    buildNodeList();
    updateOverview();
    renderOverviewChart();
    initCompareSources();

    // เริ่มจำลองข้อมูลทันที (จะหยุดเมื่อเชื่อมต่อ MQTT สำเร็จ)
    startSimulation();

    // เชื่อมต่อ MQTT อัตโนมัติ
    setTimeout(() => connectMQTT(), 1000);

    // Hide loading screen after map is initialized
    setTimeout(() => {
        const loading = document.getElementById('loadingScreen');
        if (loading) loading.classList.add('hidden');
    }, 1500);
}

init();
