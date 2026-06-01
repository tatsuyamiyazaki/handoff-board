import type { ReactNode } from 'react';

// モノクロ・細線のインラインSVGアイコン群。currentColor で色を継ぐので、
// ボタンの :active 反転（白→黒）にもそのまま追従する。装飾目的なので aria-hidden。

export type IconName =
  | 'play' // 着手
  | 'handoff' // 引き継ぎ
  | 'check' // 完了
  | 'ban' // ブロック
  | 'unlock' // 解除
  | 'archive' // アーカイブ
  | 'pencil' // 編集
  | 'plus' // 新規タスク
  | 'log-in' // サインイン
  | 'log-out' // サインアウト
  | 'x' // キャンセル / 閉じる
  | 'trash'; // 削除

const PATHS: Record<IconName, ReactNode> = {
  play: <polygon points="7 4 20 12 7 20" />,
  handoff: (
    <>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h13" />
      <path d="M17 20l4-4-4-4" />
      <path d="M21 16H8" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.9-1" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  'log-in': (
    <>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </>
  ),
  'log-out': (
    <>
      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
};

interface IconProps {
  name: IconName;
}

/** 16px のモノクロ細線アイコン。ボタンの視覚要素として使う（ラベルは aria-label 側に持たせる）。 */
export function Icon({ name }: IconProps) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
