# Task App Feature Additions — Design Spec

**Date:** 2026-03-31

## Overview

3つの機能をタスク管理PWAに追加する：
1. **テキスト編集** — 長押しメニューからインライン編集
2. **親子関係変更** — SortableJSによるドラッグ&ドロップ
3. **ソート** — 4モードのクライアントサイドソート（手動順序はlocalStorage保存）

---

## 既存コードの概要

| ファイル | 役割 | 行数 |
|---------|------|------|
| `index.html` | HTML構造、タスクtemplate、コンテキストメニュー | 80行 |
| `app.js` | メインロジック：状態管理、イベント、レンダリング、認証 | 293行 |
| `utils.js` | parseTag、buildTree、filterTasks、getCategories | 52行 |
| `style.css` | カスタムCSS、ダークモード、モバイルファースト | 281行 |

タスク1件のHTMLテンプレート（`index.html` #task-template）：
```html
<li class="task-item" data-id="">
  <div class="task-row">
    <button class="collapse-btn">▶</button>
    <button class="done-btn"></button>
    <span class="task-text"></span>
    <button class="menu-btn">⋯</button>
  </div>
  <ul class="subtask-list"></ul>
</li>
```

---

## Feature 1: テキスト編集

### トリガー
長押しコンテキストメニュー（`.context-menu`）に「編集」項目を追加。

### 動作
1. 「編集」タップ → `.task-text`（span）を `<input>` に差し替え、既存テキストをvalueにセット、フォーカス
2. **保存**: Enter キー押下 or input の blur イベント → `PATCH /tasks/:id { text: newText }` → span に戻す
3. **キャンセル**: Escape キー → 元テキストを復元してspanに戻す
4. テキスト空文字で保存 → 変更なし（元テキスト復元）

### 変更ファイル
- `index.html`: コンテキストメニューに `<button class="menu-edit">編集</button>` 追加
- `app.js`: `openContextMenu` でedit項目のイベント追加、`startEdit(taskId)` / `commitEdit(taskId, newText)` 関数追加
- `style.css`: `.task-row input` のインライン編集スタイル（幅、フォント統一）

---

## Feature 2: 親子関係変更（D&D）

### ライブラリ
**SortableJS** を CDN で読み込む（`index.html` に `<script>` タグ追加）。
```html
<script src="https://cdn.jsdelivr.net/npm/sortablejs@1/Sortable.min.js"></script>
```

### ドラッグハンドル
タスクテンプレートの `.task-row` 先頭に `<span class="drag-handle">⠿</span>` を追加。
- ハンドルのみドラッグ起点（SortableJS の `handle` オプション）
- モバイルでは `delayOnTouchOnly: true, delay: 150` で誤タップを防止

### Sortable初期化
`renderTask()` が `<ul class="subtask-list">` を生成する際、そのulに対してSortableインスタンスを生成。
ルートの `<ul id="task-list">` にも同様に生成。

```js
Sortable.create(ulElement, {
  group: 'tasks',          // 異なるulをまたぐ移動を許可
  handle: '.drag-handle',
  animation: 150,
  fallbackOnBody: true,
  swapThreshold: 0.65,
  delayOnTouchOnly: true,
  delay: 150,
  onEnd(evt) { handleDragEnd(evt); }
});
```

### onEnd ハンドラ（`handleDragEnd`）

```
親変更あり（evt.from !== evt.to）:
  → PATCH /tasks/:itemId { parent_id: newParentId | null }
  → saveManualOrder() でlocalStorage更新

親変更なし（同一ul内の並び替え）:
  → saveManualOrder() のみ
```

`newParentId` の特定：`evt.to` が `#task-list`（ルートul）なら `null`、それ以外は `evt.to` の最近接 `.task-item` の `data-id`。

### localStorage スキーマ
```js
// key: "taskOrder"
// value: { [parentId | "root"]: [taskId, taskId, ...] }
```

### renderTasks での順序適用
`buildTree` 後、各レベルの children を localStorage の順序に従って並び替えてからレンダリング。

---

## Feature 3: ソート

### UI
`#filter-bar`（`.filter-bar`）の右端に **ソートボタン** `<button id="sort-btn">⇅</button>` を追加。
タップするとソートモード選択ポップアップ（`.sort-menu`）を表示：

```
○ 手動（デフォルト）
○ 作成日時（新しい順）
○ 作成日時（古い順）
○ 完了/TODO分類
○ ABC順
```

### ソートモードの動作

| モード | ロジック |
|--------|---------|
| `manual` | localStorageの `taskOrder` に従う |
| `date-desc` | `created_at` 降順 |
| `date-asc` | `created_at` 昇順 |
| `done` | `done: false` を上、`done: true` を下 |
| `alpha` | `text` 五十音/アルファベット昇順 |

### 適用範囲
ソートはルートタスクと各レベルの子タスクに適用（再帰）。子は親に追従して移動。

### 状態管理
`state.sortMode`（デフォルト: `'manual'`）。選択変更時に `localStorage.setItem('sortMode', ...)` で保存。
`renderTasks()` 内でソートを適用してからレンダリング。

### `manual` モードとD&Dの関係
- D&D後は `saveManualOrder()` → `renderTasks()` の流れ
- `sortMode !== 'manual'` のとき、ドラッグハンドルを非表示（`.drag-handle { display: none }`）にしてD&D無効化

---

## データフロー

```
ユーザー操作
  ↓
イベントハンドラ（app.js）
  ↓ [編集 / 親変更]
PATCH API（Supabase Edge Function）
  ↓ 成功レスポンス
state.tasks 更新
  ↓
renderTasks() → buildTree() → ソート適用 → DOM生成
  ↓
Sortableインスタンスを各ulに再アタッチ
```

---

## 変更ファイルまとめ

| ファイル | 変更内容 |
|---------|---------|
| `index.html` | ドラッグハンドル追加、編集メニュー項目追加、ソートボタン追加、SortableJS CDN追加 |
| `app.js` | `startEdit`/`commitEdit`、`handleDragEnd`、`saveManualOrder`、`applySort`、`state.sortMode` 追加 |
| `utils.js` | `applySort(tasks, mode)` ユーティリティ関数追加 |
| `style.css` | ドラッグハンドルスタイル、インライン編集input、ソートメニュー、sort-btnスタイル追加 |

---

## 検証方法

1. **テキスト編集**: 長押しメニュー→編集→テキスト変更→Enter保存→リロード後も反映確認
2. **D&D（並び替え）**: ハンドルをドラッグして同一親内で順序変更→リロード後も順序維持確認
3. **D&D（親変更）**: 子タスクをルートへドロップ→`parent_id: null`にPATCHされることを確認。別の親へドロップ→正しい`parent_id`にPATCHを確認
4. **ソート**: 各モード切り替えで正しい順序になることを確認。`manual`以外でドラッグハンドルが消えることを確認
5. **モバイル**: iOSのSafariで全操作が誤タップなく動くことを確認
