import type { Request, Response } from 'express';

export function getHealth(_req: Request, res: Response): void {
  res.json({ ok: true, message: 'API is running' });
}

/** Legacy ping; remove when clients use /api/health only */
export function getHello(_req: Request, res: Response): void {
  res.json({ message: 'Hello from the backend' });
}
