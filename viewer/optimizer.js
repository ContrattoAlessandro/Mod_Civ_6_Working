// viewer/optimizer.js (Web Worker)

// --- STEP 1: STRUTTURE DATI (LA MAPPA) ---

class Esagono {
    constructor(q, r, s) {
        if (Math.round(q + r + s) !== 0) {
            console.error("Le coordinate cubiche devono sommare a 0", q, r, s);
        }
        this.q = q;
        this.r = r;
        this.s = s;
    }

    equals(other) {
        return this.q === other.q && this.r === other.r && this.s === other.s;
    }

    hashKey() {
        return `${this.q},${this.r},${this.s}`;
    }

    adiacenti() {
        const direzioni = [
            new Esagono(1, 0, -1), new Esagono(1, -1, 0), new Esagono(0, -1, 1),
            new Esagono(-1, 0, 1), new Esagono(-1, 1, 0), new Esagono(0, 1, -1)
        ];
        return direzioni.map(d => new Esagono(this.q + d.q, this.r + d.r, this.s + d.s));
    }

    distanza_dal_centro() {
        return Math.max(Math.abs(this.q), Math.abs(this.r), Math.abs(this.s));
    }
}

class Cella {
    constructor(esagono) {
        this.esagono = esagono;
        this.caratteristiche = new Set();
        this.distretto = null;
        this.riverEdges = 0; // <-- NUOVO: Aggiungiamo la proprietà
    }
}

// --- STEP 2: GENERATORE DI MAPPE E VINCOLI ---

class MappaCitta {
    constructor(raggio_giocabile = 3, espansione_visuale = 1) {
        this.raggio_totale = raggio_giocabile + espansione_visuale;
        this.celle = new Map();
        this.genera_griglia();
    }

    genera_griglia() {
        for (let q = -this.raggio_totale; q <= this.raggio_totale; q++) {
            const r1 = Math.max(-this.raggio_totale, -q - this.raggio_totale);
            const r2 = Math.min(this.raggio_totale, -q + this.raggio_totale);
            for (let r = r1; r <= r2; r++) {
                const esagono = new Esagono(q, r, -q - r);
                this.celle.set(esagono.hashKey(), new Cella(esagono));
            }
        }
    }

    importa_da_stringa(data_str) {
        this.celle.clear();
        this.genera_griglia();

        const linee = data_str.trim().split("\n");
        let celle_importate = 0;

        for (let l of linee) {
            l = l.trim();
            if (l.startsWith("{")) {
                try {
                    let jsonStr = l.replace(/:\s*True/gi, ': true').replace(/:\s*False/gi, ': false');
                    const data = (new Function('return ' + jsonStr))();

                    if (data.q === undefined || data.r === undefined) continue;

                    const pos = new Esagono(data.q, data.r, data.s);
                    const hash = pos.hashKey();

                    if (this.celle.has(hash)) {
                        const cella = this.celle.get(hash);
                        cella.riverEdges = data.rivEdges || 0;

                        if (data.q === 0 && data.r === 0) {
                            cella.distretto = "Centro Cittadino";
                        }

                        if (data.t && data.t.includes("MOUNTAIN")) cella.caratteristiche.add("Montagna");
                        if (data.t && data.t.includes("HILL")) cella.caratteristiche.add("Collina");
                        if (data.riv) cella.caratteristiche.add("Fiume");

                        const f = data.f || "NONE";
                        if (f.includes("JUNGLE")) cella.caratteristiche.add("Foresta Pluviale");
                        if (f.includes("FOREST")) cella.caratteristiche.add("Bosco");
                        if (f.includes("REEF")) cella.caratteristiche.add("Barriera Corallina");
                        if (f.includes("GEOTHERMAL")) cella.caratteristiche.add("Fessura Geotermale");
                        if (f.includes("FLOODPLAINS")) cella.caratteristiche.add("Pianura Alluvionale");
                        if (f.includes("OASIS")) cella.caratteristiche.add("Oasi");
                        if (f.includes("LAKE") || (data.t && data.t.includes("LAKE"))) cella.caratteristiche.add("Lago");

                        if (f.startsWith("FEATURE_") && !["JUNGLE", "FOREST", "REEF", "GEOTHERMAL", "OASIS", "FLOODPLAINS", "ICE", "MARSH", "VOLCANO"].some(x => f.includes(x))) {
                            cella.caratteristiche.add("Meraviglia Naturale");
                        }

                        const res = data.res || "NONE";
                        if (res !== "NONE") {
                            const strategiche = ["COAL", "IRON", "NITER", "ALUMINUM", "OIL", "URANIUM"];
                            if (strategiche.some(s => res.includes(s))) cella.caratteristiche.add("Risorsa Strategica");

                            const lusso = ["JADE", "SILK", "TEA", "WINE", "DIAMONDS", "COFFEE", "IVORY", "MARBLE", "SALT", "SPICES", "SUGAR", "COTTON", "DYES", "INCENSE", "MERCURY", "TIRTLE", "WHALE", "PEARLS", "COCOA"];
                            if (lusso.some(l => res.includes(l))) cella.caratteristiche.add("Risorsa Lusso");

                            const potenzialeCava = ["STONE", "MARBLE", "GYPSUM"];
                            if (potenzialeCava.some(q => res.includes(q))) cella.caratteristiche.add("Potenziale Cava");

                            const potenzialeMiniera = ["IRON", "COAL", "NITER", "ALUMINUM", "COPPER", "URANIUM"];
                            if (potenzialeMiniera.some(m => res.includes(m))) cella.caratteristiche.add("Potenziale Miniera");

                            const risorsaBonus = ["WHEAT", "MAIZE", "RICE", "DEER", "SHEEP", "CATTLE"];
                            if (risorsaBonus.some(b => res.includes(b))) cella.caratteristiche.add("Risorsa Bonus");
                        }

                        if (data.t && data.t.includes("COAST")) {
                            cella.caratteristiche.add("Costa");
                        }
                        celle_importate++;
                    }
                } catch (e) {
                    console.error("Errore nel parsing della linea:", l, e);
                }
            }
        }
        console.log(`Mappa importata con successo (${celle_importate} celle modificate).`);
        if (celle_importate === 0) {
            throw new Error("Nessuna cella valida trovata nei dati forniti. Controlla il formato.");
        }
    }
}

function verifica_vincoli(distretto, esagono, mappa) {
    if (esagono.distanza_dal_centro() > 3) return false;

    const cella = mappa.celle.get(esagono.hashKey());
    if (!cella || cella.distretto !== null) return false;

    const incompatibili = ["Montagna", "Fessura Geotermale", "Risorsa Strategica", "Risorsa Lusso", "Barriera Corallina"];
    for (let f of incompatibili) {
        if (cella.caratteristiche.has(f)) return false;
    }

    const is_costa = cella.caratteristiche.has("Costa");

    if (distretto === "Porto") return is_costa;
    if (is_costa && distretto !== "Porto") return false;

    if (distretto === "Diga") {
        return cella.caratteristiche.has("Pianura Alluvionale") && cella.riverEdges >= 2;
    }

    if (distretto === "Accampamento") {
        const adiacenti = esagono.adiacenti();
        const tocca_centro = adiacenti.some(adj => adj.q === 0 && adj.r === 0);
        if (tocca_centro) return false;
    }

    if (distretto === "Acquedotto") {
        const adiacenti = esagono.adiacenti();
        const tocca_centro = adiacenti.some(adj => adj.q === 0 && adj.r === 0);
        if (!tocca_centro) return false;

        let tocca_acqua = false;
        for (let adj of adiacenti) {
            const c_adj = mappa.celle.get(adj.hashKey());
            if (c_adj && (c_adj.caratteristiche.has("Fiume") || c_adj.caratteristiche.has("Montagna") || c_adj.caratteristiche.has("Lago") || c_adj.caratteristiche.has("Oasi"))) {
                tocca_acqua = true;
                break;
            }
        }
        return tocca_acqua;
    }

    return true;
}

// --- STEP 3: MOTORE DELLE REGOLE (OTTIMIZZATO ZERO-ALLOCATION) ---

function calcola_rese_ottimizzata(mappa, layout) {
    const rese = { Scienza: 0, Oro: 0, Produzione: 0, Cultura: 0, Fede: 0 };

    // Mappa veloce per O(1) lookup dei nuovi distretti senza alterare la mappa originale
    const hash_to_distretto = new Map();
    for (let [d_nome, pos] of layout.entries()) {
        hash_to_distretto.set(pos.hashKey(), d_nome);
    }

    const elementi_distruttibili = new Set(["Bosco", "Foresta Pluviale", "Risorsa Cava"]);

    for (let [hash, cella_base] of mappa.celle.entries()) {
        const distretto_corrente = hash_to_distretto.get(hash) || cella_base.distretto;
        if (!distretto_corrente || distretto_corrente === "Centro Cittadino") continue;

        let resa_locale = 0;

        // Costruiamo le adiacenze "virtuali" valutando i nuovi distretti a runtime
        const adiacenti_virtuali = cella_base.esagono.adiacenti()
            .map(adj => {
                const adj_hash = adj.hashKey();
                const c_reale = mappa.celle.get(adj_hash);
                if (!c_reale) return null;

                const d_adj = hash_to_distretto.get(adj_hash) || c_reale.distretto;
                const is_sovrascritta = hash_to_distretto.has(adj_hash);

                return {
                    distretto: d_adj,
                    has_caratteristica: (f) => {
                        // Se c'è un distretto nuovo, copre le caratteristiche distruttibili
                        if (is_sovrascritta && elementi_distruttibili.has(f)) return false;
                        return c_reale.caratteristiche.has(f);
                    }
                };
            })
            .filter(c => c !== null);

        const num_distretti_adiacenti = adiacenti_virtuali.filter(c => c.distretto !== null).length;
        const ha_piazza_governo = adiacenti_virtuali.some(c => c.distretto === "Piazza del Governo");

        let bonus_distretti_generico = Math.floor(num_distretti_adiacenti / 2);
        if (ha_piazza_governo) bonus_distretti_generico += 1;

        if (distretto_corrente === "Campus") {
            const m = adiacenti_virtuali.filter(c => c.has_caratteristica("Montagna")).length;
            const b = adiacenti_virtuali.filter(c => c.has_caratteristica("Barriera Corallina")).length * 2;
            const g = adiacenti_virtuali.filter(c => c.has_caratteristica("Fessura Geotermale")).length * 2;
            const f = adiacenti_virtuali.filter(c => c.has_caratteristica("Foresta Pluviale")).length;
            resa_locale = m + b + g + Math.floor(f / 2) + bonus_distretti_generico;
            rese.Scienza += resa_locale;

        } else if (distretto_corrente === "Hub Commerciale") {
            const ha_fiume = cella_base.caratteristiche.has("Fiume") ? 2 : 0;
            const p = adiacenti_virtuali.filter(c => c.distretto === "Porto").length * 2;
            resa_locale = ha_fiume + p + bonus_distretti_generico;
            rese.Oro += resa_locale;

        } else if (distretto_corrente === "Porto") {
            const cc = adiacenti_virtuali.filter(c => c.distretto === "Centro Cittadino").length * 2;
            const rm = adiacenti_virtuali.filter(c => c.has_caratteristica("Risorsa Marina")).length;
            resa_locale = cc + rm + bonus_distretti_generico;
            rese.Oro += resa_locale;

        } else if (distretto_corrente === "Zona Industriale") {
            const ad = adiacenti_virtuali.filter(c => c.distretto === "Acquedotto" || c.distretto === "Diga").length * 2;
            const s = adiacenti_virtuali.filter(c => c.has_caratteristica("Risorsa Strategica") && c.distretto === null).length;
            const q = adiacenti_virtuali.filter(c => c.has_caratteristica("Potenziale Cava") && c.distretto === null).length;
            const num_miniere = adiacenti_virtuali.filter(c => (c.has_caratteristica("Collina") || c.has_caratteristica("Potenziale Miniera")) && c.distretto === null).length;
            const num_segherie = adiacenti_virtuali.filter(c => c.has_caratteristica("Bosco") && c.distretto === null).length;

            resa_locale = ad + s + q + Math.floor((num_miniere + num_segherie) / 2) + bonus_distretti_generico;
            rese.Produzione += resa_locale;

        } else if (distretto_corrente === "Piazza del Teatro") {
            resa_locale = bonus_distretti_generico;
            rese.Cultura += resa_locale;

        } else if (distretto_corrente === "Accampamento") {
            resa_locale = bonus_distretti_generico;
            rese.Produzione += resa_locale;

        } else if (distretto_corrente === "Luogo Santo") {
            const m = adiacenti_virtuali.filter(c => c.has_caratteristica("Montagna")).length;
            const mn = adiacenti_virtuali.filter(c => c.has_caratteristica("Meraviglia Naturale")).length * 2;
            const bo = adiacenti_virtuali.filter(c => c.has_caratteristica("Bosco") && c.distretto === null).length;
            resa_locale = m + mn + Math.floor(bo / 2) + bonus_distretti_generico;
            rese.Fede += resa_locale;
        }
    }

    return rese;
}


// --- STEP 4: ALGORITMO DI OTTIMIZZAZIONE ---

function domina(resa_A, resa_B) {
    const sA = resa_A.Scienza, oA = resa_A.Oro, pA = resa_A.Produzione, cA = resa_A.Cultura, fA = resa_A.Fede;
    const sB = resa_B.Scienza, oB = resa_B.Oro, pB = resa_B.Produzione, cB = resa_B.Cultura, fB = resa_B.Fede;
    return (sA >= sB && oA >= oB && pA >= pB && cA >= cB && fA >= fB) &&
        (sA > sB || oA > oB || pA > pB || cA > cB || fA > fB);
}

function aggiorna_fronte_pareto(fronte_attuale, nuove_soluzioni) {
    const unici = new Map();

    for (let sol of fronte_attuale) {
        const k = `${sol.rese.Scienza},${sol.rese.Oro},${sol.rese.Produzione},${sol.rese.Cultura},${sol.rese.Fede}`;
        unici.set(k, sol);
    }

    for (let nuova of nuove_soluzioni) {
        const k = `${nuova.rese.Scienza},${nuova.rese.Oro},${nuova.rese.Produzione},${nuova.rese.Cultura},${nuova.rese.Fede}`;
        if (unici.has(k)) continue;

        let dominata = false;
        let chiaviDaRimuovere = [];

        for (let [esistenteKey, esistente] of unici.entries()) {
            if (domina(esistente.rese, nuova.rese)) {
                dominata = true;
                break;
            }
            if (domina(nuova.rese, esistente.rese)) {
                chiaviDaRimuovere.push(esistenteKey);
            }
        }

        if (!dominata) {
            for (let key of chiaviDaRimuovere) {
                unici.delete(key);
            }
            unici.set(k, nuova);
        }
    }

    return Array.from(unici.values());
}

// Calcolo Crowding Distance per NSGA-II
function calcola_crowding_distance(fronte) {
    if (fronte.length <= 2) return;

    for (let sol of fronte) sol.distanza = 0;
    const obiettivi = ["Scienza", "Oro", "Produzione", "Cultura", "Fede"];

    for (let obj of obiettivi) {
        fronte.sort((a, b) => a.rese[obj] - b.rese[obj]);

        fronte[0].distanza = Infinity;
        fronte[fronte.length - 1].distanza = Infinity;

        const range = fronte[fronte.length - 1].rese[obj] - fronte[0].rese[obj];
        if (range === 0) continue;

        for (let i = 1; i < fronte.length - 1; i++) {
            if (fronte[i].distanza !== Infinity) {
                fronte[i].distanza += (fronte[i + 1].rese[obj] - fronte[i - 1].rese[obj]) / range;
            }
        }
    }
}

function tronca_archivio_nsga2(archivio, max_size = 100) {
    if (archivio.length <= max_size) return archivio;
    calcola_crowding_distance(archivio);
    archivio.sort((a, b) => b.distanza - a.distanza);
    return archivio.slice(0, max_size);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function genera_layout_casuale_valido(mappa, distretti) {
    const layout = new Map();
    const celle_disponibili = Array.from(mappa.celle.values())
        .map(c => c.esagono)
        .filter(e => e.distanza_dal_centro() <= 3);

    for (let distretto of distretti) {
        shuffle(celle_disponibili);
        for (let esagono of celle_disponibili) {
            let alreadyUsed = false;
            for (let usedEsag of layout.values()) {
                if (usedEsag.equals(esagono)) alreadyUsed = true;
            }
            if (!alreadyUsed && verifica_vincoli(distretto, esagono, mappa)) {
                layout.set(distretto, esagono);
                break;
            }
        }
    }
    return layout;
}

function crossover_spaziale(layout_madre, layout_padre, mappa, distretti_da_piazzare) {
    const layout_figlio = new Map();
    const posizioni_occupate = new Set();

    for (let distretto of distretti_da_piazzare) {
        const pos_A = layout_madre.get(distretto);
        const pos_B = layout_padre.get(distretto);

        if (!pos_A || !pos_B) continue;

        let scelta_primaria = Math.random() < 0.5 ? pos_A : pos_B;
        let scelta_secondaria = scelta_primaria === pos_A ? pos_B : pos_A;

        if (!posizioni_occupate.has(scelta_primaria.hashKey()) && verifica_vincoli(distretto, scelta_primaria, mappa)) {
            layout_figlio.set(distretto, scelta_primaria);
            posizioni_occupate.add(scelta_primaria.hashKey());
        }
        else if (!posizioni_occupate.has(scelta_secondaria.hashKey()) && verifica_vincoli(distretto, scelta_secondaria, mappa)) {
            layout_figlio.set(distretto, scelta_secondaria);
            posizioni_occupate.add(scelta_secondaria.hashKey());
        }
        else {
            const celle_valide = Array.from(mappa.celle.values())
                .map(c => c.esagono)
                .filter(esag => esag.distanza_dal_centro() <= 3 &&
                    !posizioni_occupate.has(esag.hashKey()) &&
                    verifica_vincoli(distretto, esag, mappa));

            if (celle_valide.length > 0) {
                const random_pos = celle_valide[Math.floor(Math.random() * celle_valide.length)];
                layout_figlio.set(distretto, random_pos);
                posizioni_occupate.add(random_pos.hashKey());
            }
        }
    }
    return layout_figlio;
}

function mutazione_intelligente(layout, mappa) {
    if (layout.size === 0) return new Map();

    const nuovo_layout = new Map(layout);
    const keys = Array.from(nuovo_layout.keys());
    const dist_da_mutare = keys[Math.floor(Math.random() * keys.length)];

    nuovo_layout.delete(dist_da_mutare);

    const celle_valide = Array.from(mappa.celle.values())
        .map(c => c.esagono)
        .filter(esag => {
            if (esag.distanza_dal_centro() > 3) return false;
            for (let usedEsag of nuovo_layout.values()) {
                if (usedEsag.equals(esag)) return false;
            }
            return verifica_vincoli(dist_da_mutare, esag, mappa);
        });

    if (celle_valide.length > 0) {
        const nuova_pos = celle_valide[Math.floor(Math.random() * celle_valide.length)];
        nuovo_layout.set(dist_da_mutare, nuova_pos);
        return nuovo_layout;
    }
    return layout;
}

// --- GESTIONE WEB WORKER ASINCRONA ---
async function runOttimizzazione(citta, distretti, generazioni, popSize) {
    self.postMessage({ type: 'PROGRESS', message: `Inizializzazione popolazione...`, percent: 0 });

    let popolazione = [];

    for (let i = 0; i < popSize; i++) {
        const layout = genera_layout_casuale_valido(citta, distretti);
        const rese = calcola_rese_ottimizzata(citta, layout);
        popolazione.push({ layout: layout, rese: rese });
    }

    let archivio_pareto = aggiorna_fronte_pareto([], popolazione);
    const MAX_ARCHIVE_SIZE = 100;
    archivio_pareto = tronca_archivio_nsga2(archivio_pareto, MAX_ARCHIVE_SIZE);

    for (let gen = 0; gen < generazioni; gen++) {
        if (gen % 10 === 0) {
            self.postMessage({ type: 'PROGRESS', message: `Generazione ${gen}/${generazioni} (Fronte: ${archivio_pareto.length} ottimi)...`, percent: 5 + (gen / generazioni) * 85 });
            await new Promise(r => setTimeout(r, 0));
        }

        let nuovi_candidati = [];

        // Fase 1: Crossover tra elementi dell'archivio Pareto
        for (let i = 0; i < popSize / 2; i++) {
            const padreA = archivio_pareto[Math.floor(Math.random() * archivio_pareto.length)];
            const padreB = archivio_pareto[Math.floor(Math.random() * archivio_pareto.length)];

            let layout_figlio = crossover_spaziale(padreA.layout, padreB.layout, citta, distretti);

            // Fase 2: Mutazione genetica (30%)
            if (Math.random() < 0.3) {
                layout_figlio = mutazione_intelligente(layout_figlio, citta);
            }

            const rese_figlio = calcola_rese_ottimizzata(citta, layout_figlio);
            nuovi_candidati.push({ layout: layout_figlio, rese: rese_figlio });
        }

        // Fase 3: Mutazioni dirette per esplorare aree isolate del fronte
        for (let padre of archivio_pareto) {
            const layout_mutato = mutazione_intelligente(padre.layout, citta);
            const rese_mutate = calcola_rese_ottimizzata(citta, layout_mutato);
            nuovi_candidati.push({ layout: layout_mutato, rese: rese_mutate });
        }

        archivio_pareto = aggiorna_fronte_pareto(archivio_pareto, nuovi_candidati);
        archivio_pareto = tronca_archivio_nsga2(archivio_pareto, MAX_ARCHIVE_SIZE);
    }

    self.postMessage({ type: 'PROGRESS', message: `Chiusura elaborazione...`, percent: 95 });
    await new Promise(r => setTimeout(r, 0));

    try {
        archivio_pareto.sort((a, b) => {
            if (a.rese.Scienza !== b.rese.Scienza) return b.rese.Scienza - a.rese.Scienza;
            if (a.rese.Produzione !== b.rese.Produzione) return b.rese.Produzione - a.rese.Produzione;
            return b.rese.Fede - a.rese.Fede;
        });

        const data = {
            celle: [],
            soluzioni: []
        };

        for (let cella of citta.celle.values()) {
            data.celle.push({
                q: cella.esagono.q, r: cella.esagono.r, s: cella.esagono.s,
                caratteristiche: Array.from(cella.caratteristiche),
                distretto_base: cella.distretto
            });
        }

        for (let i = 0; i < archivio_pareto.length; i++) {
            const item = archivio_pareto[i];
            const layout_esportabile = {};
            for (let [dist_nome, pos] of item.layout.entries()) {
                layout_esportabile[dist_nome] = { q: pos.q, r: pos.r, s: pos.s };
            }
            data.soluzioni.push({
                id: i,
                rese: item.rese,
                layout: layout_esportabile
            });
        }

        self.postMessage({ type: 'COMPLETE', data: data });
    } catch (err) {
        self.postMessage({ type: 'ERROR', message: "Errore finale: " + err.toString() });
    }
}

self.onmessage = function (e) {
    const { message, cityData, userDistricts } = e.data;

    if (message === 'START_OPTIMIZATION') {
        const { generations, populationSize } = e.data;
        try {
            const citta = new MappaCitta();
            citta.importa_da_stringa(cityData);

            const ord_priorita = ["Diga", "Acquedotto", "Accampamento", "Porto", "Campus", "Luogo Santo", "Piazza del Teatro", "Zona Industriale", "Hub Commerciale", "Piazza del Governo"];
            const distretti = ord_priorita.filter(d => userDistricts.includes(d));

            const GENERAZIONI = generations || 500;
            const DIMENSIONE_POPOLAZIONE = populationSize || 1000;

            runOttimizzazione(citta, distretti, GENERAZIONI, DIMENSIONE_POPOLAZIONE).catch(error => {
                self.postMessage({ type: 'ERROR', message: error.toString() });
            });

        } catch (error) {
            self.postMessage({ type: 'ERROR', message: error.toString() });
        }
    }
};