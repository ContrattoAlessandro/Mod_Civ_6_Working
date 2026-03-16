const fs = require('fs');
let indexHtml = fs.readFileSync('viewer/index.html', 'utf8');

const sIdx = indexHtml.indexOf('<script id="worker-script" type="javascript/worker">');
const eIdx = indexHtml.indexOf('</script>', sIdx);

let workerCode = indexHtml.substring(sIdx + 52, eIdx);
workerCode = workerCode.replace('self.onmessage = function(e) {', 'function runWorker(e) {');

eval(workerCode);

const cityData = fs.readFileSync('city_data_extracted.txt', 'utf8');
const userDistricts = ['Diga', 'Acquedotto', 'Accampamento', 'Porto', 'Campus', 'Luogo Santo', 'Piazza del Teatro', 'Zona Industriale', 'Hub Commerciale', 'Piazza del Governo'];

global.self = {
    postMessage: function (msg) {
        if (msg.type === 'PROGRESS') {
            if (msg.percent >= 90) console.log(msg.type, msg.message);
        } else {
            console.log(msg.type, msg.message || typeof msg.data);
        }
    }
};

console.log('Starting optimization test...');
console.time('runWorker');
try {
    runWorker({
        data: {
            message: 'START_OPTIMIZATION',
            cityData: cityData,
            userDistricts: userDistricts,
            generations: 500,
            populationSize: 1000
        }
    });
} catch (e) {
    console.error('Error in runWorker:', e);
}
console.timeEnd('runWorker');
