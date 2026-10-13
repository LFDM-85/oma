// The UI shows the whole answer; the voice only reads the first sentences so
// playback starts fast and long replies never flood the TTS service.
export function spokenText(text, limit = 260) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_#>]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= limit) return plain;
  // Split only where punctuation is followed by a space: "192.168.2.1" or
  // "1.5" is not a sentence end, and no text may be skipped between sentences.
  const sentences = plain.split(/(?<=[.!?…])\s+/);
  let out = '';
  for (const s of sentences) {
    if ((out + ' ' + s).length > limit && out) break;
    out = out ? out + ' ' + s : s;
  }
  return out.trim() || plain.slice(0, limit);
}
