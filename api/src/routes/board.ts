import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  ok,
  fail,
  validateCreateTask,
  buildTask,
  applyTransition,
  validateEditTask,
  applyEdit,
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
  blocked_reason?: string;
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
  const blocked_reason =
    body.blocked_reason === undefined ? undefined : String(body.blocked_reason);

  return { to: body.to as Status, handoff_note, blocked_reason, updated_at: body.updated_at };
}

/** 処理中ボードのルート。#01 GET、#03 POST（作成）、#04 PATCH（status 遷移）。 */
export function registerBoardRoutes(app: FastifyInstance, deps: BoardRouteDeps): void {
  const newId = deps.ids ?? ((): string => randomUUID());
  const now = deps.clock ?? ((): string => new Date().toISOString());

  app.get('/api/board', async (request) => {
    const { actor, type } = await authenticate(request.headers, deps.auth);
    // 人間は自分が作成したタスクのみ。機械系（ディスパッチャー/AI）はボード全体を見る。
    const tasks =
      type === 'human'
        ? await deps.repository.findAll({ createdBy: actor })
        : await deps.repository.findAll();
    return ok(tasks);
  });

  app.post('/api/board', async (request, reply) => {
    const { actor, type } = await authenticate(request.headers, deps.auth);
    const normalized = validateCreateTask(request.body);
    const task = buildTask(normalized, { id: newId, now, actor, actorType: type });
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
      { to: req.to, handoff_note: req.handoff_note, blocked_reason: req.blocked_reason },
      { now, actor },
    );
    const saved = await deps.repository.update(next, req.updated_at);
    return ok(saved);
  });

  // タスク内容の編集。status 遷移とは別経路（title/owner/priority/action_type/handoff_note/tags）。
  // updated_at は楽観ロック照合に必須。検証は shared の validateEditTask、適用は applyEdit。
  app.patch('/api/board/:id/details', async (request, reply) => {
    const { actor } = await authenticate(request.headers, deps.auth);
    const { id } = request.params as { id: string };

    const body = request.body as Record<string, unknown> | null;
    const expectedUpdatedAt =
      body && typeof body.updated_at === 'string' ? body.updated_at : '';
    if (expectedUpdatedAt.trim().length === 0) {
      throw new ValidationError('updated_at is required for optimistic concurrency');
    }
    const normalized = validateEditTask(body);

    const current = await deps.repository.findById(id);
    if (current === null) {
      reply.status(404);
      return fail('task not found');
    }

    const next = applyEdit(current, normalized, { now, actor });
    const saved = await deps.repository.update(next, expectedUpdatedAt);
    return ok(saved);
  });

  // カードの削除。board コレクションから完全に除去し、削除したタスクを返す。対象なしは 404。
  app.delete('/api/board/:id', async (request, reply) => {
    await authenticate(request.headers, deps.auth);
    const { id } = request.params as { id: string };

    const deleted = await deps.repository.deleteById(id);
    if (deleted === null) {
      reply.status(404);
      return fail('task not found');
    }
    return ok(deleted);
  });

  // #06 完了→アーカイブ。done 前提、board→archive 移動、再送に対して冪等。
  app.post('/api/board/:id/complete', async (request, reply) => {
    const { actor } = await authenticate(request.headers, deps.auth);
    const { id } = request.params as { id: string };

    const current = await deps.repository.findById(id);
    if (current === null) {
      // 既に archive 済みなら冪等に 200。どちらにも無ければ 404。
      const alreadyArchived = await deps.repository.findArchivedById(id);
      if (alreadyArchived !== null) {
        return ok(alreadyArchived);
      }
      reply.status(404);
      return fail('task not found');
    }

    if (current.status !== 'done') {
      throw new ValidationError('完了できるのは done のタスクのみです');
    }

    const timestamp = now();
    const archivedTask = {
      ...current,
      updated_at: timestamp,
      activity: [...current.activity, { timestamp, actor, action: 'archived' }],
    };
    const saved = await deps.repository.complete(archivedTask);
    return ok(saved);
  });
}
