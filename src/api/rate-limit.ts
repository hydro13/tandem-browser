import type { NextFunction, Request, Response } from 'express';

interface ApiCallerLike {
  kind?: string;
  remoteAddress?: string | null;
  extensionId?: string | null;
}

export interface RateLimitOptions {
  bucket: string;
  windowMs: number;
  max: number;
  message: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

function getCallerKey(req: Request, res: Response): string {
  const caller = res.locals.apiCaller as ApiCallerLike | undefined;
  if (caller?.extensionId) return `extension:${caller.extensionId}`;
  if (caller?.remoteAddress) return `remote:${caller.remoteAddress}`;
  if (req.ip) return `ip:${req.ip}`;
  return 'anonymous';
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${options.bucket}:${getCallerKey(req, res)}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: options.message,
        retryAfterSeconds,
      });
      return;
    }

    current.count += 1;
    buckets.set(key, current);
    next();
  };
}
