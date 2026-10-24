import { describe, expect, it } from 'vitest';
import { buildPropertyQueries, normalizePropertyResults, searchProperties } from './property-search.js';

describe('unified public property search normalization', () => {
  it('builds at most three focused, configurable domain queries', () => {
    const queries = buildPropertyQueries('residential', 'Kumbalangi', ['example.com', 'homes.in', 'portal.in']);
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain('site:example.com');
    expect(queries[1]).toContain('site:portal.in');
  });

  it('uses locality-specific OLX and portal queries by default', () => {
    const queries = buildPropertyQueries('', 'Aluva', []);
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain('site:olx.in');
    expect(queries[0]).toContain('Aluva');
    expect(queries[1]).toContain('site:magicbricks.com');
    expect(queries[2]).toContain('Aluva Kochi Kerala land plot for sale');
  });

  it('keeps unknown facts absent and only extracts explicit snippet values', () => {
    const [result] = normalizePropertyResults([
      { title: 'Kumbalangi land plot for sale', link: 'https://www.example.in/listing?id=3&utm_source=search', snippet: 'Asking ₹42 lakh for a 6.5 cents residential plot in Kumbalangi.', date: '2026-10-20' },
      { title: 'Property details', link: 'https://example.in/unknown', snippet: 'Good plot in Kochi' },
    ], 'Kumbalangi plots', new Date('2026-10-24T00:00:00Z'));
    expect(result).toMatchObject({ classification: 'listing_candidate', domain: 'example.in', price: 4_200_000, locality: 'Kumbalangi', areaCent: 6.5, provenance: 'serpapi_search_result' });
    expect(result?.url).toBe('https://www.example.in/listing?id=3');
    expect(result?.publishedAt).toBe('2026-10-20');
    const unknown = normalizePropertyResults([{ title: 'Property details', link: 'https://example.in/unknown', snippet: 'Good plot in Kochi' }], 'Kochi')[0];
    expect(unknown).not.toHaveProperty('price');
    expect(unknown).not.toHaveProperty('areaCent');
    expect(unknown).not.toHaveProperty('locality');
    expect(unknown?.classification).toBe('listing_candidate');
  });


  it('preserves original listing URLs, portal source and missing-field provenance', () => {
    const [listing, discovery] = normalizePropertyResults([
      { title: 'Residential plot in Kumbalangi', link: 'https://www.olx.in/item/land-plot-iid-123456789', snippet: 'Plot for sale, 6 cents, ₹12 lakh, Kumbalangi.' },
      { title: 'Kakkanad land for sale', link: 'https://www.olx.in/kochi/land-for-sale', snippet: 'Browse available land offers.' },
      { title: 'Kakkanad plot', link: 'https://housing.com/buy-plot-in-kakkanad', snippet: 'Listing page' },
    ], 'OLX Kumbalangi plots', new Date('2026-10-24T00:00:00Z'));
    expect(listing).toMatchObject({ sourceName: 'OLX', sourceType: 'external_listing', url: 'https://www.olx.in/item/land-plot-iid-123456789', price: 1_200_000, area: { display: '6 cents' }, locality: 'Kumbalangi', inferredFields: [] });
    expect(listing?.missingFields).toEqual([]);
    expect(discovery?.sourceType).toBe('search_discovery');
    expect(discovery?.missingFields).toContain('price');
    expect(discovery?.url).toBe('https://www.olx.in/kochi/land-for-sale');
    const portalPages = normalizePropertyResults([
      { title: 'Specific plot', link: 'https://www.99acres.com/residential-land-plot-for-sale-in-kochi-spid-W78423693' },
      { title: 'Specific plot detail', link: 'https://www.helloaddress.com/details/P945651' },
      { title: '774 sq yd plot', link: 'https://listing.example/property/987654', snippet: 'Plot size: 774 sq yd.' },
    ], 'portal listings');
    expect(portalPages.slice(0, 2).map((row) => row.sourceType)).toEqual(['external_listing', 'external_listing']);
    expect(portalPages[2]?.area).toEqual({ value: 774, unit: 'sq yd', display: '774 sq yd' });
  });

  it('deduplicates canonical URLs but does not merge similar independent property pages', () => {
    const results = normalizePropertyResults([
      { title: 'Plot A', link: 'https://example.in/plot-a?utm_campaign=x' },
      { title: 'Plot A duplicate', link: 'https://example.in/plot-a#details' },
      { title: 'Plot A nearby', link: 'https://example.in/plot-a-nearby' },
      { title: 'Bad URL', link: 'javascript:alert(1)' },
    ], 'land');
    expect(results).toHaveLength(2);
  });

  it('distinguishes successfully empty searches from provider errors and caps requests at three', async () => {
    let calls = 0;
    const empty = await searchProperties({ q: 'plot', locality: 'Kumbalangi', domains: [], native: [], search: async () => { calls++; return []; } });
    expect(calls).toBe(3);
    expect(empty.completed).toBe(3);
    expect(empty.failed).toBe(0);
    expect(empty.providerError).toBeUndefined();
    const failed = await searchProperties({ q: 'plot', domains: [], native: [], search: async () => { throw new Error('offline'); } });
    expect(failed.completed).toBe(0);
    expect(failed.failed).toBe(3);
    expect(failed.providerError).toMatch(/SerpApi search failed/);
  });
});


