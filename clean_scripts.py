import re

def clean_html():
    file_path = r'c:\Users\Alessandro\Desktop\mod_Civ_6\viewer\index.html'
    with open(file_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Find all blocks of <script id="worker-script" type="javascript/worker"> ... </script>
    pattern = re.compile(r'<script id="worker-script" type="javascript/worker">.*?</script>', re.DOTALL)
    matches = pattern.findall(html)

    if matches:
        print(f"Found {len(matches)} worker scripts. Keeping the last one.")
        latest_script = matches[-1]
        
        # remove all copies from the html
        clean_html = pattern.sub('', html)
        
        # Clean up excessive blank lines left by deletion
        clean_html = re.sub(r'\n\s*\n\s*\n', '\n\n', clean_html)
        
        # Find where to reinsert
        insertion_point = '<!-- Caricamento dei dati esportati da simulatore.py -->'
        if insertion_point in clean_html:
            clean_html = clean_html.replace(insertion_point, f'{latest_script}\n    {insertion_point}')
        else:
            clean_html = clean_html.replace('</body>', f'{latest_script}\n</body>')

        with open(file_path, 'w', encoding='utf-8') as f:
             f.write(clean_html)
             
        # Extract the JS content from the last script tag to write to optimizer.js
        # Note: the match contains the opening and closing tags.
        js_code = latest_script.split('>', 1)[1].rsplit('<', 1)[0]
        
        with open(r'c:\Users\Alessandro\Desktop\mod_Civ_6\viewer\optimizer.js', 'w', encoding='utf-8') as f:
             f.write(js_code.strip() + '\n')
             
        print('Cleaned up index.html and synced optimizer.js')
    else:
        print("No worker scripts found in index.html")

if __name__ == "__main__":
    clean_html()
