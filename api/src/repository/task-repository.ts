import type { Task } from '@handoff/shared';

/**
 * Firestore アクセスを隠蔽する差し替え可能なインターフェース（docs/prd.md §モジュール構成）。
 * #01 findAll、#03 create を追加。get/update/complete は後続スライスで追加する。
 */
export interface TaskRepository {
  /** 処理中ボード（board コレクション）の全タスクを返す。 */
  findAll(): Promise<Task[]>;
  /** 新規タスクを永続化し、保存後のタスクを返す。 */
  create(task: Task): Promise<Task>;
}
