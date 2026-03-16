const fs = require('fs');

// We need a dummy postMessage mock
global.self = {
    postMessage: (data) => console.log('postMessage:', data.message || data.type)
};

const optimizerCode = fs.readFileSync('viewer/optimizer.js', 'utf8');
const cityData = fs.readFileSync('city_data_extracted.txt', 'utf8');

// evaluate the optimizer code in global scope
eval(optimizerCode);

// trigger the message handler
self.onmessage({
    data: {
        message: 'START_OPTIMIZATION',
        cityData: cityData,
        userDistricts: ["Diga", "Acquedotto", "Accampamento", "Porto", "Campus", "Luogo Santo", "Piazza del Teatro", "Zona Industriale", "Hub Commerciale", "Piazza del Governo"],
        generations: 50, // use lower generations just to reach the end fast
        populationSize: 100
    }
});
