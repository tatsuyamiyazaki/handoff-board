import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  ok,
  fail,
  validateCreateTask,
  buildTask,
  applyTransition,
  ValidationError,
  STATUSES,
  type Status,
} from '@handoff/shared';
import { authenticate, type AuthConfig } from '../auth/auth-middleware.js';
import type { TaskRepository } from '../repository/task-repository.js';

export interface BoardRouteDeps {
  repository: TaskRepository;
  auth: AuthConfig;
  ids?: () => string;
  clock?: () => string;
}

/** 検証済みの遷移リクエスト本文。 */
interface TransitionRequest {
  to: Status;
  handoff_note?: string;
  updated_at: string;
}

/** PATCH 本文を検証する。to は有効 status、updated_at は楽観ロック用に必須。違反は 422。 */
function parseTransitionRequest(input: unknown): TransitionRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ValidationError('request body must be an object');
  }
  const body = input as Record<string, unknown>;

  if (!STATUSES.includes(body.to as Status)) {
    throw new ValidationError('to must be a valid status');
  }
  if (typeof body.updated_at !== 'string' || body.updated_at.trim().length === 0) {
    throw new ValidationError('updated_at is required for optimistic concurrency');
  }
  const handoff_note =
    body.handoff_note === undefined ? undefined : String(body.handoff_note);

  return { to: body.to as Status, handoff_note, updated_at: body.updated_at };
}

/** 処理中ボードのルート。#01 GET、#03 POST（作成）、#04 PATCH（status 遷移）。 */
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

  app.patch('/api/board/:id', async (request, reply) => {
    const { actor } = await authenticate(request.headers, deps.auth);
    const { id } = request.params as { id: string };
    const req = parseTransitionRequest(request.body);

    const current = await deps.repository.findById(id);
    if (current === null) {
      reply.status(404);
      return fail('task not found');
    }

    const next = applyTransition(
      current,
      { to: req.to, handoff_note: req.handoff_note },
      { now, actor },
    );
    const saved = await deps.repository.update(next, req.updated_at);
    return ok(saved);
  });
}
