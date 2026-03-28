import type { Request } from 'express';

export function routeParam(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return '';
}
