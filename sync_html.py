import re

file_path = r'c:\Users\Alessandro\Desktop\mod_Civ_6\viewer\index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

with open(r'c:\Users\Alessandro\Desktop\mod_Civ_6\viewer\optimizer.js', 'r', encoding='utf-8') as f:
    js_code = f.read()

pattern = re.compile(r'<script id="worker-script" type="javascript/worker">.*?</script>', re.DOTALL)
new_script_tag = f'<script id="worker-script" type="javascript/worker">\n{js_code}\n    </script>'

# It should replace exactly the single instance
match = pattern.search(html)
if match:
    clean_html = html[:match.start()] + new_script_tag + html[match.end():]
else:
    print("Failed to find worker script tag.")
    exit(1)

with open(file_path, 'w', encoding='utf-8') as f:
     f.write(clean_html)

print("Synced optimizer.js to index.html successfully.")
