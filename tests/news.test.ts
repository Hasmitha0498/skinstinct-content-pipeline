// Google News RSS: URL building, parsing and every failure mode falling back to "no news".
import { describe, expect, it, vi } from 'vitest';
import { buildGoogleNewsUrl, parseGoogleNewsRss, recentItems, searchGoogleNews } from '@/lib/news/google-news';

const RSS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>"cosmetic preservative" - Google News</title>
<item>
  <title>CDSCO flags cosmetic batches over preservative levels - The Hindu</title>
  <link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link>
  <guid isPermaLink="false">CBMiAAA</guid>
  <pubDate>Mon, 21 Sep 2026 07:15:00 GMT</pubDate>
  <description>&lt;a href="https://news.google.com/rss/articles/CBMiAAA?oc=5" target="_blank"&gt;CDSCO flags cosmetic batches over preservative levels&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;The Hindu&lt;/font&gt;</description>
  <source url="https://www.thehindu.com">The Hindu</source>
</item>
<item>
  <title>Skincare brands &amp; the humidity problem</title>
  <link>https://news.google.com/rss/articles/CBMiBBB</link>
  <description>Brands reformulate for Indian summers as returns climb.</description>
</item>
<item><title>No link item</title></item>
</channel></rss>`;

const response = (body: string, status = 200) => new Response(body, { status });

describe('Google News RSS', () => {
  it('builds an encoded India/English search URL', () => {
    expect(buildGoogleNewsUrl('pH & preservative "blend"')).toBe(
      'https://news.google.com/rss/search?q=pH+%26+preservative+%22blend%22&hl=en-IN&gl=IN&ceid=IN%3Aen',
    );
  });

  it('parses items, keeps only real fields and leaves missing ones null', () => {
    const items = parseGoogleNewsRss(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'CDSCO flags cosmetic batches over preservative levels',
      source: 'The Hindu',
      publishedAt: '2026-09-21T07:15:00.000Z',
      link: 'https://news.google.com/rss/articles/CBMiAAA?oc=5',
      snippet: null, // Google's description only repeated the headline and source
    });
    expect(items[1]).toEqual({
      title: 'Skincare brands & the humidity problem',
      source: null,
      publishedAt: null,
      link: 'https://news.google.com/rss/articles/CBMiBBB',
      snippet: 'Brands reformulate for Indian summers as returns climb.',
    });
  });

  it('keeps only dated, recent items', () => {
    const items = parseGoogleNewsRss(RSS);
    expect(recentItems(items, 30, new Date('2026-09-24T00:00:00Z'))).toHaveLength(1);
    expect(recentItems(items, 1, new Date('2026-09-24T00:00:00Z'))).toHaveLength(0);
  });

  it('returns ok with items on success', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response(RSS));
    const result = await searchGoogleNews('cosmetic preservative', { fetchImpl });
    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls[0]![0]).toContain('news.google.com/rss/search?q=cosmetic+preservative');
  });

  it('no items -> not ok, no throw', async () => {
    const result = await searchGoogleNews('q', { fetchImpl: async () => response('<rss><channel><title>x</title></channel></rss>') });
    expect(result).toEqual({ ok: false, reason: 'no items', items: [] });
  });

  it('malformed XML -> not ok, no throw, no retry', async () => {
    const fetchImpl = vi.fn(async () => response('<rss><channel><item><title>broken</item></rss'));
    const result = await searchGoogleNews('q', { fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const html = await searchGoogleNews('q', { fetchImpl: async () => response('<html>captcha</html>') });
    expect(html.ok).toBe(false);
  });

  it('timeout / network failure -> one retry, then not ok', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    });
    const result = await searchGoogleNews('q', { fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('HTTP 503 is retried once; HTTP 404 is not', async () => {
    const f503 = vi.fn(async () => response('down', 503));
    expect((await searchGoogleNews('q', { fetchImpl: f503 })).ok).toBe(false);
    expect(f503).toHaveBeenCalledTimes(2);
    const f404 = vi.fn(async () => response('nope', 404));
    await searchGoogleNews('q', { fetchImpl: f404 });
    expect(f404).toHaveBeenCalledOnce();
  });
});
