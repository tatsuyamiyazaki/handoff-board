import type { Task } from '@handoff/shared';

/**
 * Firestore アクセスを隠蔽する差し替え可能なインターフェース（docs/prd.md §モジュール構成）。
 * #01 では findAll のみ。get/create/update/complete は後続スライスで追加する。
 */
export interface TaskRepository {
  /** 処理中ボード（board コレクション）の全タスクを返す。 */
  findAll(): Promise<Task[]>;
}
