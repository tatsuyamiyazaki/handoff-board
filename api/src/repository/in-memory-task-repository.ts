import type { Task } from '@handoff/shared';
import { ConflictError, type TaskRepository } from './task-repository.js';

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

  async findById(id: string): Promise<Task | null> {
    const found = this.tasks.get(id);
    return found ? structuredClone(found) : null;
  }

  async create(task: Task): Promise<Task> {
    const stored = structuredClone(task);
    this.tasks.set(stored.id, stored);
    return structuredClone(stored);
  }

  async update(task: Task, expectedUpdatedAt: string): Promise<Task> {
    const current = this.tasks.get(task.id);
    if (current === undefined || current.updated_at !== expectedUpdatedAt) {
      throw new ConflictError();
    }
    const stored = structuredClone(task);
    this.tasks.set(stored.id, stored);
    return structuredClone(stored);
  }
}
