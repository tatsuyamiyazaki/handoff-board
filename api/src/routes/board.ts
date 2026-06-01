import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ok, validateCreateTask, buildTask } from '@handoff/shared';
import { authenticate, type AuthConfig } from '../auth/auth-middleware.js';
import type { TaskRepository } from '../repository/task-repository.js';

export interface BoardRouteDeps {
  repository: TaskRepository;
  auth: AuthConfig;
  ids?: () => string;
  clock?: () => string;
}

/** 処理中ボードのルート。#01 GET、#03 POST（作成）。 */
export function registerBoardRoutes(app: FastifyInstance, deps: BoardRouteDeps): void {
  const newId = deps.ids ?? ((): string => randomUUID());
  const now = deps.clock ?? ((): string => new Date().toISOString());

  app.get('/api/board', async (request) => {
    await authenticate(request.headers, deps.auth);
    const tasks = await deps.repository.findAll();
    return ok(tasks);
  });

  app.post('/api/board', async (request, reply) => {
    const { actor } = await authenticate(request.headers, deps.auth);
    const normalized = validateCreateTask(request.body);
    const task = buildTask(normalized, { id: newId, now, actor });
    const created = await deps.repository.create(task);
    reply.status(201);
    return ok(created);
  });
}
