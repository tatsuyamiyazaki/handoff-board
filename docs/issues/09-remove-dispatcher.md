# 09. ディスパッチャー撤去

Type: AFK ／ Source: [docs/adr/0005](../adr/0005-remove-dispatcher-pull-via-mcp.md)

## What to build

ディスパッチャー（push 型バッチ）を完全に撤去する。`dispatcher` ワークスペースとそのテストを削除し、ルートのワークスペース設定・ドキュメント（CLAUDE.md / README / docs/prd.md の該当記述）から参照を取り除く。stale 掃引（72時間ルール）も機能ごと廃止であり、どこへも移植しない。issue [07](07-dispatcher.md) の冒頭に「ADR-0005 により廃止済み」の注記を付ける（issue 本文は履歴として残す）。

## Acceptance criteria

- [ ] `dispatcher` ワークスペースが存在せず、`pnpm -r test` / `pnpm -r typecheck` が緑
- [ ] ルート設定・スクリプトに dispatcher への参照が残っていない
- [ ] CLAUDE.md / README / docs から「ディスパッチャーが動いている」と読める記述が消えている（廃止の経緯は ADR-0005 を参照する形）
- [ ] issue 07 に廃止注記がある
- [ ] `dispatcher-lock` タグなどディスパッチャー専用語彙が実コードに残っていない

## Blocked by

None - can start immediately
