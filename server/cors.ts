const DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

export function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  const configured = new Set((process.env.FRONTEND_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean));
  if (configured.has(origin)) return true;
  return process.env.NODE_ENV !== 'production' && DEVELOPMENT_ORIGINS.has(origin);
}
