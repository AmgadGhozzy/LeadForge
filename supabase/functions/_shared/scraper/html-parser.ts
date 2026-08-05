// ──────────────────────────────────────────────
// HTML Parser — Regex-based (no cheerio)
// ──────────────────────────────────────────────

export class HtmlParser {
  
  static async parse(html: string, url: string, pageType: any, statusCode: number, contentType: string | null) {
    
    // Extract metadata using regex
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null;
    const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]?.trim() || null;
    const language = html.match(/<html[^>]*lang=["']([^"']*)["']/i)?.[1]?.trim() || null;

    // Remove noise tags to get clean text for Gemini
    let cleanHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '');
    
    // Strip remaining HTML tags and normalize whitespace
    const rawText = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = rawText.split(' ').filter(w => w.length > 0).length;
    
    // Hash the raw text for change detection
    const messageBuffer = new TextEncoder().encode(rawText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', messageBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      metadata: {
        url,
        pageType,
        title,
        description,
        language,
        statusCode,
        contentType,
        wordCount,
        contentHash,
      },
      rawText,
      html, // Original HTML is still needed by detectors
    };
  }
}
