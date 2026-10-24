import { createHash } from 'node:crypto';
import { LOCALITIES } from '../../src/locations.js';
import type { Listing } from '../types.js';
import type { SearchProvider } from './serpapi.js';

export type ExternalPropertyResult = {
  id: string; kind: 'external'; classification: 'listing_candidate' | 'locality_information';
  sourceType: 'external_listing' | 'search_discovery'; sourceName: string;
  title: string; url: string; domain: string; snippet: string;
  price?: number; area?: { value: number; unit: string; display: string }; areaCent?: number;
  locality?: string; publishedAt?: string;
  query: string; retrievedAt: string; provenance: 'serpapi_search_result';
  missingFields: string[]; inferredFields: string[];
};
export type SearchSummary = { results: ExternalPropertyResult[]; queries: string[]; completed: number; failed: number; providerError?: string };

const DEFAULT_DOMAINS = ['olx.in', '99acres.com', 'magicbricks.com', 'housing.com'];
export function buildPropertyQueries(q: string, locality: string | undefined, domains: string[]) {
  const place = [locality, 'Kochi Kerala', q].filter(Boolean).join(' ');
  const topic = `${place} land plot for sale`;
  const preferred = domains.length ? domains : DEFAULT_DOMAINS;
  const first = preferred.slice(0, 2).map((domain) => `site:${domain}`).join(' OR ');
  const second = preferred.slice(2, 4).map((domain) => `site:${domain}`).join(' OR ');
  return [
    `${first} ${topic}`,
    second ? `${second} ${topic}` : `${place} residential land property listing`,
    `${topic} property listing` ,
  ];
}

function canonicalUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid|fbclid|ref|source)/i.test(key)) url.searchParams.delete(key);
    return url.href.replace(/\/$/, '');
  } catch { return undefined; }
}
function supportedPrice(text: string): number | undefined {
  const match = text.match(/(?:₹|INR\s?|Rs\.?\s?)\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/i);
  if (!match) return undefined;
  const amount = Number(match[1]?.replace(/,/g, ''));
  const unit = match[2]?.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const price = amount * (unit === 'crore' || unit === 'cr' ? 10_000_000 : unit === 'lakh' || unit === 'lac' || unit === 'l' ? 100_000 : 1);
  return price > 0 && price <= 10_000_000_000 ? Math.round(price) : undefined;
}
function supportedArea(text: string): ExternalPropertyResult['area'] {
  const match = text.match(/\b(\d[\d,.]*(?:\.\d+)?)\s*(cents?|acres?|sq\.?\s?ft|square feet|sq\.?\s?yd|square yards|sq\.?\s?m(?:et(?:er|re)s?)?)\b/i);
  if (!match) return undefined;
  const value = Number(match[1]?.replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return undefined;
  const rawUnit = match[2]!.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const unit = rawUnit.startsWith('cent') ? 'cents' : rawUnit.startsWith('acre') ? 'acres' : rawUnit.startsWith('sq yd') || rawUnit.startsWith('square yard') ? 'sq yd' : rawUnit.startsWith('sq m') || rawUnit.startsWith('square m') ? 'sq m' : 'sq ft';
  return { value, unit, display: `${value} ${unit}` };
}
function supportedLocality(text: string): string | undefined {
  const lowered = text.toLowerCase();
  return LOCALITIES.find(({ name }) => lowered.includes(name.toLowerCase()))?.name;
}
function classify(title: string, snippet: string, url: string): ExternalPropertyResult['classification'] {
  return /plot|land|property|real estate|for sale|residential|cent|acre|listing|buy\//i.test(`${title} ${snippet} ${url}`) ? 'listing_candidate' : 'locality_information';
}
function sourceName(domain: string) {
  const known: Record<string, string> = {
    'olx.in': 'OLX', '99acres.com': '99acres', 'magicbricks.com': 'Magicbricks',
    'housing.com': 'Housing.com', 'nobroker.in': 'NoBroker', 'makaan.com': 'Makaan',
  };
  return Object.entries(known).find(([host]) => domain === host || domain.endsWith(`.${host}`))?.[1] || domain;
}
function individualListingUrl(url: URL, domain: string) {
  const path = url.pathname.toLowerCase();
  if (/\/(search|results|buy|sale|locality|city|property-rates)(\/|$)/.test(path) || /[?&](q|query|locality|city)=/i.test(url.search)) return false;
  if (/-spid-[a-z0-9]+/i.test(path) || /\/details\/[a-z0-9]{5,}/i.test(path)) return true;
  if (domain === 'olx.in' || domain.endsWith('.olx.in')) return /\/item\//.test(path) || /-iid-\d+/.test(path);
  return /\/(?:item|listing|property|property-details|propertydetails|mbdetails|plot|land)\//.test(path) || /(?:property|listing|plot|land)[-_]?(?:id)?\d{5,}/.test(`${path}${url.search}`);
}
export function normalizePropertyResults(records: Array<{ title?: string; link?: string; snippet?: string; date?: string }>, query: string, retrievedAt = new Date(), existing: ExternalPropertyResult[] = []) {
  const seen = new Set(existing.map((row) => row.url));
  const normalized: ExternalPropertyResult[] = [];
  for (const record of records) {
    if (!record.title || !record.link) continue;
    const canonical = canonicalUrl(record.link);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    const url = new URL(canonical);
    const snippet = (record.snippet || '').slice(0, 1200);
    const title = record.title.slice(0, 240);
    const evidenceText = `${title} ${snippet}`;
    const domain = url.hostname.replace(/^www\./, '');
    const price = supportedPrice(evidenceText);
    const area = supportedArea(evidenceText);
    const locality = supportedLocality(evidenceText);
    const result: ExternalPropertyResult = {
      id: `external-${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`,
      kind: 'external', classification: classify(title, snippet, canonical),
      sourceType: individualListingUrl(url, domain) ? 'external_listing' : 'search_discovery', sourceName: sourceName(domain),
      title, url: canonical, domain, snippet, query, retrievedAt: retrievedAt.toISOString(), provenance: 'serpapi_search_result',
      missingFields: [], inferredFields: [],
    };
    if (price !== undefined) result.price = price;
    if (area) result.area = area;
    if (area?.unit === 'cents') result.areaCent = area.value;
    if (locality) result.locality = locality;
    if (record.date) result.publishedAt = record.date.slice(0, 120);
    if (price === undefined) result.missingFields.push('price');
    if (!area) result.missingFields.push('area');
    if (!locality) result.missingFields.push('locality');
    normalized.push(result);
  }
  return normalized;
}
export async function searchProperties(input: { q: string; locality?: string; domains: string[]; search: SearchProvider; native: Listing[]; now?: () => Date }): Promise<SearchSummary> {
  const queries = buildPropertyQueries(input.q, input.locality, input.domains);
  const now = input.now || (() => new Date());
  const settled = await Promise.allSettled(queries.map((query) => input.search(query)));
  let results: ExternalPropertyResult[] = [];
  let completed = 0;
  let failed = 0;
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      completed++;
      results = [...results, ...normalizePropertyResults(outcome.value, queries[index]!, now(), results)];
    } else failed++;
  });
  const providerError = failed ? (completed ? 'Some search requests failed; results may be incomplete.' : 'SerpApi search failed. Check the server key, account access and quota.') : undefined;
  return { results: results.slice(0, 40), queries, completed, failed, ...(providerError ? { providerError } : {}) };
}

