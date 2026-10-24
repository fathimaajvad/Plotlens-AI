import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { listings } from './listings.js';
import { isAllowedOrigin } from './cors.js';

let app: (typeof import('./index.js'))['app'];
beforeAll(async () => { process.env.NODE_ENV = 'test'; process.env.FRONTEND_ORIGIN = ''; process.env.SERPAPI_API_KEY = ''; process.env.OPENAI_API_KEY = ''; process.env.OPENAI_MODEL = ''; ({ app } = await import('./index.js')); });

describe('PlotLens API', () => {
  it('restricts production CORS to the configured frontend origin', () => {
    const previousMode = process.env.NODE_ENV;
    const previousOrigin = process.env.FRONTEND_ORIGIN;
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_ORIGIN = 'https://demo.example, https://preview.example';
    try {
      expect(isAllowedOrigin('https://demo.example')).toBe(true);
      expect(isAllowedOrigin('https://preview.example')).toBe(true);
      expect(isAllowedOrigin('https://unlisted.example')).toBe(false);
      expect(isAllowedOrigin('http://localhost:5173')).toBe(false);
    } finally {
      if (previousMode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousMode;
      if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
      else process.env.FRONTEND_ORIGIN = previousOrigin;
    }
  });

  it('allows the local development origin and omits CORS for other origins', async () => {
    const local = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(local.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await request(app).get('/api/health').set('Origin', 'https://unlisted.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('reports provider mode without exposing credential values', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('providers.serpapi');
    expect(JSON.stringify(response.body)).not.toContain('API_KEY');
  });

  it('validates and applies listing filters', async () => {
    const valid = await request(app).get('/api/listings').query({ locality: 'Kumbalangi', maxPrice: 3_000_000 });
    expect(valid.status).toBe(200);
    expect(valid.body.map((item: { id: string }) => item.id)).toContain('plot-kumbalam');
    const invalid = await request(app).get('/api/listings').query({ minArea: 9, maxArea: 3 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION');
  });

  it('creates and edits API-session listings and handles missing records', async () => {
    const created = await request(app).post('/api/listings').send({
      title: 'A new sample plot', locality: 'Kakkanad', price: 2_500_000, areaCent: 5,
      description: 'Demo listing', sellerName: 'You',
    });
    expect(created.status).toBe(201);
    expect(created.body.demo).toBe(true);
    const updated = await request(app).patch('/api/listings/' + created.body.id).send({ sold: true });
    expect(updated.status).toBe(200);
    expect(updated.body.sold).toBe(true);
    expect((await request(app).get('/api/listings/missing')).status).toBe(404);
    expect((await request(app).patch('/api/listings/missing').send({ sold: true })).status).toBe(404);
    expect((await request(app).post('/api/listings').send({ title: 'x', price: -4 })).status).toBe(400);
  });


  it('validates property-search input and reports empty live-source state without calling providers', async () => {
    expect((await request(app).get('/api/property-search')).status).toBe(400);
    const response = await request(app).get('/api/property-search').query({ locality: 'Kumbalangi' });
    expect(response.status).toBe(200);
    expect(response.body.searches).toBe(0);
    expect(response.body.external).toEqual([]);
    expect(response.body.listingCount).toBe(0);
    expect(response.body.cached).toBe(false);
    expect(response.body.providerError).toMatch(/SERPAPI_API_KEY/);
  });

  it('returns a fixture passport with an actual trace when credentials are absent', async () => {
    const response = await request(app).post('/api/passport').send({ listing: listings[0], concerns: ['Flooding and waterlogging'] });
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('demo');
    expect(response.body.evidence).toEqual([]);
    expect(response.body.events.some((event: { stage: string }) => event.stage === 'planning')).toBe(true);
    const repeated = await request(app).post('/api/passport').send({ listing: listings[0], concerns: ['Flooding and waterlogging'] });
    expect(repeated.body.id).toBe(response.body.id);
    const history = await request(app).get('/api/investigations').query({ listingId: listings[0]!.id });
    expect(history.body).toHaveLength(1);
    expect((await request(app).get('/api/investigations/' + response.body.id)).body.id).toBe(response.body.id);
  });
});
