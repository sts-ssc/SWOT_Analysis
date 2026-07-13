// pages/api/scrape.js – Website-Inhalt für KI-Analyse
// Versucht mehrere Seiten; gibt chars-Count zurück damit Frontend informiert ist
export const config = { runtime: 'edge' };

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function tryFetch(url, timeout = 5000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return '';
    const html = await res.text();
    return stripHtml(html);
  } catch(e) { return ''; }
}

export default async function handler(req) {
  const { url } = await req.json();
  
  // Basis-URL normalisieren
  const base = url.startsWith('http') ? url : 'https://' + url;
  const origin = new URL(base).origin;
  
  // Versuche Hauptseite + typische Unterseiten
  const paths = ['', '/about', '/en', '/de', '/en/about', '/de/ueber-uns', '/company', '/unternehmen'];
  let bestText = '';
  
  for (const path of paths) {
    const text = await tryFetch(origin + path);
    if (text.length > bestText.length) bestText = text;
    if (bestText.length > 1500) break; // Genug Content gefunden
  }
  
  const extracted = bestText.slice(0, 2500);
  
  return new Response(JSON.stringify({ 
    text: extracted, 
    chars: extracted.length,
    success: extracted.length > 100,
    note: extracted.length < 100 
      ? 'Website vermutlich JavaScript-gerendert (SPA) – KI nutzt Trainingswissen'
      : `${extracted.length} Zeichen extrahiert`
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
