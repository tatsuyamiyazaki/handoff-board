import type { Task } from '@handoff/shared';
import type { TaskRepository } from './task-repository.js';

/**
 * テスト・ローカル開発用のメモリ実装。Firestore エミュレータ（Java）不要。
 * 外部に内部参照を漏らさないよう、出し入れ時にクローンする（不変性）。
 */
export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks: Map<string, Task>;

  constructor(initial: Task[] = []) {
    this.tasks = new Map(initial.map((t) => [t.id, structuredClone(t)]));
  }

  async findAll(): Promise<Task[]> {
    return [...this.tasks.values()].map((t) => structuredClone(t));
  }
}
