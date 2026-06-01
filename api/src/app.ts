import Fastify, { type FastifyInstance } from 'fastify';
import { fail } from '@handoff/shared';
import { AuthError, type AuthConfig } from './auth/auth-middleware.js';
import { registerBoardRoutes } from './routes/board.js';
import type { TaskRepository } from './repository/task-repository.js';

export interface AppDeps {
  repository: TaskRepository;
  auth: AuthConfig;
}

/** 依存を注入して Fastify アプリを組み立てる（テスト・本番共通）。 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) {
      reply.status(error.status).send(fail(error.message));
      return;
    }
    request.log.error(error);
    reply.status(500).send(fail('internal server error'));
  });

  registerBoardRoutes(app, deps);

  return app;
}
