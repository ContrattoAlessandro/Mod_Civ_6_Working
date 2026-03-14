import random
import math
import copy

# --- STEP 1: STRUTTURE DATI (LA MAPPA) ---

class Esagono:
    def __init__(self, q, r, s):
        assert round(q + r + s) == 0, "Le coordinate cubiche devono sommare a 0"
        self.q = q; self.r = r; self.s = s

    def __eq__(self, other): return self.q == other.q and self.r == other.r and self.s == other.s
    def __hash__(self): return hash((self.q, self.r, self.s))

    def adiacenti(self):
        direzioni = [Esagono(1, 0, -1), Esagono(1, -1, 0), Esagono(0, -1, 1),
                     Esagono(-1, 0, 1), Esagono(-1, 1, 0), Esagono(0, 1, -1)]
        return [Esagono(self.q + d.q, self.r + d.r, self.s + d.s) for d in direzioni]
        
    def distanza_dal_centro(self):
        """Calcola la distanza in caselle dal centro (0,0,0)."""
        return max(abs(self.q), abs(self.r), abs(self.s))

class Cella:
    def __init__(self, esagono):
        self.esagono = esagono
        self.caratteristiche = set()
        self.distretto = None

# --- STEP 2: GENERATORE DI MAPPE E VINCOLI ---

class MappaCitta:
    def __init__(self, raggio_giocabile=3, espansione_visuale=1):
        # Generiamo la mappa più grande (es. raggio 4) in modo che i distretti
        # a raggio 3 possano calcolare l'adiacenza con le caselle esterne.
        self.raggio_totale = raggio_giocabile + espansione_visuale 
        self.celle = {}
        self.genera_griglia()
        self.popola_mappa_casuale()

    def genera_griglia(self):
        for q in range(-self.raggio_totale, self.raggio_totale + 1):
            for r in range(max(-self.raggio_totale, -q - self.raggio_totale), min(self.raggio_totale, -q + self.raggio_totale) + 1):
                self.celle[Esagono(q, r, -q - r)] = Cella(Esagono(q, r, -q - r))

    def popola_mappa_casuale(self):
        """Genera una mappa con elementi chiave per testare i vincoli."""
        for esagono, cella in self.celle.items():
            if esagono.q == 0 and esagono.r == 0:
                cella.distretto = "Centro Cittadino"
                continue
            
            rand = random.random()
            if rand < 0.10: cella.caratteristiche.add("Montagna")
            elif rand < 0.20: cella.caratteristiche.add("Foresta Pluviale")
            elif rand < 0.30: cella.caratteristiche.add("Bosco")
            elif rand < 0.40: cella.caratteristiche.add("Collina")
            elif rand < 0.45: cella.caratteristiche.add("Risorsa Strategica")
            elif rand < 0.50: cella.caratteristiche.add("Risorsa Cava")
            elif rand < 0.55: cella.caratteristiche.add("Fessura Geotermale")
            elif rand < 0.65:
                if esagono.q > 1: 
                    cella.caratteristiche.add("Costa")
                    if random.random() < 0.3: cella.caratteristiche.add("Risorsa Marina")
                    elif random.random() < 0.2: cella.caratteristiche.add("Barriera Corallina")

            if random.random() < 0.30 and "Costa" not in cella.caratteristiche and "Montagna" not in cella.caratteristiche:
                cella.caratteristiche.add("Fiume")

    def importa_da_stringa(self, data_str):
        """Popola la mappa da una stringa esportata dalla mod Civ 6."""
        import ast
        self.celle = {}
        self.genera_griglia()
        
        # Reset di tutte le celle
        for c in self.celle.values():
            c.caratteristiche = set()
            c.distretto = None

        linee = data_str.strip().split("\n")
        for l in linee:
            if l.startswith("{"):
                # Sostituiamo i valori Lua in Python-friendly string
                l_py = l.replace("true", "True").replace("false", "False")
                data = ast.literal_eval(l_py)
                
                pos = Esagono(data['q'], data['r'], data['s'])
                if pos in self.celle:
                    cella = self.celle[pos]
                    
                    # Mapping nomi Civ 6 -> Sim nomi
                    if data['q'] == 0 and data['r'] == 0:
                        cella.distretto = "Centro Cittadino"
                    
                    if "MOUNTAIN" in data['t']: cella.caratteristiche.add("Montagna")
                    if "HILL" in data['t']: cella.caratteristiche.add("Collina")
                    if data['riv']: cella.caratteristiche.add("Fiume")
                    
                    f = data['f']
                    if "JUNGLE" in f: cella.caratteristiche.add("Foresta Pluviale")
                    if "FOREST" in f: cella.caratteristiche.add("Bosco")
                    if "REEF" in f: cella.caratteristiche.add("Barriera Corallina")
                    if "GEOTHERMAL" in f: cella.caratteristiche.add("Fessura Geotermale")
                    if "FLOODPLAINS" in f: cella.caratteristiche.add("Pianura Alluvionale")
                    
                    res = data['res']
                    if res != "NONE":
                        # Strategiche (Danno +1 alla ZI)
                        if any(s in res for s in ["COAL", "IRON", "NITER", "ALUMINUM", "OIL", "URANIUM"]):
                            cella.caratteristiche.add("Risorsa Strategica")
                        # Lusso (Bloccano costruzione)
                        elif any(l in res for l in ["JADE", "SILK", "TEA", "WINE", "DIAMONDS", "COFFEE", "IVORY", "MARBLE", "SALT", "SPICES", "SUGAR", "COTTON", "DYES", "INCENSE", "MERCURY", "TIRTLE", "WHALE", "PEARLS", "COCOA"]):
                            cella.caratteristiche.add("Risorsa Lusso")
                        
                        # Mappatura per Bonus Adiacenza ZI (Potenziali miglioramenti)
                        if any(q in res for q in ["STONE", "MARBLE", "GYPSUM"]):
                            cella.caratteristiche.add("Potenziale Cava")
                        if any(m in res for m in ["IRON", "COAL", "NITER", "ALUMINUM", "COPPER", "URANIUM"]):
                            cella.caratteristiche.add("Potenziale Miniera")
                        if any(b in res for b in ["WHEAT", "MAIZE", "RICE", "DEER", "SHEEP", "CATTLE"]):
                            cella.caratteristiche.add("Risorsa Bonus")

                    if "COAST" in data['t']:
                        cella.caratteristiche.add("Costa")

        print(f"Mappa importata con successo ({len(self.celle)} celle).")

def verifica_vincoli(distretto, esagono, mappa):
    """Verifica se un distretto PUÒ essere legalmente piazzato in questo esagono."""
    # VINCOLO DISTANZA: Non possiamo costruire oltre il raggio di 3 caselle!
    if esagono.distanza_dal_centro() > 3:
        return False

    cella = mappa.celle.get(esagono)
    if not cella or cella.distretto is not None: return False
    
    # Non si può MAI costruire su questi elementi (in Civ 6 senza mod)
    incompatibili = {"Montagna", "Fessura Geotermale", "Risorsa Strategica", "Risorsa Lusso", "Barriera Corallina"}
    if incompatibili.intersection(cella.caratteristiche):
        return False
        
    is_costa = "Costa" in cella.caratteristiche

    # Regole Porto
    if distretto == "Porto":
        return is_costa
        
    # Tutti gli altri distretti (terra)
    if is_costa and distretto != "Porto":
        return False

    # Regole Diga (Deve stare su una Pianura Alluvionale)
    if distretto == "Diga":
        return "Pianura Alluvionale" in cella.caratteristiche

    # Regole Acquedotto (Deve toccare Centro Città AND [Fiume OR Montagna])
    if distretto == "Acquedotto":
        adiacenti = esagono.adiacenti()
        tocca_centro = any(adj.q == 0 and adj.r == 0 for adj in adiacenti)
        if not tocca_centro: return False
        
        tocca_acqua = False
        for adj in adiacenti:
            c_adj = mappa.celle.get(adj)
            if c_adj and ("Fiume" in c_adj.caratteristiche or "Montagna" in c_adj.caratteristiche):
                tocca_acqua = True
                break
        return tocca_acqua

    return True

# --- STEP 3: MOTORE DELLE REGOLE ---

def calcola_rese(mappa):
    rese = {"Scienza": 0, "Oro": 0, "Produzione": 0}
    dettagli = {}

    for esagono, cella in mappa.celle.items():
        if not cella.distretto or cella.distretto == "Centro Cittadino": continue
        
        distretto = cella.distretto
        resa_locale = 0
        celle_adiacenti = [mappa.celle[adj] for adj in cella.esagono.adiacenti() if adj in mappa.celle]
        
        num_distretti_adiacenti = sum(1 for c in celle_adiacenti if c.distretto is not None)
        ha_piazza_governo = any(c.distretto == "Piazza del Governo" for c in celle_adiacenti)
        
        bonus_distretti_generico = math.floor(num_distretti_adiacenti / 2)
        if ha_piazza_governo: bonus_distretti_generico += 1

        if distretto == "Campus":
            m = sum(1 for c in celle_adiacenti if "Montagna" in c.caratteristiche)
            b = sum(1 for c in celle_adiacenti if "Barriera Corallina" in c.caratteristiche)
            g = sum(1 for c in celle_adiacenti if "Fessura Geotermale" in c.caratteristiche)
            f = sum(1 for c in celle_adiacenti if "Foresta Pluviale" in c.caratteristiche)
            resa_locale = m + b + g + math.floor(f / 2) + bonus_distretti_generico
            rese["Scienza"] += resa_locale

        elif distretto == "Hub Commerciale":
            ha_fiume = 2 if "Fiume" in cella.caratteristiche else 0
            p = sum(2 for c in celle_adiacenti if c.distretto == "Porto")
            resa_locale = ha_fiume + p + bonus_distretti_generico
            rese["Oro"] += resa_locale

        elif distretto == "Porto":
            cc = sum(2 for c in celle_adiacenti if c.distretto == "Centro Cittadino")
            rm = sum(1 for c in celle_adiacenti if "Risorsa Marina" in c.caratteristiche)
            resa_locale = cc + rm + bonus_distretti_generico
            rese["Oro"] += resa_locale

        elif distretto == "Zona Industriale":
            ad = sum(2 for c in celle_adiacenti if c.distretto in ["Acquedotto", "Diga"])
            s = sum(1 for c in celle_adiacenti if "Risorsa Strategica" in c.caratteristiche)
            q = sum(1 for c in celle_adiacenti if "Potenziale Cava" in c.caratteristiche)
            
            # Bonus +0.5 da Miniere e Segherie (si sommano prima del floor)
            # Assumiamo Miniere su Colline o Risorse Minerarie, e Segherie su Boschi
            num_miniere = sum(1 for c in celle_adiacenti if "Collina" in c.caratteristiche or "Potenziale Miniera" in c.caratteristiche)
            num_segherie = sum(1 for c in celle_adiacenti if "Bosco" in c.caratteristiche)
            
            # In Civ 6: +2 Acq/Diga, +1 Strategica/Cava, +0.5 Miniera/Segheria
            # Nota: math.floor((m+s)/2) è la corretta implementazione del +0.5 cumulativo
            resa_locale = ad + s + q + math.floor((num_miniere + num_segherie) / 2) + bonus_distretti_generico
            rese["Produzione"] += resa_locale

    return rese

# --- STEP 4: ALGORITMO DI OTTIMIZZAZIONE (ADVANCED PARETO SEARCH) ---

def simula_layout_con_distruzione(mappa, layout):
    """Applica il layout e simula la distruzione di boschi/giungle dove costruisci."""
    caratteristiche_salvate = {}
    elementi_distruttibili = {"Bosco", "Foresta Pluviale", "Risorsa Cava"}
    
    for distretto, esagono in layout.items():
        cella = mappa.celle[esagono]
        caratteristiche_salvate[esagono] = cella.caratteristiche.copy()
        cella.caratteristiche -= elementi_distruttibili
        cella.distretto = distretto
    
    rese = calcola_rese(mappa)
    
    for esagono in layout.values():
        mappa.celle[esagono].distretto = None
        mappa.celle[esagono].caratteristiche = caratteristiche_salvate[esagono]
        
    return rese

def domina(resa_A, resa_B):
    sA, oA, pA = resa_A['Scienza'], resa_A['Oro'], resa_A['Produzione']
    sB, oB, pB = resa_B['Scienza'], resa_B['Oro'], resa_B['Produzione']
    return (sA >= sB and oA >= oB and pA >= pB) and (sA > sB or oA > oB or pA > pB)

def aggiorna_fronte_pareto(fronte_attuale, nuove_soluzioni):
    """Mantiene solo le soluzioni non dominate."""
    tutti = fronte_attuale + nuove_soluzioni
    fronte_nuovo = []
    
    for i, (lay_A, res_A) in enumerate(tutti):
        dominato = False
        for j, (lay_B, res_B) in enumerate(tutti):
            if i != j and domina(res_B, res_A):
                dominato = True
                break
        if not dominato:
            fronte_nuovo.append((lay_A, res_A))
            
    unici = { (r['Scienza'], r['Oro'], r['Produzione']): (l, r) for l, r in fronte_nuovo }
    return list(unici.values())

def genera_layout_casuale_valido(mappa, distretti):
    """Genera un layout casuale. Ignora i distretti impossibili da piazzare."""
    layout = {}
    celle_disponibili = [e for e in mappa.celle.keys() if e.distanza_dal_centro() <= 3]
    
    for distretto in distretti:
        random.shuffle(celle_disponibili)
        for esagono in celle_disponibili:
            if esagono not in layout.values() and verifica_vincoli(distretto, esagono, mappa):
                layout[distretto] = esagono
                break
        # Se il ciclo finisce e non c'è break, il distretto non viene piazzato (es. no fiumi per diga)
    return layout

def mutazione_intelligente(layout, mappa):
    """Sposta un distretto in un'altra posizione valida."""
    if not layout: return layout
    nuovo_layout = layout.copy()
    dist_da_mutare = random.choice(list(nuovo_layout.keys()))
    
    del nuovo_layout[dist_da_mutare] 
    
    celle_valide = [esag for esag in mappa.celle.keys() 
                    if esag.distanza_dal_centro() <= 3
                    and esag not in nuovo_layout.values() 
                    and verifica_vincoli(dist_da_mutare, esag, mappa)]
    
    if celle_valide:
        nuovo_layout[dist_da_mutare] = random.choice(celle_valide)
        return nuovo_layout
    return layout

# --- ESECUZIONE ---

if __name__ == "__main__":
    # =========================================================================
    # 1. COPIA E INCOLLA QUI I DATI DEL CITY SCANNER (Tra le triple virgolette)
    # =========================================================================
    city_data = """
{'q': 0, 'r': -4, 's': 4, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 1, 'r': -4, 's': 3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 2, 'r': -4, 's': 2, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 3, 'r': -4, 's': 1, 't': 'TERRAIN_DESERT_HILLS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 4, 'r': -4, 's': 0, 't': 'TERRAIN_GRASS', 'f': 'NONE', 'res': 'RESOURCE_RICE', 'riv': false}
{'q': -2, 'r': -3, 's': 5, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -1, 'r': -3, 's': 4, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 0, 'r': -3, 's': 3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_WHEAT', 'riv': false}
{'q': 1, 'r': -3, 's': 2, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 2, 'r': -3, 's': 1, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 3, 'r': -3, 's': 0, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true}
{'q': -2, 'r': -2, 's': 4, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_WHEAT', 'riv': false}
{'q': -1, 'r': -2, 's': 3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 0, 'r': -2, 's': 2, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 1, 'r': -2, 's': 1, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 2, 'r': -2, 's': 0, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 3, 'r': -2, 's': -1, 't': 'TERRAIN_GRASS_HILLS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false}
{'q': 4, 'r': -2, 's': -2, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FLOODPLAINS_GRASSLAND', 'res': 'NONE', 'riv': true}
{'q': -4, 'r': -1, 's': 5, 't': 'TERRAIN_COAST', 'f': 'FEATURE_LAKE_RETBA', 'res': 'NONE', 'riv': false}
{'q': -3, 'r': -1, 's': 4, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false}
{'q': -2, 'r': -1, 's': 3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_JADE', 'riv': false}
{'q': -1, 'r': -1, 's': 2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_JADE', 'riv': false}
{'q': 0, 'r': -1, 's': 1, 't': 'TERRAIN_DESERT', 'f': 'FEATURE_OASIS', 'res': 'NONE', 'riv': false}
{'q': 1, 'r': -1, 's': 0, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 2, 'r': -1, 's': -1, 't': 'TERRAIN_GRASS_HILLS', 'f': 'NONE', 'res': 'RESOURCE_IRON', 'riv': false}
{'q': 3, 'r': -1, 's': -2, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false}
{'q': -4, 'r': 0, 's': 4, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_WHEAT', 'riv': false}
{'q': -3, 'r': 0, 's': 3, 't': 'TERRAIN_COAST', 'f': 'FEATURE_LAKE_RETBA', 'res': 'NONE', 'riv': false}
{'q': -2, 'r': 0, 's': 2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -1, 'r': 0, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 0, 'r': 0, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 1, 'r': 0, 's': -1, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 2, 'r': 0, 's': -2, 't': 'TERRAIN_DESERT', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 3, 'r': 0, 's': -3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 4, 'r': 0, 's': -4, 't': 'TERRAIN_GRASS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false}
{'q': -5, 'r': 1, 's': 4, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -4, 'r': 1, 's': 3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_WHEAT', 'riv': false}
{'q': -3, 'r': 1, 's': 2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -2, 'r': 1, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'RESOURCE_SILK', 'riv': false}
{'q': -1, 'r': 1, 's': 0, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 0, 'r': 1, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_JADE', 'riv': false}
{'q': 1, 'r': 1, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 2, 'r': 1, 's': -3, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_MAIZE', 'riv': false}
{'q': -4, 'r': 2, 's': 2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -3, 'r': 2, 's': 1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -2, 'r': 2, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -1, 'r': 2, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 0, 'r': 2, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 1, 'r': 2, 's': -3, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'NONE', 'riv': false}
{'q': 2, 'r': 2, 's': -4, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -5, 'r': 3, 's': 2, 't': 'TERRAIN_PLAINS', 'f': 'FEATURE_FOREST', 'res': 'RESOURCE_DEER', 'riv': false}
{'q': -4, 'r': 3, 's': 1, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -3, 'r': 3, 's': 0, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -2, 'r': 3, 's': -1, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -1, 'r': 3, 's': -2, 't': 'TERRAIN_PLAINS', 'f': 'NONE', 'res': 'RESOURCE_MAIZE', 'riv': false}
{'q': 0, 'r': 3, 's': -3, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -4, 'r': 4, 's': 0, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -3, 'r': 4, 's': -1, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': -2, 'r': 4, 's': -2, 't': 'TERRAIN_PLAINS_HILLS', 'f': 'NONE', 'res': 'RESOURCE_SHEEP', 'riv': false}
{'q': -1, 'r': 4, 's': -3, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false}
{'q': 0, 'r': 4, 's': -4, 't': 'TERRAIN_COAST', 'f': 'NONE', 'res': 'NONE', 'riv': false}
    """
    # =========================================================================

    print("Inizializzazione Simulatore con nuovi dati...")
    citta = MappaCitta()
    citta.importa_da_stringa(city_data)
    
    # Ordiniamo per stringenza dei vincoli.
    distretti = ["Diga", "Acquedotto", "Porto", "Campus", "Zona Industriale", "Hub Commerciale", "Piazza del Governo"]

    GENERAZIONI = 100 
    DIMENSIONE_POPOLAZIONE = 150
    
    popolazione = []
    print("\nGenerazione della popolazione iniziale in corso...")
    
    for _ in range(DIMENSIONE_POPOLAZIONE):
        layout = genera_layout_casuale_valido(citta, distretti)
        rese = simula_layout_con_distruzione(citta, layout)
        popolazione.append((layout, rese))

    print(f"Popolazione creata. Ottimizzazione su {GENERAZIONI} generazioni...")
    archivio_pareto = aggiorna_fronte_pareto([], popolazione)

    for gen in range(GENERAZIONI):
        nuovi_candidati = []
        for layout_padre, _ in archivio_pareto:
            for _ in range(8): 
                layout_figlio = mutazione_intelligente(layout_padre, citta)
                rese_figlio = simula_layout_con_distruzione(citta, layout_figlio)
                nuovi_candidati.append((layout_figlio, rese_figlio))
                
        archivio_pareto = aggiorna_fronte_pareto(archivio_pareto, nuovi_candidati)

    print("\n--- FRONTE DI PARETO OTTIMIZZATO ---")
    print("Scienza | Oro | Produzione | Dettaglio Layout Completo")
    print("-" * 120)
    
    archivio_pareto.sort(key=lambda x: x[1]['Scienza'], reverse=True)
    
    for layout, rese in archivio_pareto:
        print(f"   {rese['Scienza']:2d}   | {rese['Oro']:2d}  |     {rese['Produzione']:2d}     | ", end="")
        
        # Stampa dinamica di tutti i distretti effettivamente piazzati in questo layout
        info = []
        for dist_nome, pos in layout.items():
            nome_corto = {
                "Hub Commerciale": "Hub", 
                "Piazza del Governo": "Gov", 
                "Zona Industriale": "ZI",
                "Acquedotto": "Acq"
            }.get(dist_nome, dist_nome)
            
            # Recuperiamo i dettagli della cella per aiutare l'utente
            c = citta.celle.get(pos)
            desc = ""
            if c:
                items = []
                if "Montagna" in c.caratteristiche: items.append("Mont")
                if "Fiume" in c.caratteristiche: items.append("Fiume")
                if "Pianura Alluvionale" in c.caratteristiche: items.append("Alluv")
                if any("Risorsa" in char for char in c.caratteristiche):
                    res_name = [char for char in c.caratteristiche if "Risorsa" in char][0]
                    items.append(res_name.replace("Risorsa ", ""))
                desc = f"[{' '.join(items)}]" if items else ""
            
            info.append(f"{nome_corto}({pos.q},{pos.r}){desc}")
            
        print(", ".join(info))
        
    print("\n[!] NOTA: La mappa è generata fino a raggio 4 per calcolare i bonus esterni. ")
    print("Se la Diga o l'Acquedotto non compaiono in riga, significa che la mappa non aveva caselle valide per ospitarli.")