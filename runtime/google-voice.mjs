import https from 'node:https';
import {spawn} from 'node:child_process';

/**
 * Splits text into natural sentence or phrase chunks within character limits.
 * Google Translate TTS allows up to ~200 characters per request.
 */
export function splitTextIntoChunks(text, maxLen = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  // Split on strong sentence boundaries first
  const sentencePattern = /([^.?!;:\n]+[.?!;:\n]*)/g;
  const rawParts = clean.match(sentencePattern) || [clean];
  const chunks = [];
  let current = '';

  for (const part of rawParts) {
    if ((current + part).length <= maxLen) {
      current += part;
    } else {
      // If current has content, push it
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      // If a single part exceeds maxLen, split on commas or spaces
      if (part.length > maxLen) {
        const commaParts = part.split(/,\s*/);
        for (const cp of commaParts) {
          if ((current + (current ? ', ' : '') + cp).length <= maxLen) {
            current += (current ? ', ' : '') + cp;
          } else {
            if (current.trim()) chunks.push(current.trim());
            current = cp;
          }
        }
      } else {
        current = part;
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Fetches an MP3 chunk from Google TTS and streams decoded s16le 24kHz PCM.
 */
function fetchAndDecodeChunk(chunk, language = 'pt-PT', {onPcmChunk, isCurrent, abortSignal}) {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted || (isCurrent && !isCurrent())) {
      return resolve(0);
    }

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(language)}&q=${encodeURIComponent(chunk)}`;
    let bytesReceived = 0;
    let ffmpegChild = null;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      timeout: 10000
    }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Google TTS HTTP error: ${res.statusCode}`));
      }

      if (abortSignal?.aborted || (isCurrent && !isCurrent())) {
        res.destroy();
        return resolve(0);
      }

      ffmpegChild = spawn('ffmpeg', [
        '-v', 'error',
        '-i', 'pipe:0',
        '-f', 's16le',
        '-ar', '24000',
        '-ac', '1',
        'pipe:1'
      ], {
        stdio: ['pipe', 'pipe', 'ignore']
      });

      res.pipe(ffmpegChild.stdin);

      ffmpegChild.stdout.on('data', pcm => {
        if (abortSignal?.aborted || (isCurrent && !isCurrent())) {
          ffmpegChild?.kill('SIGKILL');
          return;
        }
        bytesReceived += pcm.length;
        if (onPcmChunk) onPcmChunk(pcm);
      });

      ffmpegChild.on('close', code => {
        if (code === 0 || bytesReceived > 0) {
          resolve(bytesReceived);
        } else {
          reject(new Error(`FFmpeg falhou ao descodificar áudio Google (código ${code}).`));
        }
      });

      ffmpegChild.on('error', err => {
        reject(err);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo limite ao contactar Google TTS.'));
    });

    const cleanup = () => {
      try { req.destroy(); } catch {}
      try { ffmpegChild?.kill('SIGKILL'); } catch {}
    };

    abortSignal?.addEventListener('abort', cleanup, {once: true});
  });
}

/**
 * Synthesizes text with Google Voice and streams PCM chunks in real-time.
 */
export async function streamGoogleSpeech(text, {
  language = 'en-US',
  onPcmChunk,
  isCurrent = () => true,
  abortSignal
} = {}) {
  const chunks = splitTextIntoChunks(text);
  if (!chunks.length) return 0;

  let totalBytes = 0;
  for (const chunk of chunks) {
    if (abortSignal?.aborted || !isCurrent()) break;
    const chunkBytes = await fetchAndDecodeChunk(chunk, language, {
      onPcmChunk,
      isCurrent,
      abortSignal
    });
    totalBytes += chunkBytes;
  }

  return totalBytes;
}
