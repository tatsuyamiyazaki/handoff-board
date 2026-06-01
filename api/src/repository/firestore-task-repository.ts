import type { Firestore } from 'firebase-admin/firestore';
import type { Task } from '@handoff/shared';
import type { TaskRepository } from './task-repository.js';

/** 処理中タスクの Firestore コレクション名。archive は完了タスク用（#06）。 */
const BOARD_COLLECTION = 'board';

/**
 * 本番 / エミュレータ向けの Firestore 実装。
 * #01 では findAll のみ配線。emulator 前提の自動テストは Java/firebase CLI 導入まで skip。
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
}
