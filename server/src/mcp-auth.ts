import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from './config.js';

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function unauthorized(res: Response) {
  res.status(401).json({ error: 'Unauthorized' });
}

export function createMcpAuthMiddleware(config: AppConfig): RequestHandler {
  if (!config.MCP_AUTH_ENABLED) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  if (config.MCP_AUTH_TYPE === 'bearer') {
    const expectedToken = config.MCP_AUTH_TOKEN ?? '';
    return (req: Request, res: Response, next: NextFunction) => {
      const authorization = req.get('authorization');
      if (!authorization?.startsWith('Bearer ')) {
        unauthorized(res);
        return;
      }

      const presentedToken = authorization.slice('Bearer '.length);
      if (!safeCompare(presentedToken, expectedToken)) {
        unauthorized(res);
        return;
      }

      next();
    };
  }

  const expectedHeaderName = config.MCP_AUTH_HEADER_NAME ?? '';
  const expectedHeaderValue = config.MCP_AUTH_HEADER_VALUE ?? '';
  return (req: Request, res: Response, next: NextFunction) => {
    const presentedValue = req.get(expectedHeaderName);
    if (!presentedValue || !safeCompare(presentedValue, expectedHeaderValue)) {
      unauthorized(res);
      return;
    }

    next();
  };
}
