import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ExternalInvestigationSubjectSchema, ListingSchema } from './types.js';
import type { Listing } from './types.js';
import { listings as seed, filterListings, sortListings } from './listings.js';
import { investigate } from './investigation/controller.js';
import { createSerpApiProvider } from './providers/serpapi.js';
import { searchProperties } from './providers/property-search.js';
import { isAllowedOrigin } from './cors.js';

export const app = express();
app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) }));
app.use(express.json({ limit: '32kb' }));

const local: Listing[] = [];
const reports: Awaited<ReturnType<typeof investigate>>[] = [];
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof investigate>>>>();
const reportCache = new Map<string, { expires: number; report: Awaited<ReturnType<typeof investigate>> }>();
const propertySearchCache = new Map<string, { expires: number; value: unknown }>();
const propertySearchInFlight = new Map<string, Promise<unknown>>();
const all = () => [...local, ...seed];
const config = () => ({ serpapi: Boolean(process.env.SERPAPI_API_KEY), openai: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), openaiKeyPresent: Boolean(process.env.OPENAI_API_KEY), openaiModelConfigured: Boolean(process.env.OPENAI_MODEL), streetViewConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY) });
const mode = () => { const c = config(); return c.serpapi && c.openai ? 'live' : c.serpapi || c.openaiKeyPresent ? 'limited' : 'demo'; };
const error = (res: express.Response, status: number, code: string, message: string, details?: unknown) =>
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

const ListingQuery = z.object({
  q: z.string().trim().max(120).optional().default(''),
  locality: z.string().trim().min(2).max(80).optional(),
  landType: z.enum(['Residential', 'Agricultural', 'Commercial', 'Industrial']).optional(),
  maxPrice: z.coerce.number().positive().max(10_000_000_000).optional(),
  minArea: z.coerce.number().positive().max(100_000).optional(),
  maxArea: z.coerce.number().positive().max(100_000).optional(),
}).refine((q) => q.minArea === undefined || q.maxArea === undefined || q.minArea <= q.maxArea, { message: 'minArea must not exceed maxArea' });
const CreateListing = ListingSchema.omit({ id: true, createdAt: true, demo: true }).extend({
  coordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), precision: z.literal('verified') }).optional(),
});
const InvestigationSubjectSchema = z.union([ListingSchema, ExternalInvestigationSubjectSchema]);
const PassportRequest = z.object({ listing: InvestigationSubjectSchema, concerns: z.array(z.string().trim().min(1).max(200)).max(4).default([]) });
const PropertySearchQuery = z.object({q:z.string().trim().max(120).optional().default(''),locality:z.string().trim().min(2).max(80).optional(),landType:z.enum(['Residential','Agricultural','Commercial','Industrial']).optional(),maxPrice:z.coerce.number().positive().max(10000000000).optional(),minArea:z.coerce.number().positive().max(100000).optional(),maxArea:z.coerce.number().positive().max(100000).optional(),refresh:z.enum(['0','1']).optional().default('0')}).refine((v)=>Boolean(v.q||v.locality),{message:'Enter a search term or choose a locality'}).refine((v)=>v.minArea===undefined||v.maxArea===undefined||v.minArea<=v.maxArea,{message:'minArea must not exceed maxArea'});

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: mode(), providers: config() }));
app.get('/api/listings', (req, res) => {
  const parsed = ListingQuery.safeParse(req.query);
  if (!parsed.success) return error(res, 400, 'VALIDATION', 'Invalid listing filters', parsed.error.flatten());
  const query = parsed.data;
  let result = filterListings(all(), query.q);
  if (query.locality) result = result.filter((listing) => listing.locality.toLowerCase() === query.locality!.toLowerCase());
  if (query.landType) result = result.filter((listing) => listing.landType === query.landType);
  if (query.maxPrice) result = result.filter((listing) => listing.price <= query.maxPrice!);
  if (query.minArea) result = result.filter((listing) => listing.areaCent >= query.minArea!);
  if (query.maxArea) result = result.filter((listing) => listing.areaCent <= query.maxArea!);
  res.json(sortListings(result));
});
app.get('/api/property-search', async (req, res) => {
  const parsed = PropertySearchQuery.safeParse(req.query);
  if (!parsed.success) return error(res, 400, 'VALIDATION', 'Invalid property search', parsed.error.flatten());
  const query = parsed.data;
  const native = filterListings(all(), query.q || query.locality || '').filter((listing) =>
    (!query.locality || listing.locality.toLowerCase() === query.locality.toLowerCase()) &&
    (!query.landType || listing.landType === query.landType) &&
    (!query.maxPrice || listing.price <= query.maxPrice) &&
    (!query.minArea || listing.areaCent >= query.minArea) &&
    (!query.maxArea || listing.areaCent <= query.maxArea));
  const configuredDomains = (process.env.PROPERTY_SEARCH_DOMAINS || '').split(',').map((domain) => domain.trim().toLowerCase()).filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)).slice(0, 8);
  const domains = configuredDomains.length ? configuredDomains : ['olx.in', '99acres.com', 'magicbricks.com', 'housing.com'];
  if (!process.env.SERPAPI_API_KEY) return res.json({ native, external: [], searches: 0, completed: 0, failed: 0, queries: [], sourceDomains: [], listingCount: 0, cached: false, mode: mode(), providerError: 'External search is not configured. Add SERPAPI_API_KEY to the server environment.' });
  const cacheKey = JSON.stringify({ q: query.q, locality: query.locality, domains, filters: { ...query, refresh: '0' } });
  const cached = propertySearchCache.get(cacheKey);
  if (query.refresh !== '1' && cached && cached.expires > Date.now()) return res.json({ ...(cached.value as Record<string, unknown>), cached: true });
  try {
    let task = propertySearchInFlight.get(cacheKey);
    if (!task) {
      task = searchProperties({ q: query.q || '', locality: query.locality, domains, search: createSerpApiProvider(process.env.SERPAPI_API_KEY), native });
      propertySearchInFlight.set(cacheKey, task);
    }
    const summary = await task as Awaited<ReturnType<typeof searchProperties>>;
    const external = summary.results.filter((result) =>
      (!query.maxPrice || result.price === undefined || result.price <= query.maxPrice) &&
      (!query.minArea || result.areaCent === undefined || result.areaCent >= query.minArea) &&
      (!query.maxArea || result.areaCent === undefined || result.areaCent <= query.maxArea));
    const value = { native, external, searches: summary.queries.length, completed: summary.completed, failed: summary.failed, queries: summary.queries, sourceDomains: [...new Set(external.map((result) => result.sourceName))], listingCount: external.filter((result) => result.classification === 'listing_candidate' && result.sourceType === 'external_listing').length, cached: false, mode: mode(), ...(summary.providerError ? { providerError: summary.providerError } : {}) };
    propertySearchCache.set(cacheKey, { value, expires: Date.now() + 60_000 });
    res.json(value);
  } catch (cause) {
    const message = cause instanceof Error && cause.name === 'AbortError' ? 'External search timed out. Try again.' : 'External search failed. Check the server credential and provider account.';
    error(res, 502, 'PROPERTY_SEARCH_FAILED', message);
  } finally { propertySearchInFlight.delete(cacheKey); }
});
app.get('/api/maps/status', (_req, res) => res.json({ streetViewEmbedConfigured: false, googleMapsLinkAvailable: true, note: 'Google Maps links are available; no Google key is sent to the browser.' }));
app.get('/api/listings/:id', (req, res) => {
  const listing = all().find((item) => item.id === req.params.id);
  if (!listing) return error(res, 404, 'NOT_FOUND', 'Listing not found');
  res.json(listing);
});
app.post('/api/listings', (req, res) => {
  const parsed = CreateListing.safeParse(req.body);
  if (!parsed.success) return error(res, 400, 'VALIDATION', 'Invalid listing', parsed.error.flatten());
  const listing = ListingSchema.parse({ ...parsed.data, id: randomUUID(), createdAt: new Date().toISOString(), demo: true });
  local.unshift(listing);
  res.status(201).json(listing);
});
app.patch('/api/listings/:id', (req, res) => {
  const index = local.findIndex((item) => item.id === req.params.id);
  if (index < 0) return error(res, 404, 'NOT_FOUND', 'Only API-session listings can be edited');
  const parsed = ListingSchema.omit({ id: true }).partial().safeParse(req.body);
  if (!parsed.success) return error(res, 400, 'VALIDATION', 'Invalid listing update', parsed.error.flatten());
  local[index] = { ...local[index]!, ...parsed.data };
  res.json(local[index]);
});
app.post('/api/passport', async (req, res) => {
  const parsed = PassportRequest.safeParse(req.body);
  if (!parsed.success) return error(res, 400, 'VALIDATION', 'Invalid passport request', parsed.error.flatten());
  const { listing, concerns } = parsed.data;
  const cacheKey = JSON.stringify({ listing, concerns: [...concerns].sort(), hasSearch: config().serpapi, hasOpenAI: config().openai, model: process.env.OPENAI_MODEL });
  const cached = reportCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return res.json(cached.report);
  try {
    let task = inFlight.get(cacheKey);
    if (!task) {
      const hasSearch = Boolean(process.env.SERPAPI_API_KEY);
      task = investigate(listing, concerns, {
        search: hasSearch ? createSerpApiProvider(process.env.SERPAPI_API_KEY!) : undefined,
        live: hasSearch, openaiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL,
      });
      inFlight.set(cacheKey, task);
    }
    const result = await task;
    if (!reports.some((report) => report.id === result.id)) reports.unshift(result);
    reports.splice(20);
    reportCache.set(cacheKey, { report: result, expires: Date.now() + 60_000 });
    res.json(result);
  } catch (err) {
    console.error('Passport controller error', err instanceof Error ? err.name : 'unknown');
    error(res, 502, 'INVESTIGATION_FAILED', 'Investigation could not be completed. Please retry.');
  } finally { inFlight.delete(cacheKey); }
});
app.get('/api/investigations', (req, res) => {
  const parsed = z.object({ listingId: z.string().min(1).max(120).optional() }).safeParse(req.query);
  if (!parsed.success) return error(res, 400, 'VALIDATION', 'Invalid investigation filter', parsed.error.flatten());
  res.json(reports.filter((report) => !parsed.data.listingId || report.listingId === parsed.data.listingId).slice(0, 20).map(({ id, listingId, createdAt, mode, status, coverage, searchCount }) => ({ id, listingId, createdAt, mode, status, coverage, searchCount })));
});
app.get('/api/investigations/:id', (req, res) => {
  const report = reports.find((item) => item.id === req.params.id);
  if (!report) return error(res, 404, 'NOT_FOUND', 'Investigation not found');
  res.json(report);
});
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof SyntaxError) return error(res, 400, 'INVALID_JSON', 'Request body must contain valid JSON');
  error(res, 500, 'INTERNAL', 'Unexpected server error');
});

if (process.env.NODE_ENV !== 'test') app.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log(`PlotLens API listening on ${process.env.PORT || 3001} (${mode()} mode)`));

