const https = require('https');
const fs = require('fs');

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

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            const response = JSON.parse(data);
            const verified = response.voices.map(v => ({ name: v.name, id: v.voice_id }));
            fs.writeFileSync('ids_confirmados.json', JSON.stringify(verified, null, 2));
        }
    });
});

req.end();
