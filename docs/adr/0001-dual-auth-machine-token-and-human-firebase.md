# デュアル認証: 機械系トークン + 人間Firebaseログイン

## Status

accepted

## 決定

HANDOFF API は2系統の認証を同時に受け付ける。

- **機械系**（ディスパッチャー / AIエージェント）: 仕様§2通り `X-Board-Token: {TOKEN}` ヘッダー（エージェント種別ごとに別トークン）。
- **人間**（カンバンWeb UI）: Firebase Authentication の ID トークンを `Authorization: Bearer <idToken>` で送る。API は Admin SDK で検証し、許可リストにあるメールのみ通す。

ブラウザは Firebase で Google サインイン後、ID トークンで **API を直接** 叩く。BFF（Backend-for-Frontend）層は置かず、Web は Vite + React の静的SPA とする。

## 文脈とトレードオフ

仕様§2が定義する認証は `X-Board-Token` という**共有シークレット**方式で、これはサーバー間通信（ディスパッチャー、AIエージェント）を前提にしている。フルスタックでカンバンUIを足すと「ブラウザがこのAPIをどう認証するか」が問題になる。

検討した代替案:

1. **ブラウザに UI 用 `X-Board-Token` を埋め込む** — 却下。共有シークレットがクライアントJSに露出し、開発者ツールで誰でも抜ける。実質ノーガード。
2. **BFF を挟み Cookie セッションで仲介** — 却下。トークンはサーバーに隠せるが、サーバーコンポーネント/セッション基盤が増え、静的SPA + Cloud Run API という構成に追加の運用面が乗る。
3. **採用案: 人間ログインを追加（仕様§8の拡張方向）** — Firebase ID トークンは「ユーザーごと・短命（1時間）・サーバーで検証可能」で、共有シークレットと違いブラウザに置いても安全。よって BFF 不要でブラウザ直叩きが成立し、Web を最軽量の静的SPA に保てる。

## 帰結

- API ミドルウェアは「`X-Board-Token` があれば機械系パス、`Authorization: Bearer` があれば Firebase 検証→人間パス」と分岐する。
- Firebase Auth への依存（ロックイン）が生じる。Firestore が既に GCP/Firebase エコシステム内のため親和性は高い。
- `activity.actor` は人間ログイン時は当人（メール等）、機械系はトークン種別から特定する。
- `X-Board-Token` をブラウザに出した将来の実装は本ADRの前提を破壊する（やってはいけない）。

## 補遺: 人間パスの認可（メール完全一致 + ドメイン許可）

Firebase Authentication（Google サインイン）は「Google アカウントを持つ**誰でも**」を**認証**する。これは「本人確認（誰か）」であって「このアプリを使ってよいか（認可）」ではない。Firebase コンソールの **承認済みドメイン（Authorized domains）** は、サインイン/OAuth リダイレクトを動かせる**Web ホスト元オリジン**を制御する設定であり、**ユーザーのメールドメインを制限する機能ではない**。

したがってアプリ側で認可を持つ。許可判定は2系統で、**いずれか一方を満たせば通す**:

- `ALLOWED_EMAILS` — メール**完全一致**（個人単位）。
- `ALLOWED_EMAIL_DOMAINS` — `@`以降の**ドメイン完全一致**（社内アカウント全体を通す用途。例 `sunbit.co.jp`）。ドメインは末尾一致ではなく `@` で分割した完全一致で照合し、`evil-sunbit.co.jp` のような偽装を弾く。

Firebase 側でメールドメインを強制したい場合は Blocking Functions（Identity Platform）が必要になるが、インフラが増えるため、当面はアプリ側の許可リスト/ドメイン許可で認可する。
