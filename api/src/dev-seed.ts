import type { Task } from '@handoff/shared';

/**
 * Firestore エミュレータ無しでも UI 表示を確認できるローカル開発用シード。
 * created_by は null（特定ユーザーに紐づかない）。人間UIは created_by が自分のメールと
 * 一致するタスクのみ読み込むため、これらはサインイン後の人間ボードには表示されない
 * （機械系パス＝ディスパッチャー/AI はボード全体を見るので確認に使える）。
 */
export const devSeed: Task[] = [
  {
    id: 'seed-1',
    title: '週次ニュースレターの下書き',
    status: 'needs-ai',
    owner: 'ai-batch',
    priority: 'P1',
    action_type: 'content',
    handoff_note: '先週の更新を3段落でまとめて',
    blocked_reason: null,
    tags: [],
    agent: 'codex',
    project: 'ニュースレター',
    milestone: '6月号',
    created_by: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    activity: [{ timestamp: '2026-06-01T00:00:00Z', actor: 'human', action: 'created' }],
  },
  {
    id: 'seed-2',
    title: 'API 仕様レビュー',
    status: 'needs-human',
    owner: 'human',
    priority: 'P2',
    action_type: 'review',
    handoff_note: 'エンドポイント命名を確認してほしい',
    blocked_reason: null,
    tags: ['dispatcher-lock'],
    agent: null,
    project: 'API刷新',
    milestone: 'v2',
    created_by: null,
    created_at: '2026-06-01T01:00:00Z',
    updated_at: '2026-06-01T01:00:00Z',
    activity: [{ timestamp: '2026-06-01T01:00:00Z', actor: 'human', action: 'created' }],
  },
  {
    id: 'seed-3',
    title: '競合調査メモの統合',
    status: 'in-progress',
    owner: 'ai-interactive',
    priority: 'P2',
    action_type: 'research',
    handoff_note: '3社分を1ページに',
    blocked_reason: null,
    tags: [],
    agent: 'claude-code',
    project: '競合調査',
    milestone: null,
    created_by: null,
    created_at: '2026-06-01T02:00:00Z',
    updated_at: '2026-06-01T03:00:00Z',
    activity: [{ timestamp: '2026-06-01T02:00:00Z', actor: 'human', action: 'created' }],
  },
];
