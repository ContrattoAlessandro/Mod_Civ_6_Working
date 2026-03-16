import os
import time
import threading
import http.server
import socketserver
import webbrowser
import sys
from estrattore_log import estrai_dati

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(os.getenv('LOCALAPPDATA', ''), r"Firaxis Games\Sid Meier's Civilization VI\Logs")

def find_log_file():
    possibili_nomi = ["Lua.log", "Lua.txt", "Lua"]
    for nome in possibili_nomi:
        percorso = os.path.join(LOG_DIR, nome)
        if os.path.exists(percorso):
            return percorso
    return None

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Disable caching to ensure the browser always gets the latest data
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def watch_log():
    log_file = find_log_file()
    if not log_file:
        print(f"[-] Nessun file di log trovato in {LOG_DIR}. Il watcher è in pausa.")
        
    last_mtime = 0
    if log_file and os.path.exists(log_file):
        last_mtime = os.path.getmtime(log_file)
        print(f"[*] Monitoraggio attivo su: {log_file}")
        
    while True:
        time.sleep(2)
        if not log_file:
            log_file = find_log_file()
            if log_file:
                last_mtime = os.path.getmtime(log_file)
                print(f"[*] File di log trovato. Monitoraggio attivo su: {log_file}")
                
        if log_file and os.path.exists(log_file):
            current_mtime = os.path.getmtime(log_file)
            if current_mtime != last_mtime:
                print("\n[+] Rilevata modifica nei log! Estrazione dati in corso...")
                # Una breve pausa per assicurarsi che Civ 6 abbia finito di scrivere
                time.sleep(0.5) 
                estrai_dati()
                last_mtime = os.path.getmtime(log_file) # Rileggi l'mtime DOPO aver letto il file per evitare falsi positivi

def start_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"\n[*] Server web avviato su http://localhost:{PORT}")
        print("[*] Premi Ctrl+C per uscire.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nChiusura del server...")
            sys.exit(0)

if __name__ == "__main__":
    print("====================================")
    print("  Civ 6 Optimizer - Unified Launcher")
    print("====================================\n")
    
    # Estrazione iniziale (per sicurezza)
    print("[*] Eseguo un'estrazione iniziale...")
    estrai_dati()
    
    # Thread per il monitoraggio dei log
    watcher_thread = threading.Thread(target=watch_log, daemon=True)
    watcher_thread.start()
    
    # Apertura browser
    url = f"http://localhost:{PORT}/viewer/index.html"
    print(f"[*] Avvio del browser in corso...")
    
    # Thread per ritardare l'apertura del browser di un secondo e permettere al server di avviarsi
    def open_browser():
        time.sleep(1)
        webbrowser.open(url)
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Avvio HTTP server
    start_server()
