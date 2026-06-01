import type { Firestore } from 'firebase-admin/firestore';
import type { Task } from '@handoff/shared';
import { ConflictError, type TaskRepository } from './task-repository.js';

/** 処理中タスクの Firestore コレクション名。archive は完了タスク用（#06）。 */
const BOARD_COLLECTION = 'board';

/**
 * 本番 / エミュレータ向けの Firestore 実装。
 * findAll/create を配線。emulator 前提の自動テストは Java/firebase CLI 導入まで skip。
 */
export class FirestoreTaskRepository implements TaskRepository {
  constructor(private readonly db: Firestore) {}

  async findAll(): Promise<Task[]> {
    const snapshot = await this.db.collection(BOARD_COLLECTION).get();
    return snapshot.docs.map((doc) => ({
      ...(doc.data() as Omit<Task, 'id'>),
      id: doc.id,
    }));
  }

  async findById(id: string): Promise<Task | null> {
    const doc = await this.db.collection(BOARD_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return { ...(doc.data() as Omit<Task, 'id'>), id: doc.id };
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
}
