const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

// Função de conversão
const convertMedia = (inputPath, format, ffmpegPath) => {
    return new Promise((resolve, reject) => {
        const outputPath = inputPath.replace(path.extname(inputPath), `.${format}`);

        let command = ffmpeg(inputPath);
        if (ffmpegPath !== 'ffmpeg') {
            command.setFfmpegPath(ffmpegPath);
        }

        // Configurações básicas de conversão
        if (format === 'mp3') {
            command.toFormat('mp3');
            command.audioCodec('libmp3lame');
        } else if (format === 'ogg') {
            command.toFormat('ogg'); // OGG Opus para áudio do WhatsApp
            command.audioCodec('libopus');
        } else if (format === 'wav') {
            command.toFormat('wav');
        } else if (format === 'mp4') {
            command.toFormat('mp4');
        }

        command.on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .save(outputPath);
    });
};

module.exports = { convertMedia };
