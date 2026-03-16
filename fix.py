import os

# Read index.html
with open('viewer/index.html', 'r', encoding='utf-8') as f:
    index_html = f.read()

# Read optimizer.js
with open('viewer/optimizer.js', 'r', encoding='utf-8') as f:
    optimizer_js = f.read()

# Read script.js
with open('viewer/script.js', 'r', encoding='utf-8') as f:
    script_js = f.read()

# Insert worker script tag
worker_script_tag = f'\n    <script id="worker-script" type="javascript/worker">\n{optimizer_js}\n    </script>\n'
index_html = index_html.replace('<!-- Caricamento dei dati esportati da simulatore.py -->', worker_script_tag + '    <!-- Caricamento dei dati esportati da simulatore.py -->')

# Update script.js
new_worker_call = """const workerCode = document.getElementById('worker-script').textContent;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    optimizerWorker = new Worker(URL.createObjectURL(blob));"""
script_js = script_js.replace("optimizerWorker = new Worker('optimizer.js');", new_worker_call)

# Write back
with open('viewer/index.html', 'w', encoding='utf-8') as f:
    f.write(index_html)

with open('viewer/script.js', 'w', encoding='utf-8') as f:
    f.write(script_js)

print("Done.")
