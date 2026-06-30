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
  res.setHeader('WWW-Authenticate', 'Basic realm="Pflegemittelbox MCP Dashboard"');
  res.status(401).send('Unauthorized');
}

export function createDashboardAuthMiddleware(config: AppConfig): RequestHandler {
  if (!config.DASHBOARD_AUTH_ENABLED) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const expectedUsername = config.DASHBOARD_AUTH_USERNAME ?? '';
  const expectedPassword = config.DASHBOARD_AUTH_PASSWORD ?? '';

  return (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Basic ')) {
      unauthorized(res);
      return;
    }

    let decoded = '';
    try {
      decoded = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8');
    } catch {
      unauthorized(res);
      return;
    }

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) {
      unauthorized(res);
      return;
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    if (!safeCompare(username, expectedUsername) || !safeCompare(password, expectedPassword)) {
      unauthorized(res);
      return;
    }

    next();
  };
}
