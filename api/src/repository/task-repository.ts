import type { Task } from '@handoff/shared';

/** 楽観的並行制御の衝突。last-seen updated_at が現在値と不一致。HTTP 409 に対応（ADR-0002）。 */
export class ConflictError extends Error {
  readonly status = 409 as const;
  constructor(message = 'タスクは他で更新されています。再取得してください') {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Firestore アクセスを隠蔽する差し替え可能なインターフェース（docs/prd.md §モジュール構成）。
 * #01 findAll、#03 create、#04 findById/update を追加。complete は後続スライスで追加する。
 */
export interface TaskRepository {
  /** 処理中ボード（board コレクション）の全タスクを返す。 */
  findAll(): Promise<Task[]>;
  /** id 一致のタスクを返す。無ければ null。 */
  findById(id: string): Promise<Task | null>;
  /** 新規タスクを永続化し、保存後のタスクを返す。 */
  create(task: Task): Promise<Task>;
  /**
   * 楽観ロック更新。現在の updated_at が expectedUpdatedAt と一致する場合のみ task を保存する。
   * 不一致または対象不存在は ConflictError(409)。
   */
  update(task: Task, expectedUpdatedAt: string): Promise<Task>;
}
