const https = require('https');

const API_KEY = 'sk_6dfa84b1616a8ddf625dc489cb11ae2802048db501cebacf';

const options = {
    method: 'GET',
    hostname: 'api.elevenlabs.io',
    path: '/v1/voices',
    headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json'
    }
};

console.log('Fetching voices...');

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            const response = JSON.parse(data);
            console.log('\n--- VÁLIDAS ---');
            response.voices.forEach(v => {
                console.log(`VOICE_DATA: ${v.name} ::: ${v.voice_id}`);
            });
        } else {
            console.error('Error fetching voices:', res.statusCode, data);
        }
    });
});

req.end();
