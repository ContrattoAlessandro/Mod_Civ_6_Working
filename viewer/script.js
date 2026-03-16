// Costanti e Variabili di Stato
const HEX_SIZE = 45; // Dimensione del raggio dell'esagono
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

let canvas, ctx;
let cameraX = 0, cameraY = 0;
let isDragging = false;
let startDragX, startDragY;

let selectedSolutionId = null;
let hoveredHex = null;

// Colori Terreni e Feature
const COLORS = {
    TERRAINS: {
        'TERRAIN_GRASS': '#4a7c2c',
        'TERRAIN_GRASS_HILLS': '#5c8a38',
        'TERRAIN_PLAINS': '#8a964a',
        'TERRAIN_PLAINS_HILLS': '#9ca356',
        'TERRAIN_DESERT': '#d5cc84',
        'TERRAIN_DESERT_HILLS': '#e1d796',
        'TERRAIN_COAST': '#3d8eb9',
        'TERRAIN_OCEAN': '#225d80',
        'TERRAIN_TUNDRA': '#8c9d9d',
        'TERRAIN_SNOW': '#e6e6e6'
    },
    DISTRICTS: {
        'Centro Cittadino': '#ffffff',
        'Campus': '#58a6ff',
        'Hub Commerciale': '#e3b341',
        'Porto': '#2f65a1',
        'Zona Industriale': '#d29922',
        'Piazza del Teatro': '#db61a2',
        'Accampamento': '#c9302c',
        'Luogo Santo': '#e6edf3',
        'Piazza del Governo': '#8a2be2',
        'Acquedotto': '#6196a6',
        'Diga': '#61a68f'
    },
    FEATURES: {
        'Montagna': '#4d4d4d',
        'Foresta Pluviale': '#1a4f1a',
        'Bosco': '#2d5e2d',
        'Lago': '#4cb5e8'
    }
};

// Inizializzazione
let optimizerWorker = null;

// Rendi globale CIV6_DATA inizialmente vuota per non rompere roba se la mod non ha esportato nulla
window.CIV6_DATA = window.CIV6_DATA || { celle: [], soluzioni: [] };

window.onload = () => {
    initCanvas();
    buildSidebar();
    initSetupUI();
    initDragAndDrop();

    // Auto-reload check if running on local server
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        setInterval(checkAutoReload, 2000);
    }

    // Centra la telecamera
    if (CIV6_DATA.celle.length > 0) {
        cameraX = window.innerWidth / 2;
        cameraY = window.innerHeight / 2;
    }

    // Seleziona la prima soluzione di default
    if (CIV6_DATA.soluzioni.length > 0) {
        selectSolution(0);
        document.getElementById('resultsSection').style.display = 'block';
    }

    draw();
};

let lastKnownData = "";

async function checkAutoReload() {
    try {
        const response = await fetch('/city_data_extracted.txt?t=' + Date.now());
        if (response.ok) {
            const text = await response.text();
            if (text.trim() && text !== lastKnownData) {
                lastKnownData = text;
                const textArea = document.getElementById('cityDataInput');
                if (textArea.value !== text && text.includes('{')) {
                    textArea.value = text;
                    console.log("Nuovi dati rilevati dal server, avvio ottimizzazione...");
                    // Only auto-start optimization if the user has selected at least one district
                    const checkboxes = document.querySelectorAll('#districtsSelector input[type="checkbox"]:checked');
                    if (checkboxes.length > 0) {
                        startOptimization();
                    }
                }
            }
        }
    } catch (e) {
        // Ignora: l'auto-reload fallisce (es. aperto in locale file:///)
    }
}

function initDragAndDrop() {
    const dropZone = document.getElementById('cityDataInput');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.border = '2px dashed #58a6ff';
        dropZone.style.backgroundColor = 'rgba(88, 166, 255, 0.1)';
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.border = '';
        dropZone.style.backgroundColor = '';
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.border = '';
        dropZone.style.backgroundColor = '';
        if (e.dataTransfer.files.length) {
            const file = e.dataTransfer.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                if (file.name.toLowerCase().includes('lua')) {
                    const extracted = estraiDaLua(text);
                    if (extracted) {
                        document.getElementById('cityDataInput').value = extracted;
                    } else {
                        alert("Non ho trovato i dati del City Scanner in questo file Lua.");
                    }
                } else {
                    document.getElementById('cityDataInput').value = text;
                }
            };
            reader.readAsText(file);
        }
    });
}

function estraiDaLua(text) {
    const lines = text.split('\n');
    const dati_estratti = [];
    let trovato_fine = false;
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.includes('--- END CITY DATA SCAN ---')) {
             trovato_fine = true;
             continue;
        }
        if (trovato_fine) {
             if (line.includes('--- START CITY DATA SCAN ---')) break;
             if (line.includes('{') && line.includes('}')) {
                 const parti = line.split("CityScanner: ");
                 let riga_dati = (parti.length > 1) ? parti[1].trim() : line.trim();
                 if (riga_dati.startsWith("{")) dati_estratti.push(riga_dati);
             }
        }
    }
    return dati_estratti.length ? dati_estratti.reverse().join('\n') : null;
}

function initSetupUI() {
    const districts = ["Diga", "Acquedotto", "Accampamento", "Porto", "Campus", "Luogo Santo", "Piazza del Teatro", "Zona Industriale", "Hub Commerciale", "Piazza del Governo"];
    const container = document.getElementById('districtsSelector');

    districts.forEach(d => {
        const label = document.createElement('label');
        label.className = 'district-checkbox';
        label.innerHTML = `<input type="checkbox" value="${d}" checked> ${d}`;
        container.appendChild(label);
    });

    document.getElementById('btnOptimize').addEventListener('click', startOptimization);
}

function startOptimization() {
    const cityData = document.getElementById('cityDataInput').value.trim();
    if (!cityData) {
        alert("Inserisci i dati del City Scanner!");
        return;
    }

    const checkboxes = document.querySelectorAll('#districtsSelector input[type="checkbox"]:checked');
    const userDistricts = Array.from(checkboxes).map(cb => cb.value);

    if (userDistricts.length === 0) {
        alert("Seleziona almeno un distretto!");
        return;
    }

    // UI Updates
    document.getElementById('btnOptimize').disabled = true;
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';

    if (optimizerWorker) {
        optimizerWorker.terminate();
    }

    const workerCode = document.getElementById('worker-script').textContent;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    optimizerWorker = new Worker(URL.createObjectURL(blob));

    optimizerWorker.onmessage = function (e) {
        const msg = e.data;
        if (msg.type === 'PROGRESS') {
            document.getElementById('progressText').innerText = msg.message;
            document.getElementById('progressFill').style.width = `${msg.percent}%`;
        } else if (msg.type === 'COMPLETE') {
            try {
                CIV6_DATA = msg.data;
                // alert("Debug: Ricevuto JSON con " + CIV6_DATA.soluzioni.length + " layout");

                document.getElementById('btnOptimize').disabled = false;
                document.getElementById('progressContainer').style.display = 'none';
                document.getElementById('resultsSection').style.display = 'block';

                // Re-inizializza la visualizzazione
                cameraX = window.innerWidth / 2;
                cameraY = window.innerHeight / 2;

                buildSidebar();
                if (CIV6_DATA.soluzioni.length > 0) {
                    selectSolution(0);
                }
                draw();
            } catch (err) {
                alert("Errore in script.js: " + err.toString());
            }

        } else if (msg.type === 'ERROR') {
            alert("Errore durante l'ottimizzazione: " + msg.message);
            document.getElementById('btnOptimize').disabled = false;
            document.getElementById('progressContainer').style.display = 'none';
        }
    };

    const generations = parseInt(document.getElementById('inputGenerations').value) || 500;
    const populationSize = parseInt(document.getElementById('inputPopulation').value) || 1000;

    optimizerWorker.postMessage({
        message: 'START_OPTIMIZATION',
        cityData: cityData,
        userDistricts: userDistricts,
        generations: generations,
        populationSize: populationSize
    });
}

function initCanvas() {
    canvas = document.getElementById('hexCanvas');
    ctx = canvas.getContext('2d');

    const resizeObserver = new ResizeObserver(() => {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        draw();
    });
    resizeObserver.observe(canvas.parentElement);

    // Eventi Mouse
    canvas.addEventListener('mousedown', e => {
        isDragging = true;
        startDragX = e.clientX - cameraX;
        startDragY = e.clientY - cameraY;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'grab';
    });

    window.addEventListener('mousemove', e => {
        if (isDragging) {
            cameraX = e.clientX - startDragX;
            cameraY = e.clientY - startDragY;
            draw();
        }

        // Calcolo Hover
        handleHover(e.clientX, e.clientY);
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        cameraY -= e.deltaY * 0.5;
        cameraX -= e.deltaX * 0.5;
        draw();
    }, { passive: false });
}

// Logica Hex
function hexToPixel(q, r) {
    const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
    const y = HEX_SIZE * 3 / 2 * r;
    return { x, y };
}

function pixelToHex(x, y) {
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE;
    const r = (2 / 3 * y) / HEX_SIZE;
    return hexRound(q, r, -q - r);
}

function hexRound(q, r, s) {
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
    else if (rDiff > sDiff) rr = -rq - rs;
    else rs = -rq - rr;

    return { q: rq, r: rr, s: rs };
}

function getHexColor(cella) {
    if (cella.caratteristiche.includes('Montagna')) return COLORS.FEATURES['Montagna'];
    if (cella.caratteristiche.includes('Lago')) return COLORS.FEATURES['Lago'];
    if (cella.caratteristiche.includes('Foresta Pluviale')) return COLORS.FEATURES['Foresta Pluviale'];
    if (cella.caratteristiche.includes('Bosco')) return COLORS.FEATURES['Bosco'];
    if (cella.caratteristiche.includes('Costa')) return COLORS.TERRAINS['TERRAIN_COAST'];
    if (cella.caratteristiche.includes('Lusso') || cella.caratteristiche.includes('Strategica')) return '#8c7e47';

    return COLORS.TERRAINS['TERRAIN_PLAINS']; // Default
}

function drawHex(x, y, size, fillStyle, strokeStyle, lineWidth = 1) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle_deg = 60 * i + 30; // Pointy topped
        const angle_rad = Math.PI / 180 * angle_deg;
        const px = x + size * Math.cos(angle_rad);
        const py = y + size * Math.sin(angle_rad);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = fillStyle;
    ctx.fill();

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(cameraX, cameraY);

    const activeSolution = CIV6_DATA.soluzioni.find(s => s.id === selectedSolutionId);
    let activeLayout = activeSolution ? activeSolution.layout : {};

    // Disegna tutte le celle esportate
    CIV6_DATA.celle.forEach(cella => {
        const pos = hexToPixel(cella.q, cella.r);

        let bgColor = getHexColor(cella);
        let strokeColor = 'rgba(255, 255, 255, 0.1)';
        let isHovered = hoveredHex && hoveredHex.q === cella.q && hoveredHex.r === cella.r;

        if (isHovered) {
            strokeColor = 'rgba(255, 255, 255, 0.8)';
        }

        drawHex(pos.x, pos.y, HEX_SIZE - 1, bgColor, strokeColor, isHovered ? 2 : 1);

        // Disegna Distretto (Centro Cittadino o dal Layout)
        let renderDistretto = cella.distretto_base;

        // Controlla se la soluzione attuale piazza un distretto qui
        for (const [nome_distretto, p] of Object.entries(activeLayout)) {
            if (p.q === cella.q && p.r === cella.r) {
                renderDistretto = nome_distretto;
                break;
            }
        }

        if (renderDistretto) {
            drawHex(pos.x, pos.y, HEX_SIZE - 8, 'rgba(0,0,0,0.6)', COLORS.DISTRICTS[renderDistretto] || '#fff', 2);

            // Text inside hex
            ctx.fillStyle = '#fff';
            ctx.font = '10px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Abbreviazioni
            let txt = renderDistretto.substring(0, 3).toUpperCase();
            if (renderDistretto === "Centro Cittadino") txt = "CC";
            if (renderDistretto === "Hub Commerciale") txt = "HUB";
            ctx.fillText(txt, pos.x, pos.y);
        }

        // Overlay Fiume (Semplificato: testo blu)
        if (cella.caratteristiche.includes('Fiume')) {
            ctx.fillStyle = '#58a6ff';
            ctx.font = '12px Inter';
            ctx.fillText('~', pos.x, pos.y + Math.floor(HEX_SIZE / 2));
        }

    });

    ctx.restore();
}

// UI and Interaction
function buildSidebar() {
    const list = document.getElementById('solutionsList');
    list.innerHTML = '';

    CIV6_DATA.soluzioni.forEach((sol, index) => {
        const card = document.createElement('div');
        card.className = `solution-card ${sol.id === selectedSolutionId ? 'active' : ''}`;
        card.onclick = () => selectSolution(sol.id);

        const r = sol.rese;
        card.innerHTML = `
            <div class="solution-title">
                <span>Layout #${index + 1}</span>
                <span class="solution-id">Distretti: ${Object.keys(sol.layout).length}</span>
            </div>
            <div class="yields-grid">
                <div class="yield-item"><span class="yield-icon" style="background:#58a6ff"></span> ${r.Scienza}</div>
                <div class="yield-item"><span class="yield-icon" style="background:#d29922; border-radius:2px"></span> ${r.Produzione}</div>
                <div class="yield-item"><span class="yield-icon" style="background:#e3b341"></span> ${r.Oro}</div>
                <div class="yield-item"><span class="yield-icon" style="background:#db61a2"></span> ${r.Cultura}</div>
                <div class="yield-item"><span class="yield-icon" style="background:#e6edf3"></span> ${r.Fede}</div>
            </div>
        `;
        list.appendChild(card);
    });
}

function selectSolution(id) {
    selectedSolutionId = id;

    // Update UI
    document.querySelectorAll('.solution-card').forEach(c => c.classList.remove('active'));
    setTimeout(() => {
        const activeSolution = CIV6_DATA.soluzioni.find(s => s.id === id);
        const index = CIV6_DATA.soluzioni.indexOf(activeSolution);
        const cards = document.querySelectorAll('.solution-card');
        if (cards[index]) cards[index].classList.add('active');
    }, 10);

    draw();
}

function handleHover(mouseX, mouseY) {
    // Sottrai l'offset del canvas (sidebar)
    const rect = canvas.getBoundingClientRect();
    const x = mouseX - rect.left - cameraX;
    const y = mouseY - rect.top - cameraY;

    const hex = pixelToHex(x, y);

    // Controlla se l'hex è nella nostra mappa
    const cella = CIV6_DATA.celle.find(c => c.q === hex.q && c.r === hex.r);

    if (cella) {
        if (!hoveredHex || hoveredHex.q !== hex.q || hoveredHex.r !== hex.r) {
            hoveredHex = hex;
            updateTooltip(cella, mouseX, mouseY);
            draw();
        } else {
            // Update tooltip position slightly
            const tt = document.getElementById('tooltip');
            tt.style.left = mouseX + 'px';
            tt.style.top = mouseY + 'px';
        }
    } else if (hoveredHex) {
        hoveredHex = null;
        document.getElementById('tooltip').classList.remove('visible');
        draw();
    }
}

function updateTooltip(cella, mouseX, mouseY) {
    const tt = document.getElementById('tooltip');
    tt.style.left = mouseX + 'px';
    tt.style.top = mouseY + 'px';

    let html = `
        <div class="tt-title">Coordinata: (${cella.q}, ${cella.r}, ${cella.s})</div>
    `;

    if (cella.caratteristiche.length > 0) {
        html += `<div class="tt-features">${cella.caratteristiche.join(', ')}</div>`;
    } else {
        html += `<div class="tt-features">Pianura / Senza caratteristiche</div>`;
    }

    const activeSolution = CIV6_DATA.soluzioni.find(s => s.id === selectedSolutionId);
    let activeLayout = activeSolution ? activeSolution.layout : {};

    let distretto = cella.distretto_base;
    for (const [nome, p] of Object.entries(activeLayout)) {
        if (p.q === cella.q && p.r === cella.r) distretto = nome;
    }

    if (distretto) {
        html += `<div class="tt-district">${distretto}</div>`;
    }

    tt.innerHTML = html;
    tt.classList.add('visible');
}
