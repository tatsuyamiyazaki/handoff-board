import type { Task } from '@handoff/shared';
import { ConflictError, type BoardFilter, type TaskRepository } from './task-repository.js';

/**
 * テスト・ローカル開発用のメモリ実装。Firestore エミュレータ（Java）不要。
 * 外部に内部参照を漏らさないよう、出し入れ時にクローンする（不変性）。
 */
export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks: Map<string, Task>;
  private readonly archived: Map<string, Task>;

  constructor(initial: Task[] = [], archivedInitial: Task[] = []) {
    this.tasks = new Map(initial.map((t) => [t.id, structuredClone(t)]));
    this.archived = new Map(archivedInitial.map((t) => [t.id, structuredClone(t)]));
  }

  async findAll(filter?: BoardFilter): Promise<Task[]> {
    let tasks = [...this.tasks.values()];
    if (filter?.createdBy !== undefined) {
      // 人間ボード: 自分の作成分 ∨ 機械系作成分（ADR-0011）。
      tasks = tasks.filter(
        (t) => t.created_by === filter.createdBy || t.created_by_type === 'machine',
      );
    }
    return tasks.map((t) => structuredClone(t));
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

  async complete(task: Task): Promise<Task> {
    const stored = structuredClone(task);
    this.tasks.delete(stored.id);
    this.archived.set(stored.id, stored);
    return structuredClone(stored);
  }

  async findArchivedById(id: string): Promise<Task | null> {
    const found = this.archived.get(id);
    return found ? structuredClone(found) : null;
  }

  async deleteById(id: string): Promise<Task | null> {
    const found = this.tasks.get(id);
    if (found === undefined) return null;
    this.tasks.delete(id);
    return structuredClone(found);
  }
}
