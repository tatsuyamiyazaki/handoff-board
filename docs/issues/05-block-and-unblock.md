# 05. ブロックと解除

Type: AFK ／ Source: [docs/prd.md](../prd.md)（Stories 11, 12）／ 決定: [ADR-0002](../adr/0002-status-transitions-as-server-state-machine.md)

## What to build

`transition-engine` を拡張: (needs-ai / needs-human / in-progress) → blocked、blocked → needs-ai/needs-human。`→ blocked` は `blocked_reason` 必須、`blocked` 離脱時は `blocked_reason` を null にリセットし `handoff_note` 必須。Web にブロックダイアログ（理由入力）と解除操作を実装。

## Acceptance criteria

- [ ] →blocked で blocked_reason 欠落は422
- [ ] blocked→needs-* で blocked_reason が null にリセットされる
- [ ] blocked→needs-* で handoff_note 欠落は422
- [ ] ブロック/解除が activity に記録される
- [ ] UIでブロック理由が表示され、解除でレーン移動する
- [ ] 拡張した transition-engine のテストが緑

## Blocked by

- 04. status遷移: 着手と引き継ぎ
