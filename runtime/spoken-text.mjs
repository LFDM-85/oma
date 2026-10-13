// The voice reads the whole answer; chunks are prefetched, so length no longer
// delays the start. The cap only guards against a runaway reply.
// A vault link is spoken as its note name; other links are not read aloud.
const linkName = url => url.startsWith('file:') && /\.md$/i.test(url)
  ? decodeURIComponent(url.split('/').pop()).replace(/\.md$/i, '')
  : '';
export function spokenText(text, limit = 1200) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_#>]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\(?\b(?:file|https?):\/\/[^\s)]+\)?/g, url => linkName(url.replace(/^\(|\)$/g, '')))
    .replace(/\s+([,.;:])(?=\s|$)/g, '$1')
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
