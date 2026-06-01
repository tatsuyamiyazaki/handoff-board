import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { fail, ValidationError } from '@handoff/shared';
import { AuthError, type AuthConfig } from './auth/auth-middleware.js';
import { registerBoardRoutes } from './routes/board.js';
import { ConflictError, type TaskRepository } from './repository/task-repository.js';

export interface AppDeps {
  repository: TaskRepository;
  auth: AuthConfig;
  /** CORS 許可オリジン。Web(別オリジン)からの fetch を通すために必須。未指定なら CORS 無効。 */
  corsOrigins?: string[];
  /** ID 生成器（テスト用に注入可。既定は crypto.randomUUID）。 */
  ids?: () => string;
  /** 現在時刻 ISO 文字列（テスト用に注入可。既定は new Date().toISOString()）。 */
  clock?: () => string;
}

/** 依存を注入して Fastify アプリを組み立てる（テスト・本番共通）。 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  // Web は別オリジン(Vite :5173)で動くため、プリフライト(OPTIONS)へ応答し
  // 認証ヘッダ(X-Board-Token / Authorization)を許可する必要がある。
  if (deps.corsOrigins && deps.corsOrigins.length > 0) {
    void app.register(cors, {
      origin: deps.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Board-Token'],
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) {
      reply.status(error.status).send(fail(error.message));
      return;
    }
    if (error instanceof ValidationError) {
      reply.status(error.status).send(fail(error.message));
      return;
    }
    if (error instanceof ConflictError) {
      reply.status(error.status).send(fail(error.message));
      return;
    }
    request.log.error(error);
    reply.status(500).send(fail('internal server error'));
  });

  registerBoardRoutes(app, deps);

  return app;
}
