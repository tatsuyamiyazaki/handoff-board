import type { Task } from '@handoff/shared';

/** findAll の絞り込み条件。createdBy 指定時は「created_by 一致 ∨ 作成主体が機械系」を返す（ADR-0011）。 */
export interface BoardFilter {
  /** 人間ボードの絞り込み。自分の作成分に加え、機械系作成タスク（created_by_type='machine'）も含める。 */
  createdBy?: string;
}

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
 * #01 findAll、#03 create、#04 findById/update、#06 complete/findArchivedById を追加。
 */
export interface TaskRepository {
  /** 処理中ボードのタスクを返す。filter.createdBy 指定時は自分の作成分と機械系作成分に絞り込む。 */
  findAll(filter?: BoardFilter): Promise<Task[]>;
  /** id 一致のタスクを返す。無ければ null。board コレクションのみ対象。 */
  findById(id: string): Promise<Task | null>;
  /** 新規タスクを永続化し、保存後のタスクを返す。 */
  create(task: Task): Promise<Task>;
  /**
   * 楽観ロック更新。現在の updated_at が expectedUpdatedAt と一致する場合のみ task を保存する。
   * 不一致または対象不存在は ConflictError(409)。
   */
  update(task: Task, expectedUpdatedAt: string): Promise<Task>;
  /**
   * 完了タスクを board から archive コレクションへ移動し、archive のタスクを返す（#06）。
   * 呼び出し側で done 前提と activity 付与を済ませた task を渡す。
   */
  complete(task: Task): Promise<Task>;
  /** archive コレクションの id 一致タスクを返す。無ければ null（complete の冪等判定に使う）。 */
  findArchivedById(id: string): Promise<Task | null>;
  /**
   * board コレクションから id のタスクを削除し、削除したタスクを返す。
   * 対象が存在しなければ null（ルートで 404 判定に使う）。
   */
  deleteById(id: string): Promise<Task | null>;
}
