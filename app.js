/**
 * PKRU Air Quality Map — Interactive Campus Map
 * มหาวิทยาลัยราชภัฏภูเก็ต
 * Real-time PM2.5, Temperature, Humidity via MQTT
 */

// ===== Sensor Node Definitions =====
// จุดติดตั้งเซ็นเซอร์ — ตึกแต่ละคณะ + โรงอาหาร มรภ.ภูเก็ต
const SENSOR_NODES = [
    {
        id: 'node1',
        name: 'คณะครุศาสตร์',
        description: 'Faculty of Education',
        lat: 7.916100048652821,
        lng: 98.38862850729211,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    },
    {
        id: 'node2',
        name: 'คณะวิทยาศาสตร์และเทคโนโลยี',
        description: 'Faculty of Science & Technology',
        lat: 7.91534555945768,
        lng: 98.38866069379964,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    },
    {
        id: 'node3',
        name: 'คณะมนุษยศาสตร์และสังคมศาสตร์',
        description: 'Faculty of Humanities & Social Sciences',
        lat: 7.908968819708348,
        lng: 98.38660452173964,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    },
    {
        id: 'node4',
        name: 'คณะวิทยาการจัดการ',
        description: 'Faculty of Management Sciences',
        lat: 7.9134115104068465,
        lng: 98.38730886046267,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    },
    {
        id: 'node5',
        name: 'คณะเทคโนโลยีการเกษตร',
        description: 'Faculty of Agricultural Technology',
        lat: 7.914739841780236,
        lng: 98.38769509857339,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    },
    {
        id: 'node6',
        name: 'โรงอาหาร',
        description: 'โรงอาหารกลาง มรภ.ภูเก็ต',
        lat: 7.910499793035807,
        lng: 98.38669731681406,
        data: { pm25: null, temperature: null, humidity: null, lastUpdate: null }
    }
];

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
    // Toast
    toastContainer: document.getElementById('toastContainer'),
};

// ===== AQI Helpers =====
function getAQILevel(pm25) {
    if (pm25 === null || pm25 === undefined) return { class: 'nodata', text: 'ไม่มีข้อมูล', color: '#64748b' };
    if (pm25 <= 15.0) return { class: 'very-good', text: 'ดีมาก', color: '#22d3ee' };
    if (pm25 <= 25.0) return { class: 'good', text: 'คุณภาพดี', color: '#10b981' };
    if (pm25 <= 37.5) return { class: 'moderate', text: 'ปานกลาง', color: '#eab308' };
    if (pm25 <= 75.0) return { class: 'unhealthy-sg', text: 'เริ่มมีผลกระทบ', color: '#f97316' };
    return { class: 'unhealthy', text: 'มีผลต่อสุขภาพ', color: '#f43f5e' };
}

// ===== Health Advice =====
function getHealthAdvice(pm25) {
    if (pm25 === null || pm25 === undefined) return { icon: '—', text: 'รอข้อมูล', sub: '', class: 'nodata' };
    if (pm25 <= 15) return { icon: '😊', text: 'อากาศดีมาก', sub: 'ทำกิจกรรมกลางแจ้งได้ตามปกติ', class: 'very-good' };
    if (pm25 <= 25) return { icon: '🙂', text: 'อากาศดี', sub: 'ทำกิจกรรมกลางแจ้งได้ตามปกติ', class: 'good' };
    if (pm25 <= 37) return { icon: '😐', text: 'ควรระวัง', sub: 'ผู้ที่มีโรคประจำตัวควรลดกิจกรรมกลางแจ้ง', class: 'moderate' };
    if (pm25 <= 50) return { icon: '😷', text: 'สวมหน้ากากอนามัย', sub: 'ควรสวมหน้ากาก ลดกิจกรรมกลางแจ้ง', class: 'unhealthy-sg' };
    if (pm25 <= 90) return { icon: '🚫', text: 'งดกิจกรรมกลางแจ้ง', sub: 'สวมหน้ากาก N95 หากต้องออกนอกอาคาร', class: 'unhealthy' };
    return { icon: '⚠️', text: 'อันตราย!', sub: 'อยู่ในอาคาร ปิดหน้าต่าง เปิดเครื่องฟอกอากาศ', class: 'hazardous' };
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
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('pkru_aqm_theme', state.theme);
    
    // Switch map tiles
    if (state.tileLayer) {
        const tileUrl = state.theme === 'light' 
            ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        state.tileLayer.setUrl(tileUrl);
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

    // Add zoom control first
    L.control.zoom({ position: 'topleft' }).addTo(state.map);

    // Add custom sidebar-toggle control (same style as zoom, right below it)
    const SidebarToggleControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control-sidebar-toggle leaflet-bar leaflet-control');
            const link = L.DomUtil.create('a', '', container);
            link.href = '#';
            link.title = 'เปิดเมนู';
            link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><polyline points="9 18 15 12 9 6"/></svg>';
            link.setAttribute('role', 'button');
            link.setAttribute('aria-label', 'Open sidebar');

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(link, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                dom.sidebar.classList.remove('collapsed');
                container.classList.remove('visible');
                setTimeout(() => state.map.invalidateSize(), 350);
            });

            state.sidebarToggleControl = container;
            return container;
        }
    });
    new SidebarToggleControl().addTo(state.map);

    // Set map tiles based on theme
    const tileUrl = state.theme === 'light' 
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        
    state.tileLayer = L.tileLayer(tileUrl, {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
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
    const pm25Display = node.data.pm25 !== null ? Math.round(node.data.pm25) : '—';

    const icon = L.divIcon({
        className: `custom-marker ${markerClass}`,
        html: `
            <div class="marker-outer">
                <div class="marker-inner">${pm25Display}</div>
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
    const pm25Display = node.data.pm25 !== null ? Math.round(node.data.pm25) : '—';
    const isActive = state.selectedNodeId === nodeId;

    const icon = L.divIcon({
        className: `custom-marker ${markerClass} ${isActive ? 'marker-active' : ''}`,
        html: `
            <div class="marker-outer">
                <div class="marker-inner">${pm25Display}</div>
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
    dom.detailMarkerIcon.textContent = node.id.replace('node', '#');

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
    if (dom.detailHealthIcon) dom.detailHealthIcon.textContent = advice.icon;
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
            <div class="node-marker" style="background:${aqi.color}; color:${aqi.color}">
                ${node.id.replace('node', '')}
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
    const items = dom.nodeList.querySelectorAll('.node-item');
    items.forEach(item => {
        const nodeId = item.dataset.nodeId;
        const node = SENSOR_NODES.find(n => n.id === nodeId);
        if (!node) return;

        const aqi = getAQILevel(node.data.pm25);
        item.className = `node-item ${state.selectedNodeId === nodeId ? 'active' : ''}`;

        const marker = item.querySelector('.node-marker');
        marker.style.background = aqi.color;
        marker.style.color = aqi.color;

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
        if (dom.healthIcon) dom.healthIcon.textContent = advice.icon;
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
        clientId: 'pkru_aqm_' + Math.random().toString(16).substr(2, 8),
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
            const nodeId = parts.length >= 2 ? parts[parts.length === 2 ? 1 : parts.length - 2] : null;
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
        setConnectionStatus('connecting');
    });
}

function disconnectMQTT() {
    if (state.client) {
        state.client.end(true);
        state.client = null;
        state.connected = false;
        setConnectionStatus('');
        showToast('ตัดการเชื่อมต่อ — กลับสู่โหมดจำลอง', 'info');
        startSimulation();
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
    if (node && node.data.pm25 !== null) {
        sendDiscordAlert(node, node.data.pm25);
    }
}

// ===== Event Listeners =====
// Event Listeners
if (dom.themeToggle) {
    dom.themeToggle.addEventListener('click', toggleTheme);
}

dom.sidebarToggle.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
        dom.sidebar.classList.toggle('open');
    } else {
        dom.sidebar.classList.toggle('collapsed');
        // Show/hide the Leaflet sidebar-open control
        if (dom.sidebar.classList.contains('collapsed') && state.sidebarToggleControl) {
            state.sidebarToggleControl.classList.add('visible');
        } else if (state.sidebarToggleControl) {
            state.sidebarToggleControl.classList.remove('visible');
        }
        setTimeout(() => state.map.invalidateSize(), 350);
    }
});

dom.mobileToggle.addEventListener('click', () => {
    dom.sidebar.classList.toggle('open');
});

dom.detailClose.addEventListener('click', () => {
    deselectNode();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.detailPanel.classList.contains('active')) {
        deselectNode();
    }
});

// ===== Data Export =====
function exportCSV() {
    // ใช้ \uFEFF (BOM) เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง
    let csv = '\uFEFF'; 
    csv += 'Node_ID,Location,Date,PM2.5_Avg(µg/m3),PM2.5_Max,PM2.5_Min,Temp_Avg(°C),Humidity_Avg(%),AQI_Status\n';
    
    const now = new Date();
    
    SENSOR_NODES.forEach(node => {
        let basePm25 = node.data.pm25 || (Math.random() * 30 + 15);
        let baseTemp = node.data.temperature || 28;
        let baseHum = node.data.humidity || 70;

        // สุ่มข้อมูลย้อนหลัง 7 วัน (รายวัน - Daily Average)
        for(let d = 7; d >= 0; d--) {
            const dateObj = new Date(now.getTime() - (d * 24 * 60 * 60 * 1000));
            // Format เป็น YYYY-MM-DD
            const dateStr = dateObj.toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD format
            
            // จำลองค่าสถิติรายวัน
            const dailyAvgPm25 = Math.max(5, basePm25 + (Math.sin(d) * 12) + (Math.random() * 8 - 4));
            const dailyMaxPm25 = dailyAvgPm25 + (Math.random() * 15 + 5);
            const dailyMinPm25 = Math.max(1, dailyAvgPm25 - (Math.random() * 10 + 2));
            
            const dailyAvgTemp = baseTemp + (Math.random() * 2 - 1);
            const dailyAvgHum = Math.min(100, Math.max(40, baseHum + (Math.random() * 10 - 5)));
            
            // หาเกณฑ์สี (AQI Status) อ้างอิงกรมควบคุมมลพิษ 2566
            let aqiStatus = 'มีผลต่อสุขภาพ';
            if (dailyAvgPm25 <= 15.0) aqiStatus = 'ดีมาก';
            else if (dailyAvgPm25 <= 25.0) aqiStatus = 'ดี';
            else if (dailyAvgPm25 <= 37.5) aqiStatus = 'ปานกลาง';
            else if (dailyAvgPm25 <= 75.0) aqiStatus = 'เริ่มมีผลกระทบ';

            csv += `"${node.id}","${node.name}","${dateStr}",${dailyAvgPm25.toFixed(1)},${dailyMaxPm25.toFixed(1)},${dailyMinPm25.toFixed(1)},${dailyAvgTemp.toFixed(1)},${dailyAvgHum.toFixed(1)},"${aqiStatus}"\n`;
        }
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateNow = now.toLocaleDateString('en-CA').replace(/-/g, '');
    link.setAttribute("download", `PKRU_AQI_DailyReport_${dateNow}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ===== Initialize =====
function init() {
    initTheme();
    initMap();
    buildNodeList();
    updateOverview();

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
