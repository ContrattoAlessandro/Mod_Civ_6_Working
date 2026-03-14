import os

# Cartella dei log di Civ 6
LOG_DIR = r"C:\Users\alexa\AppData\Local\Firaxis Games\Sid Meier's Civilization VI\Logs"
# File dove verranno salvati i dati estratti
OUTPUT_FILE = "city_data_extracted.txt"

def estrai_dati():
    # 1. Trova il file corretto (può essere .log o .txt)
    possibili_nomi = ["Lua.log", "Lua.txt", "Lua"]
    log_path = None
    
    print(f"Ricerca del file log in: {LOG_DIR}")
    for nome in possibili_nomi:
        percorso = os.path.join(LOG_DIR, nome)
        if os.path.exists(percorso):
            log_path = percorso
            print(f"File trovato: {nome} ({os.path.getsize(percorso)} bytes)")
            break
    
    if not log_path:
        print("ERRORE: Non trovo il file Lua (nè .log nè .txt) nella cartella dei log.")
        print("Controlla che il percorso sia corretto e che Civ 6 sia stato aperto.")
        return

    # 2. Prova a leggere con diverse codifiche
    codifiche = ['utf-16le', 'utf-8', 'latin-1']
    lines = []
    
    for codifica in codifiche:
        try:
            with open(log_path, 'r', encoding=codifica, errors='ignore') as f:
                content = f.read()
                if "---" in content: # Controllo rapido se la codifica ha senso
                    lines = content.splitlines()
                    print(f"File letto con successo usando la codifica: {codifica}")
                    break
        except Exception as e:
            continue

    if not lines:
        print("ERRORE: Impossibile leggere il contenuto del file log.")
        return

    # 3. Estrazione dati (dall'ultimo verso il primo)
    dati_estratti = []
    regola_inizio = "--- START CITY DATA SCAN ---"
    regola_fine = "--- END CITY DATA SCAN ---"
    
    trovato_fine = False
    
    for line in reversed(lines):
        if regola_fine in line:
            trovato_fine = True
            continue
        
        if trovato_fine:
            if regola_inizio in line:
                break # Fine scansione ultima città
            
            # Pulizia e cattura dati esagono
            if "{" in line and "}" in line:
                parti = line.split("CityScanner: ")
                riga_dati = parti[1].strip() if len(parti) > 1 else line.strip()
                if riga_dati.startswith("{"):
                    dati_estratti.append(riga_dati)

    # 4. Salvataggio
    if dati_estratti:
        dati_estratti.reverse() # Ripristina l'ordine
        try:
            with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                f.write("\n".join(dati_estratti))
            print(f"\nCOMPLETATO: {len(dati_estratti)} caselle estratte!")
            print(f"Percorso: {os.path.abspath(OUTPUT_FILE)}")
        except Exception as e:
            print(f"Errore nel salvataggio del file: {e}")
    else:
        print("\nATTENZIONE: Nessun dato di scansione trovato nel file.")
        print("Suggerimento: In gioco, seleziona una città (o clicca di nuovo su quella già selezionata) e poi riesegui questo script.")

if __name__ == "__main__":
    estrai_dati()
