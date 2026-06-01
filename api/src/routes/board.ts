import type { FastifyInstance } from 'fastify';
import { ok } from '@handoff/shared';
import { authenticate, type AuthConfig } from '../auth/auth-middleware.js';
import type { TaskRepository } from '../repository/task-repository.js';

export interface BoardRouteDeps {
  repository: TaskRepository;
  auth: AuthConfig;
}

/** 処理中ボードの参照系ルート。#01 は GET /api/board のみ。 */
export function registerBoardRoutes(app: FastifyInstance, deps: BoardRouteDeps): void {
  app.get('/api/board', async (request) => {
    authenticate(request.headers, deps.auth);
    const tasks = await deps.repository.findAll();
    return ok(tasks);
  });
}
