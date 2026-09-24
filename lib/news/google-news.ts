// Google News RSS search (India / English edition). No API key and no scraping of Google News HTML.
// Any failure (timeout, bad XML, no items) returns an empty result: news is optional enrichment and must
// never stop a draft from being produced.
import { XMLParser } from 'fast-xml-parser';
import type { NewsItem } from '../types';

export const GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search';

export function buildGoogleNewsUrl(query: string): string {
  const params = new URLSearchParams({ q: query, hl: 'en-IN', gl: 'IN', ceid: 'IN:en' });
  return `${GOOGLE_NEWS_RSS}?${params.toString()}`;
}

export type NewsSearchResult = { ok: true; items: NewsItem[] } | { ok: false; reason: string; items: [] };

export interface NewsSearchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxItems?: number;
  retries?: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => name === 'item',
});

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) return text((value as Record<string, unknown>)['#text']);
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function toIso(date: string | null): string | null {
  if (!date) return null;
  const t = Date.parse(date);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export class RssFormatError extends Error {
  constructor(detail: string) {
    super(`Invalid RSS: ${detail}`);
    this.name = 'RssFormatError';
  }
}

/** Parses Google News RSS XML. Throws RssFormatError on malformed XML or a document that isn't RSS. */
export function parseGoogleNewsRss(xml: string, maxItems = 8): NewsItem[] {
  if (!/<rss[\s>]/i.test(xml)) throw new RssFormatError('response is not an RSS document');
  let doc: { rss?: { channel?: { item?: unknown[] } } };
  try {
    doc = parser.parse(xml, true) as typeof doc; // `true` = validate the XML first
  } catch (error) {
    throw new RssFormatError(error instanceof Error ? error.message : 'malformed XML');
  }
  const rawItems = doc.rss?.channel?.item;
  if (!Array.isArray(rawItems)) return [];

  const items: NewsItem[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const source = text(r.source);
    let title = text(r.title);
    const link = text(r.link);
    if (!title || !link || !/^https?:\/\//.test(link)) continue; // unusable without a headline and a link
    // Google appends " - Publication" to each headline; keep the headline itself.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();

    // The description is usually just the headline and publication again; keep it only if it adds text.
    let snippet = text(r.description);
    if (snippet) snippet = stripHtml(snippet);
    const redundant = snippet && title && snippet.replace(source ?? '', '').trim().replace(/\s+/g, ' ') === title.replace(/\s+/g, ' ');
    if (!snippet || redundant) snippet = null;

    items.push({ title, source, publishedAt: toIso(text(r.pubDate)), link, snippet: snippet ? snippet.slice(0, 400) : null });
    if (items.length >= maxItems) break;
  }
  return items;
}

export async function searchGoogleNews(query: string, options: NewsSearchOptions = {}): Promise<NewsSearchResult> {
  const { fetchImpl = fetch, timeoutMs = 5000, maxItems = 8, retries = 1 } = options;
  let reason = 'unknown';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(buildGoogleNewsUrl(query), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' },
      });
      if (!response.ok) {
        reason = `HTTP ${response.status}`;
        if (response.status >= 500 || response.status === 429) continue; // transient: one retry
        break;
      }
      const items = parseGoogleNewsRss(await response.text(), maxItems);
      return items.length ? { ok: true, items } : { ok: false, reason: 'no items', items: [] };
    } catch (error) {
      reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (error instanceof RssFormatError) break; // malformed content won't fix itself on retry
    }
  }
  return { ok: false, reason, items: [] };
}

/** Keeps only dated items from the last `maxAgeDays` days. Undated items can't be called current. */
export function recentItems(items: NewsItem[], maxAgeDays: number, now: Date = new Date()): NewsItem[] {
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  return items.filter((i) => i.publishedAt !== null && Date.parse(i.publishedAt) >= cutoff && Date.parse(i.publishedAt) <= now.getTime() + 36e5);
}
