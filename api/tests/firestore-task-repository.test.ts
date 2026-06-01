import { describe, it } from 'vitest';

// Firestore エミュレータ（JVM 必須）が現環境に無いため skip。
// Java + firebase CLI 導入後にエミュレータ起動し、findAll が board コレクションの
// 全ドキュメントを Task として返すことを検証する。配線自体は src で実装済み。
describe.skip('FirestoreTaskRepository.findAll（要 Firestore エミュレータ）', () => {
  it('board コレクションの全ドキュメントを Task 配列で返す', () => {
    // emulator 導入後に実装
  });
});
