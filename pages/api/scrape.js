// pages/api/scrape.js – Website-Inhalt für KI-Analyse abrufen
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { url } = await req.json();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SWOT-Analyser/1.0)' },
      signal: AbortSignal.timeout(7000),
    });
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500);
    return new Response(JSON.stringify({ text, success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch(e) {
    return new Response(JSON.stringify({ text: '', success: false, error: e.message }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
