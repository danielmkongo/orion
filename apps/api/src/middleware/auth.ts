import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.service.js';
import type { JwtPayload, Permission } from '@orion/shared';
import { ROLE_PERMISSIONS } from '@orion/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing bearer token' });
  }

  const token = authHeader.slice(7);
  try {
    request.user = authService.verifyToken(token);
  } catch {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const perms = ROLE_PERMISSIONS[request.user.role] ?? [];
    if (!perms.includes(permission)) {
      return reply.code(403).send({ error: 'Forbidden', message: `Requires permission: ${permission}` });
    }
  };
}
