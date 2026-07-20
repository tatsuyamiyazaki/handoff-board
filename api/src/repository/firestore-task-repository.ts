import { Filter, type Firestore } from 'firebase-admin/firestore';
import type { Task } from '@handoff/shared';
import { ConflictError, type BoardFilter, type TaskRepository } from './task-repository.js';

/** 処理中タスクの Firestore コレクション名。archive は完了タスク用（#06）。 */
const BOARD_COLLECTION = 'board';
const ARCHIVE_COLLECTION = 'archive';

/** Firestore に保存されているタスク（後方互換: 後付けフィールドは欠落しうる）。 */
type StoredTask = Omit<Task, 'id' | 'created_by_type'> &
  Partial<Pick<Task, 'created_by_type'>>;

/** 読み出し時の既定値補完。created_by_type 欠落は 'human'（見せない方向に倒す、ADR-0011）。 */
function toTask(id: string, data: StoredTask): Task {
  return { created_by_type: 'human', ...data, id };
}

/**
 * 本番 / エミュレータ向けの Firestore 実装。
 * findAll/create を配線。emulator 前提の自動テストは Java/firebase CLI 導入まで skip。
 */
export class FirestoreTaskRepository implements TaskRepository {
  constructor(private readonly db: Firestore) {}

  async findAll(filter?: BoardFilter): Promise<Task[]> {
    const collection = this.db.collection(BOARD_COLLECTION);
    // 人間ボード: created_by 一致 ∨ 機械系作成（ADR-0011）。クエリ段階で絞り込む。
    const query =
      filter?.createdBy !== undefined
        ? collection.where(
            Filter.or(
              Filter.where('created_by', '==', filter.createdBy),
              Filter.where('created_by_type', '==', 'machine'),
            ),
          )
        : collection;
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => toTask(doc.id, doc.data() as StoredTask));
  }

  async findById(id: string): Promise<Task | null> {
    const doc = await this.db.collection(BOARD_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return toTask(doc.id, doc.data() as StoredTask);
  }

  async create(task: Task): Promise<Task> {
    const { id, ...data } = task;
    await this.db.collection(BOARD_COLLECTION).doc(id).set(data);
    return task;
  }

  /**
   * 楽観ロック更新。トランザクション内で現在の updated_at を expectedUpdatedAt と照合し、
   * 不一致・不存在は ConflictError(409)。一致時のみ task を書き込む（ADR-0002）。
   */
  async update(task: Task, expectedUpdatedAt: string): Promise<Task> {
    const ref = this.db.collection(BOARD_COLLECTION).doc(task.id);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.exists
        ? (snapshot.data() as Omit<Task, 'id'>)
        : undefined;
      if (current === undefined || current.updated_at !== expectedUpdatedAt) {
        throw new ConflictError();
      }
      const { id: _id, ...data } = task;
      tx.set(ref, data);
    });
    return task;
  }

  /**
   * board → archive へドキュメントを移動する（#06）。トランザクションで board を削除し
   * archive に同 id で書き込む。再送（既に archive 済み）でも壊れない（冪等）。
   */
  async complete(task: Task): Promise<Task> {
    const { id, ...data } = task;
    const boardRef = this.db.collection(BOARD_COLLECTION).doc(id);
    const archiveRef = this.db.collection(ARCHIVE_COLLECTION).doc(id);
    await this.db.runTransaction(async (tx) => {
      tx.set(archiveRef, data);
      tx.delete(boardRef);
    });
    return task;
  }

  async findArchivedById(id: string): Promise<Task | null> {
    const doc = await this.db.collection(ARCHIVE_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return toTask(doc.id, doc.data() as StoredTask);
  }

  async deleteById(id: string): Promise<Task | null> {
    const ref = this.db.collection(BOARD_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;
    const task = toTask(doc.id, doc.data() as StoredTask);
    await ref.delete();
    return task;
  }
}
