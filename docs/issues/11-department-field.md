# 11. AI部署フィールド end-to-end

Type: AFK ／ Source: [docs/adr/0006](../adr/0006-owner-department-role-three-axes.md)

## What to build

タスクに AI部署 `department`（`engineering` / `contents` / `business` / `infrastructure`、nullable）を追加する。owner が AI 系のときのみ持てる独立保存フィールドで、「部署だけ決まりロール未定」を許す。サーバーは不整合（`owner=human` なのに department 指定）を 422 で厳格拒否し、黙って自動修正しない。作成・編集ダイアログには owner が AI 系のときだけ部署ドロップダウンを表示し、owner を human に変えたら部署欄を消してクリアする（カスケードは UI の責務）。カードには部署チップを**部署ごとの色分け**で常時表示（null なら非表示）。BoardControls に部署フィルタを追加し、owner / department / project / milestone の4軸にする。

## Acceptance criteria

- [ ] department の値域が4部署のみ、未指定は null
- [ ] `owner=human` + department 指定が 422（作成・編集とも）
- [ ] AI 系 owner のときだけダイアログに部署ドロップダウンが出る。owner を human に切り替えると欄が消えて値もクリアされる
- [ ] department=engineering のタスクのカードに部署色のチップが表示される（4部署で色が異なる）
- [ ] 部署フィルタで絞り込める
- [ ] shared / api / web のテストが緑（不変条件・カスケード・フィルタを含む）

## Blocked by

- [10. owner 三値化と agent 廃止](10-owner-three-values.md)
