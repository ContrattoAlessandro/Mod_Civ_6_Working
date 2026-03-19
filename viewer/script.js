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
let currentSortKey = 'Scienza';

// Simplified terrain colors - clean and natural
const COLORS = {
    TERRAINS: {
        // Grasslands - Natural green
        'TERRAIN_GRASS': { base: '#4a7c2c' },
        'TERRAIN_GRASS_HILLS': { base: '#5c8a38' },

        // Plains - Yellow-green
        'TERRAIN_PLAINS': { base: '#9ca356' },
        'TERRAIN_PLAINS_HILLS': { base: '#8a964a' },

        // Desert - Sandy yellow
        'TERRAIN_DESERT': { base: '#d4c46a' },
        'TERRAIN_DESERT_HILLS': { base: '#c4b45a' },

        // Water - Blue
        'TERRAIN_COAST': { base: '#4a9eca' },
        'TERRAIN_OCEAN': { base: '#2a6e8a' },

        // Tundra - Grey
        'TERRAIN_TUNDRA': { base: '#9aa8a8' },
        'TERRAIN_TUNDRA_HILLS': { base: '#8a9898' }, // Aggiunto
        
        // Snow - White
        'TERRAIN_SNOW': { base: '#e8e8e8' },
        'TERRAIN_SNOW_HILLS': { base: '#d8d8d8' },   // Aggiunto
        
        'default': { base: '#9ca356' }
    },

    DISTRICTS: {
        'Centro Cittadino': { color: '#ffffff' },
        'Campus': { color: '#58a6ff' },
        'Hub Commerciale': { color: '#e3b341' },
        'Porto': { color: '#2f65a1' },
        'Zona Industriale': { color: '#d29922' },
        'Piazza del Teatro': { color: '#db61a2' },
        'Accampamento': { color: '#c9302c' },
        'Luogo Santo': { color: '#e6edf3' },
        'Piazza del Governo': { color: '#8a2be2' },
        'Acquedotto': { color: '#6196a6' },
        'Diga': { color: '#61a68f' }
    },

    FEATURES: {
        'Montagna': { base: '#6e6e7e' },
        'Foresta Pluviale': { base: '#1a4a1a' },
        'Bosco': { base: '#2a5a2a' },
        'Lago': { base: '#4aaadd' }
    }
};

// Zoom and pan state
let zoomLevel = 1;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
let targetZoom = 1;
let isZooming = false;



// Inizializzazione
let optimizerWorker = null;

// Rendi globale CIV6_DATA inizialmente vuota per non rompere roba se la mod non ha esportato nulla
window.CIV6_DATA = window.CIV6_DATA || { celle: [], soluzioni: [] };
window.extractedCities = []; // Array di città estratte (multi-città)

let logFileHandle = null;
let lastModifiedTime = 0;
let pollingIntervalId = null;

window.onload = () => {
    initCanvas();
    buildSidebar();
    initSetupUI();
    initDragAndDrop();
    initFilePicker();
    initExportControls();

    // Centra la telecamera
    if (CIV6_DATA.celle.length > 0) {
        cameraX = canvas.width / 2;
        cameraY = canvas.height / 2;
    }

    // Seleziona la prima soluzione di default
    if (CIV6_DATA.soluzioni.length > 0) {
        selectSolution(0);
        document.getElementById('resultsSection').classList.add('visible');
    }

    draw();
};

// Funzione FilePicker semplificata - usa sempre input HTML tradizionale
function initFilePicker() {
    const btnSelectLua = document.getElementById('btnSelectLua');
    if (btnSelectLua) {
        btnSelectLua.addEventListener('click', () => {
            // Crea un input file nascosto
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.log,.txt,text/plain';
            input.style.display = 'none';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        showNotification(`Caricamento ${file.name}...`, 'info');
                        const text = await file.text();
                        enhancedFileProcessing(text, file.name);
                        showNotification(`File ${file.name} caricato con successo!`, 'success');
                    } catch (error) {
                        console.error('Errore nel caricamento file:', error);
                        showNotification('Errore nel caricamento del file', 'error');
                    }
                }
            };

            // Aggiungi al body e simula click
            document.body.appendChild(input);
            input.click();

            // Rimuovi dopo un breve delay
            setTimeout(() => {
                document.body.removeChild(input);
            }, 100);
        });
    }
}

async function pollFileForChanges() {
    if (!logFileHandle) return;

    try {
        const file = await logFileHandle.getFile();
        if (file.lastModified > lastModifiedTime) {
            lastModifiedTime = file.lastModified;

            // Il file è stato aggiornato, leggiamolo
            const text = await file.text();
            processRawLogText(text);
        }
    } catch (err) {
        console.error("Errore durante la lettura del file in background:", err);
        // Potremmo aver perso i permessi, es. se l'utente ricarica la pagina.
        clearInterval(pollingIntervalId);
        const textEl = document.getElementById('fileStatusText');
        if (textEl) textEl.innerHTML = "<em>Permesso perso. Seleziona nuovamente il file.</em>";
    }
}

function processRawLogText(text) {
    let extracted = null;
    if (text.includes('--- START CITY DATA SCAN ---')) {
        extracted = estraiDaLua(text);
    } else {
        // Se non sembra un log Lua, forse è già il testo json in formato raw? 
        if (text.trim().startsWith('{')) {
            extracted = text;
        }
    }

    if (extracted && Array.isArray(extracted) && extracted.length > 0) {
        window.extractedCities = extracted;
        const fileStatusText = document.getElementById('fileStatusText');

        if (fileStatusText) {
            const cityNames = extracted.map(c => c.name || `Città ${c.id + 1}`).join(', ');
            fileStatusText.innerHTML = `${extracted.length} città trovate:<br><b>${cityNames}</b><br><small>${new Date().toLocaleTimeString()}</small>`;
        }

        // Aggiorna UI selezione città
        buildCitySelector();

        // Trigger aggiornamento mappa con tutte le città
        triggerMapUpdate();
    } else {
        // Reset del testo quando non ci sono dati validi
        const fileStatusText = document.getElementById('fileStatusText');
        if (fileStatusText) {
            fileStatusText.innerHTML = 'Trascina qui il file <b>Lua.log</b>';
        }
        window.extractedCities = [];
        buildCitySelector();
    }
}

function triggerMapUpdate() {
    try {
        // Ottieni città selezionate
        const selectedCityIds = Array.from(document.querySelectorAll('#citiesSelector input[type="checkbox"]:checked'))
            .map(cb => parseInt(cb.value));

        // Se ci sono città estratte ma nessuna checkbox (es. primo caricamento), usa tutte.
        // Se ci sono checkbox e nessuna selezionata, mappa vuota.
        const hasCheckboxes = document.querySelectorAll('#citiesSelector input[type="checkbox"]').length > 0;
        let citiesToProcess = window.extractedCities;

        if (hasCheckboxes) {
            citiesToProcess = window.extractedCities.filter(c => selectedCityIds.includes(c.id));
        }

        // Map per deduplicare celle con stesse coordinate
        const cellMap = new Map();

        // Se nessuna città da mostrare, resetta tutto
        if (citiesToProcess.length === 0) {
            window.CIV6_DATA = { celle: [], soluzioni: [] };
            draw();
            return;
        }

        // Trova il centro di riferimento (prima città selezionata)
        const refQ = citiesToProcess[0].centerQ;
        const refR = citiesToProcess[0].centerR;

        // Colori per differenziare le città
        const cityColors = ['#58a6ff', '#7ee787', '#e3b341', '#db61a2', '#a371f7', '#79c0ff'];

        // Salva i centri delle città per il rendering
        window.cityCenters = [];

        citiesToProcess.forEach((city) => {
            // Trova l'indice originale per mantenere il colore coerente
            const cityIndex = window.extractedCities.indexOf(city);
            const cityColor = cityColors[cityIndex % cityColors.length];
            const offsetQ = city.centerQ - refQ;
            const offsetR = city.centerR - refR;

            // Salva centro città in coordinate assolute
            window.cityCenters.push({
                cityId: city.id,
                cityName: city.name,
                cityColor: cityColor,
                q: offsetQ,
                r: offsetR,
                s: -offsetQ - offsetR
            });

            for (let l of city.celleRaw) {
                l = l.trim();
                if (l.startsWith("{") || l.startsWith('"') || l.startsWith("'")) {
                    let jsonStr = l.replace(/'/g, '"').replace(/:\s*True/gi, ': true').replace(/:\s*False/gi, ': false');
                    const data = (new Function('return ' + jsonStr))();
                    if (data.q === undefined || data.r === undefined) continue;

                    // Coordinate assolute = relative + offset della città
                    const absQ = data.q + offsetQ;
                    const absR = data.r + offsetR;
                    const absS = -absQ - absR;
                    const coordKey = `${absQ},${absR}`;

                    // Estrazione terreno con fallback robusto
                    const terrainType = (Array.isArray(data.t) && data.t.length > 0) 
                        ? data.t[0] 
                        : (typeof data.t === 'string' && data.t !== "" ? data.t : 'TERRAIN_GRASS'); // Grassland come fallback più probabile per celle "vuote"

                    const isCC = (data.q === 0 && data.r === 0);

                    const c = {
                        q: absQ,
                        r: absR,
                        s: absS,
                        caratteristiche: [],
                        distretto_base: isCC ? "Centro Cittadino" : null,
                        riverEdges: data.rivEdges || 0,
                        terrain: terrainType,
                        cityId: city.id,
                        cityName: city.name,
                        cityColor: cityColor
                    };

                    const tStr = Array.isArray(data.t) ? data.t.join(' ') : (data.t || '');
                    if (tStr.includes("MOUNTAIN")) c.caratteristiche.push("Montagna");
                    if (tStr.includes("HILL")) c.caratteristiche.push("Collina");
                    if (tStr.includes("COAST")) c.caratteristiche.push("Costa");
                    if (data.riv) c.caratteristiche.push("Fiume");

                    const f = data.f || "NONE";
                    if (f.includes("JUNGLE")) c.caratteristiche.push("Foresta Pluviale");
                    if (f.includes("FOREST")) c.caratteristiche.push("Bosco");
                    if (f.includes("LAKE") || tStr.includes("LAKE")) c.caratteristiche.push("Lago");

                    const res = data.res || "NONE";
                    if (res !== "NONE") {
                        if (res.includes("COAL") || res.includes("IRON") || res.includes("NITER")) c.caratteristiche.push("Strategica");
                        else c.caratteristiche.push("Lusso");
                    }

                    // Deduplicazione: Centro Cittadino ha sempre priorità, altrimenti uniamo le caratteristiche
                    const existing = cellMap.get(coordKey);
                    if (!existing) {
                        cellMap.set(coordKey, c);
                    } else {
                        // Unione caratteristiche (deduplicata)
                        const allCaratt = [...existing.caratteristiche, ...c.caratteristiche];
                        existing.caratteristiche = [...new Set(allCaratt)];
                        
                        // CC sovrascrive celle normali
                        if (isCC) {
                            existing.distretto_base = "Centro Cittadino";
                            existing.cityId = city.id;
                            existing.cityName = city.name;
                            existing.cityColor = cityColor;
                            existing.terrain = terrainType;
                        }
                    }
                }
            }
        });

        const allCitiesCells = Array.from(cellMap.values());

        if (allCitiesCells.length > 0) {
            window.CIV6_DATA = { celle: allCitiesCells, soluzioni: [] };
            document.getElementById('resultsSection').classList.remove('visible');
            cameraX = canvas.width / 2;
            cameraY = canvas.height / 2;
            draw();
        }

    } catch (e) {
        console.error("Errore nel parsing per preview mappa:", e);
    }
}

function initDragAndDrop() {
    const dropZone = document.getElementById('fileStatusContainer');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.border = '2px dashed #58a6ff';
        dropZone.style.backgroundColor = 'rgba(88, 166, 255, 0.1)';
        dropZone.style.transform = 'scale(1.02)';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.border = '2px dashed #444';
        dropZone.style.backgroundColor = '';
        dropZone.style.transform = 'scale(1)';
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.style.border = '2px dashed #444';
        dropZone.style.backgroundColor = '';
        dropZone.style.transform = 'scale(1)';

        if (e.dataTransfer.files.length) {
            const file = e.dataTransfer.files[0];

            // Validate file type
            if (!file.name.endsWith('.log') && !file.name.endsWith('.txt')) {
                showNotification('Per favore carica un file .log o .txt', 'error');
                return;
            }

            enhancedFileProcessing(await file.text(), file.name);
        }
    });
}

// Converte una stringa dict Python/Lua in formato JS valido
function convertPythonDictToJS(str) {
    // Sostituisci le chiavi con apici singoli: 'key' -> "key"
    // E i valori stringa con apici singoli: 'value' -> "value"
    let result = str;

    // Converti True/False Python in true/false JS
    result = result.replace(/:\s*True/gi, ': true').replace(/:\s*False/gi, ': false');

    // Sostituisci tutti gli apici singoli con doppi apici
    // Ma attenzione a non rompere le stringhe che contengono apici
    result = result.replace(/'/g, '"');

    return result;
}

// Modificato per supportare multi-città: restituisce array di oggetti città
function estraiDaLua(text) {
    const lines = text.split('\n');
    const cities = [];
    let currentCity = null;
    let inCityBlock = false;
    let cityIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Inizio nuovo blocco città
        if (line.includes('--- START CITY DATA SCAN ---')) {
            inCityBlock = true;
            currentCity = {
                id: cityIndex++,
                name: null,
                centerQ: 0,
                centerR: 0,
                centerS: 0,
                celleRaw: []
            };
            continue;
        }

        // Fine blocco città
        if (line.includes('--- END CITY DATA SCAN ---')) {
            if (currentCity && currentCity.celleRaw.length > 0) {
                cities.push(currentCity);
            }
            inCityBlock = false;
            currentCity = null;
            continue;
        }

        // Estrazione dati all'interno del blocco
        if (inCityBlock && currentCity) {
            // Nome città
            if (line.includes('CityScanner: City:')) {
                const match = line.match(/CityScanner: City:\s*(.+)/);
                if (match) {
                    let cityName = match[1].trim();
                    cityName = cityName.replace(/^LOC_CITY_NAME_/, '').replace(/_STK$/, '');
                    currentCity.name = cityName;
                }
                continue;
            }

            // Coordinate centro assolute
            if (line.includes('CityScanner: CenterCubic:')) {
                const match = line.match(/q=(\-?\d+),\s*r=(\-?\d+),\s*s=(\-?\d+)/);
                if (match) {
                    currentCity.centerQ = parseInt(match[1]);
                    currentCity.centerR = parseInt(match[2]);
                    currentCity.centerS = parseInt(match[3]);
                }
                continue;
            }

            // Dati cella
            if (line.includes('CityScanner:') && (line.includes('{') || line.includes("'{") || line.includes('"{'))) {
                const parti = line.split("CityScanner: ");
                let riga_dati = (parti.length > 1) ? parti[1].trim() : line.trim();
                if (riga_dati.startsWith("{") || riga_dati.startsWith("'") || riga_dati.startsWith("\"")) {
                    // Converti da formato Python (apici singoli) a formato JS
                    riga_dati = convertPythonDictToJS(riga_dati);
                    currentCity.celleRaw.push(riga_dati);
                }
            }
        }
    }

    return cities.length > 0 ? cities : null;
}

function initSetupUI() {
    document.getElementById('btnOptimize').addEventListener('click', startOptimization);
}

// Gestisce il cambio di selezione città
function onCitySelectionChange() {
    buildDistrictsUI();
    triggerMapUpdate();
}

// Costruisce il selettore città
function buildCitySelector() {
    const container = document.getElementById('citiesSelector');
    container.innerHTML = '';

    if (!window.extractedCities || window.extractedCities.length === 0) {
        container.innerHTML = '<p class="cities-placeholder">Carica un file Lua.log per vedere le città disponibili</p>';
        buildDistrictsUI(); // Aggiorna anche i distretti (saranno vuoti)
        return;
    }

    window.extractedCities.forEach(city => {
        const label = document.createElement('label');
        label.className = 'city-checkbox';
        const cellCount = city.celleRaw ? city.celleRaw.length : 0;
        label.innerHTML = `
            <input type="checkbox" value="${city.id}" checked onchange="onCitySelectionChange()"> 
            <span class="city-name">${city.name || `Città ${city.id + 1}`}</span>
            <span class="city-cells">(${cellCount} celle)</span>
        `;
        container.appendChild(label);
    });

    // Aggiorna UI distretti
    buildDistrictsUI();
}

// Costruisce UI distretti per città selezionate
function buildDistrictsUI() {
    const container = document.getElementById('districtsContainer');
    container.innerHTML = '';

    // Ottieni città selezionate
    const selectedCityIds = Array.from(document.querySelectorAll('#citiesSelector input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.value));

    const selectedCities = window.extractedCities.filter(c => selectedCityIds.includes(c.id));

    if (selectedCities.length === 0) {
        container.innerHTML = '<p class="districts-placeholder">Seleziona almeno una città per configurare i distretti</p>';
        return;
    }

    const allDistricts = ["Diga", "Acquedotto", "Accampamento", "Porto", "Campus", "Luogo Santo", "Piazza del Teatro", "Zona Industriale", "Hub Commerciale", "Piazza del Governo"];

    selectedCities.forEach(city => {
        const citySection = document.createElement('div');
        citySection.className = 'city-districts-section';

        const cityHeader = document.createElement('div');
        cityHeader.className = 'city-districts-header';
        cityHeader.innerHTML = `<strong>${city.name || `Città ${city.id + 1}`}</strong>`;
        citySection.appendChild(cityHeader);

        const districtsGrid = document.createElement('div');
        districtsGrid.className = 'districts-selector';

        allDistricts.forEach(d => {
            const label = document.createElement('label');
            label.className = 'district-checkbox';
            label.innerHTML = `<input type="checkbox" value="${d}" data-city="${city.id}" checked> ${d}`;
            districtsGrid.appendChild(label);
        });

        citySection.appendChild(districtsGrid);
        container.appendChild(citySection);
    });
}

function startOptimization() {
    // Ottieni città selezionate
    const selectedCityIds = Array.from(document.querySelectorAll('#citiesSelector input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.value));

    if (selectedCityIds.length === 0) {
        showNotification("Seleziona almeno una città!", 'error');
        return;
    }

    // Ottieni distretti per città
    const cityDistricts = {};
    let totalDistricts = 0;

    selectedCityIds.forEach(cityId => {
        const checkboxes = document.querySelectorAll(`#districtsContainer input[data-city="${cityId}"]:checked`);
        const districts = Array.from(checkboxes).map(cb => cb.value);
        cityDistricts[cityId] = districts;
        totalDistricts += districts.length;
    });

    if (totalDistricts === 0) {
        showNotification("Seleziona almeno un distretto per una delle città!", 'error');
        return;
    }

    // Prepara dati città per il worker
    const citiesData = selectedCityIds.map(cityId => {
        const city = window.extractedCities.find(c => c.id === cityId);
        return {
            id: city.id,
            name: city.name,
            centerQ: city.centerQ,
            centerR: city.centerR,
            centerS: city.centerS,
            celleRaw: city.celleRaw,
            districts: cityDistricts[cityId]
        };
    });

    // UI Updates
    document.getElementById('btnOptimize').disabled = true;
    document.getElementById('progressContainer').classList.add('visible');
    document.getElementById('resultsSection').classList.remove('visible');

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

                document.getElementById('btnOptimize').disabled = false;
                document.getElementById('progressContainer').classList.remove('visible');
                document.getElementById('resultsSection').classList.add('visible');

                // Re-inizializza la visualizzazione
                cameraX = canvas.width / 2;
                cameraY = canvas.height / 2;

                buildSidebar();
                if (CIV6_DATA.soluzioni.length > 0) {
                    selectSolution(0);
                }
                draw();
            } catch (err) {
                showNotification("Errore: " + err.toString(), 'error');
            }

        } else if (msg.type === 'ERROR') {
            showNotification("Errore: " + msg.message, 'error');
            document.getElementById('btnOptimize').disabled = false;
            document.getElementById('progressContainer').classList.remove('visible');
        }
    };

    const generations = parseInt(document.getElementById('inputGenerations').value) || 500;
    const populationSize = parseInt(document.getElementById('inputPopulation').value) || 1000;

    optimizerWorker.postMessage({
        message: 'START_OPTIMIZATION',
        citiesData: citiesData,
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
        // Account for zoom in drag start position
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
            // Pan moves at same speed regardless of zoom
            cameraX = e.clientX - startDragX;
            cameraY = e.clientY - startDragY;
            draw();
        }

        // Calcolo Hover
        handleHover(e.clientX, e.clientY);
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();

        // Zoom with mouse wheel (vertical scroll)
        if (e.deltaY !== 0) {
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel * zoomFactor));

            // Zoom toward mouse position
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate world position before zoom
            const worldX = (mouseX - cameraX) / zoomLevel;
            const worldY = (mouseY - cameraY) / zoomLevel;

            zoomLevel = newZoom;

            // Adjust camera to keep mouse position stable
            cameraX = mouseX - worldX * zoomLevel;
            cameraY = mouseY - worldY * zoomLevel;

            if (window.updateZoomIndicator) window.updateZoomIndicator();
        }

        // Pan with shift+wheel or horizontal scroll
        if (e.deltaX !== 0) {
            cameraX -= e.deltaX * 0.5;
        }

        draw();
    }, { passive: false });

    // Initialize map control buttons
    initMapControls();
}

// Map Controls - Zoom buttons and reset
function initMapControls() {
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetViewBtn = document.getElementById('resetViewBtn');
    const zoomIndicator = document.getElementById('zoomIndicator');

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            const newZoom = Math.min(MAX_ZOOM, zoomLevel * 1.2);
            zoomLevel = newZoom;
            updateZoomIndicator();
            draw();
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            const newZoom = Math.max(MIN_ZOOM, zoomLevel / 1.2);
            zoomLevel = newZoom;
            updateZoomIndicator();
            draw();
        });
    }

    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', () => {
            // Reset to default view
            zoomLevel = 1;
            cameraX = canvas.width / 2;
            cameraY = canvas.height / 2;
            updateZoomIndicator();
            draw();
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return; // Don't trigger when typing

        switch (e.key) {
            case '+':
            case '=':
                zoomLevel = Math.min(MAX_ZOOM, zoomLevel * 1.2);
                updateZoomIndicator();
                draw();
                break;
            case '-':
                zoomLevel = Math.max(MIN_ZOOM, zoomLevel / 1.2);
                updateZoomIndicator();
                draw();
                break;
            case '0':
                zoomLevel = 1;
                updateZoomIndicator();
                draw();
                break;
            case 'Home':
                cameraX = canvas.width / 2;
                cameraY = canvas.height / 2;
                zoomLevel = 1;
                updateZoomIndicator();
                draw();
                break;
        }
    });

    function updateZoomIndicator() {
        if (zoomIndicator) {
            zoomIndicator.textContent = Math.round(zoomLevel * 100) + '%';
        }
    }

    // Expose for external access
    window.updateZoomIndicator = updateZoomIndicator;
}

// Logica Hex
function hexToPixel(q, r) {
    const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
    const y = -(HEX_SIZE * 3 / 2 * r);
    return { x, y };
}

function pixelToHex(x, y) {
    y = -y;
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

// Get terrain color object
function getTerrainColor(cella) {
    // Le caratteristiche che alterano fisicamente il TIPO di mappa (Montagne, Laghi) 
    // possono sovrascrivere il colore, ma Boschi e Foreste Pluviali NO, 
    // altrimenti mascherano il terreno sottostante (es. Pianura vs Prateria).
    if (cella.caratteristiche.includes('Montagna')) {
        return COLORS.FEATURES['Montagna'] || COLORS.TERRAINS['default'];
    }
    if (cella.caratteristiche.includes('Lago')) {
        return COLORS.FEATURES['Lago'] || COLORS.TERRAINS['default'];
    }
    if (cella.caratteristiche.includes('Costa') && !cella.terrain.includes('OCEAN')) {
        return COLORS.TERRAINS['TERRAIN_COAST'] || COLORS.TERRAINS['default'];
    }
    if (cella.caratteristiche.includes('Oasi')) {
        return { base: '#b8a84a' }; // L'Oasi è un'eccezione visiva accettabile
    }
    
    // Determina il tipo di terreno base esportato dal log Lua
    let terrainType = cella.terrain || 'TERRAIN_PLAINS';
    const hasHill = cella.caratteristiche.includes('Collina');

    // FIX: Evita di aggiungere '_HILLS' se la stringa terrainType lo contiene già 
    // (previene la ricerca di 'TERRAIN_GRASS_HILLS_HILLS')
    if (hasHill && !terrainType.includes('_HILLS') && COLORS.TERRAINS[terrainType + '_HILLS']) {
        return COLORS.TERRAINS[terrainType + '_HILLS'];
    }

    // Ritorna il colore del terreno esatto, o il fallback se la mod ha generato un terreno sconosciuto
    return COLORS.TERRAINS[terrainType] || COLORS.TERRAINS['default'];
}



// Simplified hex drawing - clean colors
function drawHex(x, y, size, colorObj, strokeStyle, lineWidth = 1) {
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

    // Use base color directly
    if (colorObj && typeof colorObj === 'object' && colorObj.base) {
        ctx.fillStyle = colorObj.base;
    } else {
        ctx.fillStyle = colorObj;
    }
    ctx.fill();

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
}

// Legacy simple hex drawing for backward compatibility
function drawHexSimple(x, y, size, fillStyle, strokeStyle, lineWidth = 1) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle_deg = 60 * i + 30;
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

// Main draw function with Civ 6 style rendering
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(cameraX, cameraY);
    ctx.scale(zoomLevel, zoomLevel);

    const activeSolution = CIV6_DATA.soluzioni.find(s => s.id === selectedSolutionId);
    let activeLayout = activeSolution ? activeSolution.layout : {};

    // Helper: estrai nome base distretto (rimuovi prefisso [CityName])
    function getDistrettoBase(nome) {
        if (nome && nome.includes('] ')) return nome.split('] ')[1];
        return nome;
    }

    // Helper: estrai prefisso città dal nome distretto
    function getCityPrefix(nome) {
        if (nome && nome.includes('] ')) {
            const match = nome.match(/^\[(.+?)\]/);
            return match ? match[1] : null;
        }
        return null;
    }

    // Disegna tutte le celle esportate
    const drawnHexes = new Set();
    CIV6_DATA.celle.forEach(cella => {
        // Safety: don't draw the same hex twice in the same frame
        const coordKey = `${cella.q},${cella.r}`;
        if (drawnHexes.has(coordKey)) return;
        drawnHexes.add(coordKey);

        const pos = hexToPixel(cella.q, cella.r);

        // Get enhanced terrain color object
        let terrainColor = getTerrainColor(cella);
        let isHovered = hoveredHex && hoveredHex.q === cella.q && hoveredHex.r === cella.r;

        // Colore bordo basato sull'appartenenza alla città
        let strokeColor = 'rgba(255, 255, 255, 0.15)';
        let strokeWidth = 1;

        if (cella.cityColor && window.extractedCities && window.extractedCities.length > 1) {
            // Bordo colorato per mostrare appartenenza alla città
            strokeColor = cella.cityColor + '80'; // 50% opacità
            strokeWidth = 2;
        }

        // Draw hex - simple stroke on hover without glow
        if (isHovered) {
            strokeColor = 'rgba(255, 255, 255, 0.5)';
            strokeWidth = 2;
        }

        drawHex(pos.x, pos.y, HEX_SIZE - 1, terrainColor, strokeColor, strokeWidth);

        // Disegna Distretto (Centro Cittadino o dal Layout)
        let renderDistretto = cella.distretto_base;
        let distrettoCityPrefix = null;

        // Controlla se la soluzione attuale piazza un distretto qui
        for (const [nome_distretto, p] of Object.entries(activeLayout)) {
            if (p.q === cella.q && p.r === cella.r) {
                renderDistretto = nome_distretto;
                distrettoCityPrefix = getCityPrefix(nome_distretto);
                break;
            }
        }

        // Draw district - simplified without icons
        if (renderDistretto) {
            const distrettoBase = getDistrettoBase(renderDistretto);
            const distConfig = COLORS.DISTRICTS[distrettoBase] || COLORS.DISTRICTS[renderDistretto] || { color: '#ffffff', icon: 'city', glow: '#6d9eff' };

            // Background scuro per distretto
            drawHexSimple(pos.x, pos.y, HEX_SIZE - 10, 'rgba(0,0,0,0.7)', distConfig.color, 2);

            // Nome Distretto
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let txt = distrettoBase.substring(0, 3).toUpperCase();
            if (distrettoBase === "Centro Cittadino") txt = "CC";
            if (distrettoBase === "Hub Commerciale") txt = "HUB";

            // Per CC, mostra nome città sotto
            if (distrettoBase === "Centro Cittadino") {
                ctx.fillText(txt, pos.x, pos.y - 7);

                // Nome della città sotto il CC
                ctx.font = 'bold 7px Inter';
                const cityName = cella.cityName || '';
                const shortName = cityName.length > 7 ? cityName.substring(0, 7) + '.' : cityName;
                ctx.fillStyle = cella.cityColor || '#ffffff';
                ctx.fillText(shortName, pos.x, pos.y + 7);
            } else {
                // Per distretti normali
                ctx.fillText(txt, pos.x, pos.y - 5);

                // Indicatore città sotto (se multi-città)
                if (distrettoCityPrefix || (cella.cityName && window.extractedCities && window.extractedCities.length > 1)) {
                    const cityLabel = distrettoCityPrefix || cella.cityName || '';
                    const shortCity = cityLabel.length > 5 ? cityLabel.substring(0, 5) : cityLabel;
                    ctx.font = '6px Inter';

                    let cityCol = cella.cityColor || '#aaa';
                    if (distrettoCityPrefix && window.cityCenters) {
                        const center = window.cityCenters.find(c => c.cityName === distrettoCityPrefix);
                        if (center) cityCol = center.cityColor;
                    }

                    ctx.fillStyle = cityCol;
                    ctx.fillText(shortCity, pos.x, pos.y + 6);
                }
            }
        }

        // River indicator - simple wavy line (keeps terrain color underneath)
        if (cella.caratteristiche.includes('Fiume')) {
            ctx.save();
            ctx.strokeStyle = 'rgba(80, 150, 220, 0.6)';
            ctx.lineWidth = 2;
            // Draw a simple wave pattern
            ctx.beginPath();
            ctx.moveTo(pos.x - HEX_SIZE * 0.3, pos.y);
            ctx.quadraticCurveTo(pos.x, pos.y - 4, pos.x + HEX_SIZE * 0.3, pos.y);
            ctx.stroke();
            ctx.restore();
        }

    });

    ctx.restore();
}

// UI and Interaction
function buildSidebar() {
    const list = document.getElementById('solutionsList');
    list.innerHTML = '';

    // Sort solutions by current sort key
    if (currentSortKey && CIV6_DATA.soluzioni.length > 0) {
        CIV6_DATA.soluzioni.sort((a, b) => (b.rese[currentSortKey] || 0) - (a.rese[currentSortKey] || 0));
    }

    CIV6_DATA.soluzioni.forEach((sol, index) => {
        const card = document.createElement('div');
        card.className = `solution-card ${sol.id === selectedSolutionId ? 'active' : ''}`;
        card.setAttribute('role', 'option');
        card.setAttribute('aria-selected', sol.id === selectedSolutionId);
        card.onclick = () => selectSolution(sol.id);

        const r = sol.rese;

        // Costruzione esplicita della griglia per prevenire problemi di rendering
        let yieldsHtml = `
            <div class="yields-grid">
                <div class="yield-item"><span class="yield-icon yield-icon--science"></span><span class="yield-value">${r.Scienza || 0}</span></div>
                <div class="yield-item"><span class="yield-icon yield-icon--production"></span><span class="yield-value">${r.Produzione || 0}</span></div>
                <div class="yield-item"><span class="yield-icon yield-icon--gold"></span><span class="yield-value">${r.Oro || 0}</span></div>
                <div class="yield-item"><span class="yield-icon yield-icon--culture"></span><span class="yield-value">${r.Cultura || 0}</span></div>
                <div class="yield-item"><span class="yield-icon yield-icon--faith"></span><span class="yield-value">${r.Fede || 0}</span></div>
            </div>
        `;

        card.innerHTML = `
            <div class="solution-header">
                <span class="solution-title">Layout #${index + 1}</span>
                <span class="solution-id">Distretti: ${Object.keys(sol.layout).length}</span>
            </div>
            ${yieldsHtml}
        `;
        list.appendChild(card);
    });

    // Aggiorna altezza massima solutions-list in base al numero di soluzioni
    if (CIV6_DATA.soluzioni.length > 0) {
        list.style.maxHeight = 'calc(100vh - 500px)';
    }

    // Show export controls when there are solutions
    const exportControls = document.getElementById('exportControls');
    if (exportControls && CIV6_DATA.soluzioni.length > 0) {
        exportControls.style.display = 'flex';
    }
}

function sortSolutions(key) {
    currentSortKey = key;
    buildSidebar();

    // Auto-scroll to top of results and sidebar
    const solutionsList = document.getElementById('solutionsList');
    if (solutionsList) solutionsList.scrollTop = 0;
    // Scroll sidebar to show the results section
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.scrollIntoView({ behavior: 'auto', block: 'start' });
    }

    if (selectedSolutionId !== null) {
        selectSolution(selectedSolutionId);
    }
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === key);
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
    // Account for zoom level in mouse position conversion
    const x = (mouseX - rect.left - cameraX) / zoomLevel;
    const y = (mouseY - rect.top - cameraY) / zoomLevel;

    const hex = pixelToHex(x, y);

    // Controlla se l'hex è nella nostra mappa
    const cella = CIV6_DATA.celle.find(c => c.q === hex.q && c.r === hex.r);

    if (cella) {
        if (!hoveredHex || hoveredHex.q !== hex.q || hoveredHex.r !== hex.r) {
            hoveredHex = hex;
            updateTooltip(cella, mouseX, mouseY);
            draw();
        } else {
            // Update tooltip position to follow cursor closely
            positionTooltip(mouseX, mouseY);
        }
    } else if (hoveredHex) {
        hoveredHex = null;
        document.getElementById('tooltip').classList.remove('visible');
        draw();
    }
}

function positionTooltip(mouseX, mouseY) {
    const tt = document.getElementById('tooltip');
    if (!tt) return;

    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const ttRect = tt.getBoundingClientRect();

    // Position relative to map-container
    let x = mouseX - rect.left + 15;
    let y = mouseY - rect.top + 15;

    // Prevent tooltip from going off-screen right/bottom of its container
    if (x + ttRect.width > rect.width - 20) {
        x = mouseX - rect.left - ttRect.width - 15;
    }
    if (y + ttRect.height > rect.height - 20) {
        y = mouseY - rect.top - ttRect.height - 15;
    }

    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
}
// Enhanced tooltip update with detailed information
function updateTooltip(cella, mouseX, mouseY) {
    const tt = document.getElementById('tooltip');
    if (!tt) return;

    const terrainColor = getTerrainColor(cella);

    // Determine terrain name for display
    let terrainName = 'Pianura';
    const terrainMap = {
        'TERRAIN_GRASS': 'Prateria',
        'TERRAIN_GRASS_HILLS': 'Prateria Collina',
        'TERRAIN_GRASS_MOUNTAIN': 'Montagna (Prateria)',
        'TERRAIN_PLAINS': 'Pianura',
        'TERRAIN_PLAINS_HILLS': 'Pianura Collina',
        'TERRAIN_PLAINS_MOUNTAIN': 'Montagna (Pianura)',
        'TERRAIN_DESERT': 'Deserto',
        'TERRAIN_DESERT_HILLS': 'Deserto Collina',
        'TERRAIN_DESERT_MOUNTAIN': 'Montagna (Deserto)',
        'TERRAIN_TUNDRA': 'Tundra',
        'TERRAIN_TUNDRA_HILLS': 'Tundra Collina',
        'TERRAIN_TUNDRA_MOUNTAIN': 'Montagna (Tundra)',
        'TERRAIN_SNOW': 'Neve',
        'TERRAIN_SNOW_HILLS': 'Neve Collina',
        'TERRAIN_SNOW_MOUNTAIN': 'Montagna (Neve)',
        'TERRAIN_COAST': 'Costa',
        'TERRAIN_OCEAN': 'Oceano'
    };

    if (cella.terrain) {
        terrainName = terrainMap[cella.terrain] || cella.terrain.replace('TERRAIN_', '');
    }

    // Aggiungi suffisso Collina se non presente nel nome del terreno ma presente nelle caratteristiche
    const hasHill = cella.caratteristiche.includes('Collina');
    if (hasHill && !terrainName.includes('Collina')) {
        terrainName += ' Collina';
    }


    // Check for features
    let featureText = '';
    if (cella.caratteristiche.length > 0) {
        const features = cella.caratteristiche.filter(c => !c.includes('Lusso') && !c.includes('Strategica'));
        if (features.length > 0) {
            featureText = features.join(' • ');
        }
    }

    // Check for resources
    let resourceText = '';
    if (cella.caratteristiche.includes('Lusso')) resourceText = '💎 Risorsa Lusso';
    if (cella.caratteristiche.includes('Strategica')) resourceText += (resourceText ? ' | ' : '') + '♠ Risorsa Strategica';

    let html = `
        <div class="tooltip__header" style="border-left: 3px solid ${terrainColor.base};">
            <div class="tooltip__title">Cella (${cella.q}, ${cella.r})</div>
            <div class="tooltip__terrain">${terrainName}</div>
            <div style="color:gray;font-size:10px;margin-top:2px;">Raw: ${cella.terrain}</div>
        </div>
        <div class="tooltip__body">
    `;

    // City ownership
    if (cella.cityName) {
        html += `<div class="tooltip__city" style="color: ${cella.cityColor || '#6d9eff'};">🏛 ${cella.cityName}</div>`;
    }

    // Features
    if (featureText) {
        html += `<div class="tooltip__features">🌲 ${featureText}</div>`;
    } else {
        html += `<div class="tooltip__features" style="opacity: 0.7;">${terrainName}</div>`;
    }

    // Resources
    if (resourceText) {
        html += `<div class="tooltip__resource">${resourceText}</div>`;
    }

    // River info
    if (cella.caratteristiche.includes('Fiume')) {
        let riverTxt = '~ Fiume';
        if (cella.riverEdges > 0) riverTxt += ` (Lati: ${cella.riverEdges})`;
        html += `<div class="tooltip__river" style="color: #5096dc;">${riverTxt}</div>`;
    }

    // Check for district
    const activeSolution = CIV6_DATA.soluzioni.find(s => s.id === selectedSolutionId);
    let distretto = cella.distretto_base;

    if (activeSolution && activeSolution.layout) {
        for (const [nome_distretto, p] of Object.entries(activeSolution.layout)) {
            if (p.q === cella.q && p.r === cella.r) {
                distretto = nome_distretto;
                break;
            }
        }
    }

    if (distretto) {
        const distrettoBase = distretto.includes('] ') ? distretto.split('] ')[1] : distretto;
        const distConfig = COLORS.DISTRICTS[distrettoBase] || { color: '#ffffff', icon: 'city' };

        html += `
            <div class="tooltip__district" style="border-color: ${distConfig.color};">
                <span class="tooltip__district-icon">${getDistrictEmoji(distrettoBase)}</span>
                ${distrettoBase}
            </div>
        `;

        // Mostra Bonus Adiacenza Calcolato (Real-time)
        if (activeSolution && distretto !== "Centro Cittadino") {
            const resaAdiacenza = calcolaResaDistretto(cella, distretto, activeSolution);
            if (resaAdiacenza && resaAdiacenza.valore > 0) {
                const yieldIcons = { 'Scienza': '🔬', 'Oro': '💰', 'Produzione': '⚙️', 'Cultura': '🎭', 'Fede': '✨', 'Cibo': '🍞' };
                const icon = yieldIcons[resaAdiacenza.tipo] || '•';
                html += `<div class="tooltip__yield" style="color: #4ade80; font-weight: bold; margin-top: 5px; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 5px;">
                    ✨ Adiacenza: ${icon} +${resaAdiacenza.valore} ${resaAdiacenza.tipo}
                </div>`;
            }
        }

        // Add yield info if available from solution
        if (activeSolution && activeSolution.rendimenti) {
            const cellaKey = `${cella.q},${cella.r}`;
            if (activeSolution.rendimenti[cellaKey]) {
                const yields = activeSolution.rendimenti[cellaKey];
                const yieldIcons = { 'Scienza': '🔬', 'Gold': '💰', 'Produzione': '⚙️', 'Cultura': '🎭', 'Fede': '✨', 'Cibo': '🍞' };
                
                for (const [yieldType, value] of Object.entries(yields)) {
                    if (value !== 0) {
                        const icon = yieldIcons[yieldType] || '•';
                        const sign = value > 0 ? '+' : '';
                        html += `<div class="tooltip__yield" style="color: ${value > 0 ? '#4ade80' : '#f87171'};">${icon} ${sign}${value} ${yieldType}</div>`;
                    }
                }
            }
        }
    }

    html += `</div>`;
    
    tt.innerHTML = html;
    tt.classList.add('visible');
    positionTooltip(mouseX, mouseY);
}

// Helper to get emoji for district
function getDistrictEmoji(distrettoBase) {
    const emojiMap = {
        'Centro Cittadino': '🏰',
        'Campus': '🔬',
        'Hub Commerciale': '⚖️',
        'Porto': '⚓',
        'Zona Industriale': '🏭',
        'Piazza del Teatro': '🎭',
        'Accampamento': '⛺',
        'Luogo Santo': '⛩',
        'Piazza del Governo': '🏛',
        'Acquedotto': '💧',
        'Diga': '🌉'
    };
    return emojiMap[distrettoBase] || '📍';
}


// Calculate individual district yield for tooltip
function calcolaResaDistretto(cella, distrettoNome, activeSolution) {
    if (!activeSolution || !distrettoNome || distrettoNome === "Centro Cittadino") return null;

    // Estrai il nome del distretto senza prefisso città
    let nomeBase = distrettoNome;
    if (distrettoNome.includes('] ')) {
        nomeBase = distrettoNome.split('] ')[1];
    }

    const direzioni = [
        { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
        { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 }
    ];
    const adiacenti = direzioni.map(d => ({ q: cella.q + d.q, r: cella.r + d.r, s: cella.s + d.s }));
    const layout = activeSolution.layout;

    const celleAdiacenti = adiacenti.map(adj => {
        const c = CIV6_DATA.celle.find(cl => cl.q === adj.q && cl.r === adj.r);
        if (!c) return null;
        let dist = c.distretto_base;
        for (const [nome, p] of Object.entries(layout)) {
            if (p.q === c.q && p.r === c.r) { dist = nome; break; }
        }
        // Simulate feature destruction: when a district is placed on a cell,
        // Bosco, Foresta Pluviale, and Risorsa Cava are destroyed
        let caratt = [...c.caratteristiche];
        if (dist && dist !== c.distretto_base) {
            const distruttibili = ["Bosco", "Foresta Pluviale", "Risorsa Cava"];
            caratt = caratt.filter(f => !distruttibili.includes(f));
        }
        return { ...c, caratteristiche: caratt, distretto_effettivo: dist };
    }).filter(c => c !== null);

    const numDistAdj = celleAdiacenti.filter(c => c.distretto_effettivo !== null).length;

    // Controlla se c'è una piazza del governo adiacente (considerando anche prefisso)
    const haGoverno = celleAdiacenti.some(c => {
        if (!c.distretto_effettivo) return false;
        const nomeEffettivo = c.distretto_effettivo.includes('] ') ? c.distretto_effettivo.split('] ')[1] : c.distretto_effettivo;
        return nomeEffettivo === "Piazza del Governo";
    });

    let bonus = Math.floor(numDistAdj / 2) + (haGoverno ? 1 : 0);

    let tipo = '', valore = 0;
    if (nomeBase === "Campus") {
        const m = celleAdiacenti.filter(c => c.caratteristiche.includes("Montagna")).length;
        const b = celleAdiacenti.filter(c => c.caratteristiche.includes("Barriera Corallina")).length * 2;
        const g = celleAdiacenti.filter(c => c.caratteristiche.includes("Fessura Geotermale")).length * 2;
        const f = celleAdiacenti.filter(c => c.caratteristiche.includes("Foresta Pluviale")).length;
        valore = m + b + g + Math.floor(f / 2) + bonus; tipo = 'Scienza';
    } else if (nomeBase === "Hub Commerciale") {
        const haFiume = cella.caratteristiche.includes("Fiume") ? 2 : 0;
        const p = celleAdiacenti.filter(c => {
            if (!c.distretto_effettivo) return false;
            const nomeEffettivo = c.distretto_effettivo.includes('] ') ? c.distretto_effettivo.split('] ')[1] : c.distretto_effettivo;
            return nomeEffettivo === "Porto";
        }).length * 2;
        valore = haFiume + p + bonus; tipo = 'Oro';
    } else if (nomeBase === "Porto") {
        const cc = celleAdiacenti.filter(c => {
            if (!c.distretto_effettivo) return false;
            const nomeEffettivo = c.distretto_effettivo.includes('] ') ? c.distretto_effettivo.split('] ')[1] : c.distretto_effettivo;
            return nomeEffettivo === "Centro Cittadino";
        }).length * 2;
        const rm = celleAdiacenti.filter(c => c.caratteristiche.includes("Risorsa Marina")).length;
        valore = cc + rm + bonus; tipo = 'Oro';
    } else if (nomeBase === "Zona Industriale") {
        const ad = celleAdiacenti.filter(c => {
            if (!c.distretto_effettivo) return false;
            const nomeEffettivo = c.distretto_effettivo.includes('] ') ? c.distretto_effettivo.split('] ')[1] : c.distretto_effettivo;
            return nomeEffettivo === "Acquedotto" || nomeEffettivo === "Diga" || nomeEffettivo === "Canale";
        }).length * 2;
        
        const s = celleAdiacenti.filter(c => c.caratteristiche.includes("Risorsa Strategica")).length;
        const q = celleAdiacenti.filter(c => c.caratteristiche.includes("Potenziale Cava") && !c.distretto_effettivo).length;

        const numMiglioramenti = celleAdiacenti.filter(c => {
            if (c.distretto_effettivo) return false;
            return c.caratteristiche.includes("Collina") || 
                   c.caratteristiche.includes("Potenziale Miniera") || 
                   c.caratteristiche.includes("Bosco") || 
                   c.caratteristiche.includes("Foresta Pluviale");
        }).length;
        
        valore = ad + s + q + Math.floor(numMiglioramenti / 2) + bonus; tipo = 'Produzione';
    } else if (nomeBase === "Piazza del Teatro") {
        valore = bonus; tipo = 'Cultura';
    } else if (nomeBase === "Accampamento") {
        return null;
    } else if (nomeBase === "Luogo Santo") {
        const m = celleAdiacenti.filter(c => c.caratteristiche.includes("Montagna")).length;
        const mn = celleAdiacenti.filter(c => c.caratteristiche.includes("Meraviglia Naturale")).length * 2;
        const bo = celleAdiacenti.filter(c => c.caratteristiche.includes("Bosco") && !c.distretto_effettivo).length;
        valore = m + mn + Math.floor(bo / 2) + bonus; tipo = 'Fede';
    } else {
        return null;
    }
    return { tipo, valore };
}

// Export Controls
function initExportControls() {
    const btnExportJSON = document.getElementById('btnExportJSON');
    const btnExportPNG = document.getElementById('btnExportPNG');
    const btnCopyLayout = document.getElementById('btnCopyLayout');

    if (btnExportJSON) {
        btnExportJSON.addEventListener('click', exportToJSON);
    }

    if (btnExportPNG) {
        btnExportPNG.addEventListener('click', exportToPNG);
    }

    if (btnCopyLayout) {
        btnCopyLayout.addEventListener('click', copyLayoutToClipboard);
    }
}

function exportToJSON() {
    const activeSolution = CIV6_DATA.soluzioni.find(s => s.id === selectedSolutionId);
    if (!activeSolution) {
        showNotification('Nessuna soluzione selezionata', 'error');
        return;
    }

    const exportData = {
        timestamp: new Date().toISOString(),
        city: CIV6_DATA.celle,
        solution: activeSolution,
        metadata: {
            totalCells: CIV6_DATA.celle.length,
            districts: Object.keys(activeSolution.layout).length,
            totalYields: Object.values(activeSolution.rese).reduce((a, b) => a + b, 0)
        }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `civ6_layout_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('Layout esportato come JSON', 'success');
}

function exportToPNG() {
    const canvas = document.getElementById('hexCanvas');
    if (!canvas) return;

    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `civ6_layout_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification('Mappa esportata come PNG', 'success');
    });
}

function copyLayoutToClipboard() {
    const activeSolution = CIV6_DATA.soluzioni.find(s => s.id === selectedSolutionId);
    if (!activeSolution) {
        showNotification('Nessuna soluzione selezionata', 'error');
        return;
    }

    const layoutText = Object.entries(activeSolution.layout)
        .map(([district, pos]) => `${district}: (${pos.q}, ${pos.r})`)
        .join('\n');

    navigator.clipboard.writeText(layoutText).then(() => {
        showNotification('Layout copiato negli appunti', 'success');
    }).catch(() => {
        showNotification('Errore durante la copia', 'error');
    });
}

// Enhanced File Loading Feedback
function enhancedFileProcessing(text, fileName) {
    const fileStatusContainer = document.getElementById('fileStatusContainer');
    const fileStatusText = document.getElementById('fileStatusText');

    fileStatusContainer.classList.add('file-loading');
    fileStatusText.innerHTML = `Elaborazione: <b>${fileName}</b>`;

    // Process immediately without artificial delay
    processRawLogText(text);

    // Show success feedback
    fileStatusContainer.classList.remove('file-loading');
    fileStatusContainer.classList.add('file-success');
    fileStatusText.innerHTML = `Caricato: <b>${fileName}</b>`;

    setTimeout(() => {
        fileStatusContainer.classList.remove('file-success');
    }, 3000);
}

// Notification System
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Style the notification
    Object.assign(notification.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: type === 'success' ? '#2ea043' : type === 'error' ? '#f85149' : '#58a6ff',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: '10000',
        opacity: '0',
        transform: 'translateY(20px)',
        transition: 'all 0.3s ease'
    });

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Load Example Data Function
function loadExampleData() {
    const exampleData = `CityScanner: --- START CITY DATA SCAN ---
CityScanner: City: LOC_CITY_NAME_LISBON_STK
CityScanner: CenterCubic: q=40, r=27, s=-67
CityScanner: {'q': 0, 'r': -4, 's': 4, 't': 'TERRAIN_GRASS_MOUNTAIN', 'f': 'FEATURE_VOLCANO', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': -4, 's': 3, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': -4, 's': 2, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'RESOURCE_CRABS', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': -4, 's': 1, 't': 'TERRAIN_OCEAN', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 4, 'r': -4, 's': 0, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'RESOURCE_FISH', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': -3, 's': 4, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': 0, 'r': -3, 's': 3, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': 1, 'r': -3, 's': 2, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': -3, 's': 1, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': -3, 's': 0, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 4, 'r': -3, 's': -1, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': -2, 'r': -2, 's': 4, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'RESOURCE_WHALES', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': -2, 's': 3, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 3}
CityScanner: {'q': 0, 'r': -2, 's': 2, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': 1, 'r': -2, 's': 1, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FOREST', 'res': 'RESOURCE_URANIUM', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': -2, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': -2, 's': -1, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'RESOURCE_MAIZE', 'riv': true, 'rivEdges': 3}
CityScanner: {'q': 4, 'r': -2, 's': -2, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': -3, 'r': -1, 's': 4, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': -1, 's': 3, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': -1, 's': 2, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'RESOURCE_NITER', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': 0, 'r': -1, 's': 1, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': 1, 'r': -1, 's': 0, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'RESOURCE_STONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': -1, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': 3, 'r': -1, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 4}
CityScanner: {'q': 4, 'r': -1, 's': -3, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'RESOURCE_WHEAT', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': -4, 'r': 0, 's': 4, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'RESOURCE_WHALES', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 0, 's': 3, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': 0, 's': 2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': 0, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': 0, 'r': 0, 's': 0, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'NONE', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': 1, 'r': 0, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': 0, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': 3, 'r': 0, 's': -3, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 3}
CityScanner: {'q': 4, 'r': 0, 's': -4, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': -4, 'r': 1, 's': 3, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 1, 's': 2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': 1, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_BANANAS', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': 1, 's': 0, 't': 'TERRAIN_PLAINS_MOUNTAIN', 'f': 'NONE', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': 0, 'r': 1, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': 1, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_HORSES', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': 1, 's': -3, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': 1, 's': -4, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': -4, 'r': 2, 's': 2, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'NONE', 'res': 'RESOURCE_SHEEP', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 2, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': 2, 's': 0, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': 2, 's': -1, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 0, 'r': 2, 's': -2, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': 2, 's': -3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_HORSES', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': 2, 's': -4, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -4, 'r': 3, 's': 1, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 3, 's': 0, 't': 'TERRAIN_DESERT_HILLS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': 3, 's': -1, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': 3, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_GEOTHERMAL_FISSURE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 0, 'r': 3, 's': -3, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': 3, 's': -4, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -4, 'r': 4, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 4, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': 4, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_WHEAT', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': 4, 's': -3, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 0, 'r': 4, 's': -4, 't': 'TERRAIN_GRASS_HILLS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: --- END CITY DATA SCAN ---
CityScanner: --- START CITY DATA SCAN ---
CityScanner: City: LOC_CITY_NAME_PORTO_STK
CityScanner: CenterCubic: q=44, r=25, s=-69
CityScanner: {'q': -4, 'r': 0, 's': 4, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': -4, 'r': 1, 's': 3, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': -4, 'r': 2, 's': 2, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'NONE', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': -4, 'r': 3, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -4, 'r': 4, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': -1, 's': 4, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 0, 's': 3, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FOREST', 'res': 'RESOURCE_URANIUM', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 1, 's': 2, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'RESOURCE_STONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 2, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 3, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_HORSES', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -3, 'r': 4, 's': -1, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': -2, 's': 4, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'RESOURCE_CRABS', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': -1, 's': 3, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': 0, 's': 2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': 1, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': -2, 'r': 2, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': -2, 'r': 3, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_JUNGLE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -2, 'r': 4, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': -3, 's': 4, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'RESOURCE_FISH', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': -2, 's': 3, 't': 'TERRAIN_OCEAN', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': -1, 's': 2, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': -1, 'r': 0, 's': 1, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'RESOURCE_MAIZE', 'riv': true, 'rivEdges': 3}
CityScanner: {'q': -1, 'r': 1, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 4}
CityScanner: {'q': -1, 'r': 2, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 3}
CityScanner: {'q': -1, 'r': 3, 's': -2, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': -1, 'r': 4, 's': -3, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 0, 'r': -4, 's': 4, 't': 'TERRAIN_OCEAN', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 0, 'r': -3, 's': 3, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'RESOURCE_WHALES', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 0, 'r': -2, 's': 2, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'RESOURCE_FISH', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 0, 'r': -1, 's': 1, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': 0, 'r': 0, 's': 0, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': 0, 'r': 1, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'RESOURCE_WHEAT', 'riv': true, 'rivEdges': 1}
CityScanner: {'q': 0, 'r': 2, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FLOODPLAINS_PLAINS', 'res': 'NONE', 'riv': true, 'rivEdges': 2}
CityScanner: {'q': 0, 'r': 3, 's': -3, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 0, 'r': 4, 's': -4, 't': 'TERRAIN_GRASS_HILLS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': -4, 's': 3, 't': 'TERRAIN_OCEAN', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': -3, 's': 2, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': -2, 's': 1, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': -1, 's': 0, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': 0, 's': -1, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_JUNGLE', 'res': 'RESOURCE_BANANAS', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': 1, 's': -2, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': 2, 's': -3, 't': 'TERRAIN_GRASS_HILLS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 1, 'r': 3, 's': -4, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': -4, 's': 2, 't': 'TERRAIN_OCEAN', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': -3, 's': 1, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': -2, 's': 0, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': -1, 's': -1, 't': 'TERRAIN_GRASS_MOUNTAIN', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': 0, 's': -2, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': 1, 's': -3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 2, 'r': 2, 's': -4, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': -4, 's': 1, 't': 'TERRAIN_OCEAN', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': -3, 's': 0, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': -2, 's': -1, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': -1, 's': -2, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': 0, 's': -3, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 3, 'r': 1, 's': -4, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 4, 'r': -4, 's': 0, 't': 'TERRAIN_OCEAN', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 4, 'r': -3, 's': -1, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 4, 'r': -2, 's': -2, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 4, 'r': -1, 's': -3, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: {'q': 4, 'r': 0, 's': -4, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'NONE', 'riv': false, 'rivEdges': 0}
CityScanner: --- END CITY DATA SCAN ---`;

    // Process example data
    enhancedFileProcessing(exampleData, "Multi-City Test (Lisbona/Porto)");
}

// Add event listener for example button
document.addEventListener('DOMContentLoaded', () => {
    const btnLoadExample = document.getElementById('btnLoadExample');
    if (btnLoadExample) {
        btnLoadExample.addEventListener('click', loadExampleData);
    }
});
