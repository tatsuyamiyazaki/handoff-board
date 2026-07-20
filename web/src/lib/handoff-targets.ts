// 引き継ぎ・差し戻し・ブロック解除ダイアログが共有する遷移先ラベル。
// 二重定義するとダイアログ間で文言がドリフトするため、ここを唯一の定義とする。

import type { Status } from '@handoff/shared';

/** ダイアログの選択肢に出しうる遷移先（needs-* への引き継ぎ、blocked からの in-review 復帰）。 */
export type HandoffTarget = Extract<Status, 'needs-ai' | 'needs-human' | 'in-review'>;

/** 遷移先の表示ラベル。 */
export const TARGET_LABEL: Record<HandoffTarget, string> = {
  'needs-ai': 'AI待ち',
  'needs-human': '人間待ち',
  'in-review': 'レビュー待ちに戻す',
};
