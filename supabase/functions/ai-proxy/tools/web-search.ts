import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

import { getEnv } from '../auth.ts';
import { WebSearchArgsSchema } from '../schemas.ts';
import type { JsonRecord } from '../types.ts';

export async function webSearchTool(args: z.infer<typeof WebSearchArgsSchema>): Promise<JsonRecord> {
  // Provider priority:
  // 1) Brave Search (best general web coverage)
  // 2) Bing Web Search API
  // 3) Google Custom Search API
  // 4) DuckDuckGo Instant Answer (last-resort, limited)
  const braveApiKey = getEnv('BRAVE_SEARCH_API_KEY');
  if (braveApiKey && braveApiKey.trim().length > 0) {
    try {
      return await braveSearch(args, braveApiKey);
    } catch (err) {
      console.error('[webSearch] Brave failed, trying Bing/Google fallback:', err);
    }
  }

  const bingApiKey = getEnv('BING_SEARCH_API_KEY');
  if (bingApiKey && bingApiKey.trim().length > 0) {
    try {
      return await bingSearch(args, bingApiKey);
    } catch (err) {
      console.error('[webSearch] Bing failed, trying Google/DDG fallback:', err);
    }
  }

  const googleApiKey = getEnv('GOOGLE_SEARCH_API_KEY');
  const googleCseId = getEnv('GOOGLE_CSE_ID');
  if (googleApiKey && googleCseId) {
    try {
      return await googleCustomSearch(args, googleApiKey, googleCseId);
    } catch (err) {
      console.error('[webSearch] Google CSE failed, falling back to DDG:', err);
    }
  }

  try {
    return await duckDuckGoSearch(args);
  } catch (err) {
    console.error('[webSearch] DuckDuckGo fallback failed:', err);
    return {
      success: false,
      query: args.query,
      results: [],
      count: 0,
      provider: 'duckduckgo',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function filterResultsByDomains(
  results: Array<JsonRecord>,
  domains?: string[]
): Array<JsonRecord> {
  if (!domains || domains.length === 0) return results;
  const normalizedDomains = domains.map((domain) => String(domain || '').toLowerCase()).filter(Boolean);
  if (normalizedDomains.length === 0) return results;
  return results.filter((result) => {
    const urlStr = String(result.url || '').toLowerCase();
    return normalizedDomains.some((domain) => urlStr.includes(domain));
  });
}

function dedupeResults(results: Array<JsonRecord>): Array<JsonRecord> {
  const seen = new Set<string>();
  const deduped: Array<JsonRecord> = [];
  for (const result of results) {
    const url = String(result.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    deduped.push(result);
  }
  return deduped;
}

function decodeHtmlEntities(value: string): string {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : _;
    });
}

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeDuckDuckGoRedirectUrl(rawUrl: string): string {
  try {
    const resolved = new URL(rawUrl, 'https://duckduckgo.com');
    const uddg = resolved.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : resolved.toString();
  } catch {
    return rawUrl;
  }
}

export async function braveSearch(
  args: z.infer<typeof WebSearchArgsSchema>,
  apiKey: string,
): Promise<JsonRecord> {
  try {
    const params = new URLSearchParams({
      q: args.query,
      count: '5',
      text_decorations: 'false',
      search_lang: 'en',
    });
    if (args.recency === 'day') params.set('freshness', 'pd');
    else if (args.recency === 'week') params.set('freshness', 'pw');
    else if (args.recency === 'month') params.set('freshness', 'pm');

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Brave API error ${response.status}: ${errText.slice(0, 180)}`);
    }

    const data = (await response.json()) as JsonRecord;
    const webResults = Array.isArray((data as any).web?.results) ? (data as any).web.results : [];

    const results: Array<JsonRecord> = webResults.slice(0, 5).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || r.title || '',
      source: 'brave',
    }));

    const filtered = dedupeResults(filterResultsByDomains(results, args.domains));

    const infobox = (data as any).infobox?.results?.[0];
    const abstract = infobox?.long_desc || infobox?.description || undefined;

    return {
      success: true,
      query: args.query,
      results: filtered,
      count: filtered.length,
      abstract,
      provider: 'brave',
    };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function bingSearch(
  args: z.infer<typeof WebSearchArgsSchema>,
  apiKey: string,
): Promise<JsonRecord> {
  const params = new URLSearchParams({
    q: args.query,
    count: '5',
    textDecorations: 'false',
    textFormat: 'Raw',
  });

  if (args.recency === 'day') params.set('freshness', 'Day');
  else if (args.recency === 'week') params.set('freshness', 'Week');
  else if (args.recency === 'month') params.set('freshness', 'Month');

  const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Bing API error ${response.status}: ${errText.slice(0, 180)}`);
  }

  const data = (await response.json()) as JsonRecord;
  const rows = Array.isArray((data as any).webPages?.value) ? (data as any).webPages.value : [];
  const results: Array<JsonRecord> = rows.slice(0, 5).map((row: any) => ({
    title: String(row?.name || ''),
    url: String(row?.url || ''),
    snippet: String(row?.snippet || row?.name || ''),
    source: 'bing',
  }));

  const filtered = dedupeResults(filterResultsByDomains(results, args.domains));

  return {
    success: true,
    query: args.query,
    results: filtered,
    count: filtered.length,
    provider: 'bing',
  };
}

export async function googleCustomSearch(
  args: z.infer<typeof WebSearchArgsSchema>,
  apiKey: string,
  cseId: string,
): Promise<JsonRecord> {
  const params = new URLSearchParams({
    key: apiKey,
    cx: cseId,
    q: args.query,
    num: '5',
    safe: 'off',
    hl: 'en',
  });

  if (args.recency === 'day') params.set('dateRestrict', 'd1');
  else if (args.recency === 'week') params.set('dateRestrict', 'w1');
  else if (args.recency === 'month') params.set('dateRestrict', 'm1');

  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Google CSE error ${response.status}: ${errText.slice(0, 180)}`);
  }

  const data = (await response.json()) as JsonRecord;
  const items = Array.isArray((data as any).items) ? (data as any).items : [];
  const results: Array<JsonRecord> = items.slice(0, 5).map((item: any) => ({
    title: String(item?.title || ''),
    url: String(item?.link || ''),
    snippet: String(item?.snippet || item?.title || ''),
    source: 'google',
  }));

  const filtered = dedupeResults(filterResultsByDomains(results, args.domains));

  return {
    success: true,
    query: args.query,
    results: filtered,
    count: filtered.length,
    provider: 'google',
  };
}

export async function duckDuckGoSearch(args: z.infer<typeof WebSearchArgsSchema>): Promise<JsonRecord> {
  const query = encodeURIComponent(args.query);
  const url = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&no_redirect=1`;
  const response = await fetch(url);
  const data = (await response.json()) as JsonRecord;

  const results: Array<JsonRecord> = [];
  const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];

  for (const item of related) {
    if (item && typeof item === 'object') {
      const entry = item as JsonRecord;
      if (typeof entry.Text === 'string' && typeof entry.FirstURL === 'string') {
        results.push({
          title: entry.Text,
          url: entry.FirstURL,
          snippet: entry.Text,
          source: 'duckduckgo',
        });
      }
      if (Array.isArray(entry.Topics)) {
        for (const sub of entry.Topics) {
          if (sub && typeof sub === 'object') {
            const subEntry = sub as JsonRecord;
            if (typeof subEntry.Text === 'string' && typeof subEntry.FirstURL === 'string') {
              results.push({
                title: subEntry.Text,
                url: subEntry.FirstURL,
                snippet: subEntry.Text,
                source: 'duckduckgo',
              });
            }
          }
        }
      }
    }
  }

  let filtered = dedupeResults(filterResultsByDomains(results, args.domains));
  if (filtered.length === 0) {
    filtered = await duckDuckGoHtmlSearch(args);
  }

  return {
    success: true,
    query: args.query,
    results: filtered.slice(0, 5),
    count: filtered.slice(0, 5).length,
    abstract: typeof data.AbstractText === 'string' ? data.AbstractText : undefined,
    provider: 'duckduckgo',
  };
}

export async function duckDuckGoHtmlSearch(
  args: z.infer<typeof WebSearchArgsSchema>
): Promise<Array<JsonRecord>> {
  const query = encodeURIComponent(args.query);
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; DashAI/1.0; +https://edudashpro.com)',
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`DuckDuckGo HTML error ${response.status}: ${errText.slice(0, 180)}`);
  }

  const html = await response.text();
  const matches = Array.from(
    html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
  );

  const results: Array<JsonRecord> = [];
  for (const match of matches) {
    const href = decodeDuckDuckGoRedirectUrl(String(match[1] || '').trim());
    const title = stripHtmlTags(String(match[2] || ''));
    if (!href || !title) continue;
    results.push({
      title,
      url: href,
      snippet: title,
      source: 'duckduckgo_html',
    });
    if (results.length >= 5) break;
  }

  return dedupeResults(filterResultsByDomains(results, args.domains));
}
