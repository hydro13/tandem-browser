import type { Response } from 'express';

/** Standard error handler for API route catch blocks */
export function handleRouteError(res: Response, e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  res.status(500).json({ error: message });
}
