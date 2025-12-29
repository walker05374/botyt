const https = require('https');
const fs = require('fs');

const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel
const API_KEY = 'sk_6dfa84b1616a8ddf625dc489cb11ae2802048db501cebacf';

async function downloadElevenLabsAudio(text, voiceId, outputPath) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            hostname: 'api.elevenlabs.io',
            path: `/v1/text-to-speech/${voiceId}`,
            headers: {
                'xi-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        };

        console.log(`Requesting ElevenLabs: https://${options.hostname}${options.path}`);

        const req = https.request(options, (res) => {
            console.log('Status Code:', res.statusCode);
            console.log('Headers:', res.headers);

            if (res.statusCode !== 200) {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    console.log('Error Body:', data);
                    return reject(new Error(`ElevenLabs API Error: ${res.statusCode}`));
                });
                return;
            }

            const fileStream = fs.createWriteStream(outputPath);
            res.pipe(fileStream);

            fileStream.on('finish', () => resolve(outputPath));
            fileStream.on('error', reject);
        });

        req.on('error', reject);

        req.write(JSON.stringify({
            text: text,
            model_id: 'eleven_multilingual_v2',
            output_format: 'mp3_44100_128'
        }));

        req.end();
    });
}

(async () => {
    try {
        console.log('Testing TTS...');
        await downloadElevenLabsAudio('Teste de áudio', VOICE_ID, 'test_audio.mp3');
        console.log('Success! Saved to test_audio.mp3');
    } catch (e) {
        console.error('Failed:', e.message);
    }
})();
