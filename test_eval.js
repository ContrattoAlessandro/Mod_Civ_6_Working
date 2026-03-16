const fs = require('fs');
try {
    const html = fs.readFileSync('viewer/index.html', 'utf8');
    const scriptMatch = html.match(/<script id=\"worker-script\" type=\"javascript\/worker\">([\s\S]*?)<\/script>/);
    if (!scriptMatch) {
        console.log('NO SCRIPT MATCH');
        process.exit(1);
    }
    const workerCode = scriptMatch[1];
    console.log('Worker code length:', workerCode.length);
    eval(workerCode);
    console.log('EVAL COMPILED SUCCESSFULLY');
} catch (e) {
    console.log('EVAL FAILED', e);
}
