# Task App Feature Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** テキスト編集・D&Dによる親子関係変更・ソート機能をタスク管理PWAに追加する

**Architecture:** SortableJSでD&Dを実現。手動順序はlocalStorage保存。ソートはクライアントサイド。テキスト編集は既存の長押しメニューを拡張。

**Tech Stack:** Vanilla JS (ES Modules), SortableJS v1 (CDN), localStorage, Supabase Edge Function (PATCH API)

---

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `index.html` | SortableJS CDN追加、drag-handle追加、ctx-edit追加、sort-btn/sort-menu追加 |
| `app.js` | startEdit/commitEdit、sort UIロジック、D&D初期化・ハンドラ、manual order適用 |
| `utils.js` | `applySort(tasks, mode)` 追加 |
| `style.css` | drag-handle、inline edit input、sort-btn、sort-menu スタイル追加 |

---

## Task 1: SortableJS CDN + ドラッグハンドルUI

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: index.html にSortableJS CDNとドラッグハンドルを追加**

`index.html` の `<script type="module" src="app.js"></script>` の直前に追加：
```html
  <script src="https://cdn.jsdelivr.net/npm/sortablejs@1/Sortable.min.js"></script>
```

`index.html` の `<template id="task-template">` 内の `.task-row` を以下に変更：
```html
      <div class="task-row">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <button class="collapse-btn" aria-label="折りたたみ">▶</button>
        <button class="done-btn" aria-label="完了"></button>
        <span class="task-text"></span>
        <button class="menu-btn" aria-label="メニュー">⋯</button>
      </div>
```

- [ ] **Step 2: style.css にドラッグハンドルのスタイルを追加**

`style.css` の末尾に追加：
```css
/* ===== ドラッグハンドル ===== */
.drag-handle {
  color: var(--fg2);
  font-size: 1rem;
  width: 20px;
  cursor: grab;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
  opacity: 0.4;
}

.drag-handle:active { cursor: grabbing; }

/* sortMode !== manual のときハンドル非表示 */
body.sort-auto .drag-handle { display: none; }
```

- [ ] **Step 3: ブラウザで確認**

`index.html` をブラウザで開き、各タスク行の左端に `⠿` が表示されることを確認。ページが壊れていないことを確認。

- [ ] **Step 4: コミット**

```bash
git add index.html style.css
git commit -m "feat: add SortableJS CDN and drag handle UI"
```

---

## Task 2: テキスト編集機能

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`

- [ ] **Step 1: index.html のコンテキストメニューに「編集」ボタンを追加**

`index.html` の `#context-menu` を以下に変更（`ctx-subtask` の直後に `ctx-edit` を追加）：
```html
  <div id="context-menu" class="hidden">
    <button id="ctx-subtask">サブタスクとして追加</button>
    <button id="ctx-edit">編集</button>
    <button id="ctx-delete">削除</button>
    <button id="ctx-cancel">キャンセル</button>
  </div>
```

- [ ] **Step 2: style.css にインライン編集inputのスタイルを追加**

`style.css` の末尾に追加：
```css
/* ===== インライン編集 ===== */
.task-row input.edit-input {
  flex: 1;
  font-size: 1rem;
  padding: 2px 4px;
  border: 1.5px solid var(--accent);
  border-radius: 4px;
  background: var(--bg);
  color: var(--fg);
  outline: none;
  min-width: 0;
}
```

- [ ] **Step 3: app.js に `ctx-edit` のDOM参照を追加**

`app.js` の `// ===== DOM参照 =====` セクション末尾（`const ctxCancel` の次行）に追加：
```js
const ctxEdit = document.getElementById('ctx-edit')
```

- [ ] **Step 4: app.js に `startEdit` / `commitEdit` 関数を追加**

`app.js` の `// ===== コンテキストメニュー =====` セクションの直前に追加：
```js
// ===== テキスト編集 =====
function startEdit(taskId) {
  const li = taskList.querySelector(`[data-id="${taskId}"]`)
  if (!li) return
  const span = li.querySelector('.task-text')
  const originalText = span.textContent
  const input = document.createElement('input')
  input.className = 'edit-input'
  input.value = originalText
  span.replaceWith(input)
  input.focus()
  input.select()

  let committed = false
  function commit() {
    if (committed) return
    committed = true
    const newText = input.value.trim()
    if (newText && newText !== originalText) {
      commitEdit(taskId, newText)
    } else {
      input.replaceWith(span)
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { committed = true; input.replaceWith(span) }
  })
  input.addEventListener('blur', commit)
}

async function commitEdit(taskId, newText) {
  try {
    await updateTask(taskId, { text: newText })
    const task = state.tasks.find(t => t.id === taskId)
    if (task) task.text = newText
    renderTasks()
  } catch (e) {
    console.error('編集に失敗しました:', e)
    renderTasks() // 失敗時はDBの状態に戻す
  }
}
```

- [ ] **Step 5: app.js に `ctx-edit` のイベントハンドラを追加**

`app.js` の `ctxCancel.addEventListener` の直前に追加：
```js
ctxEdit.addEventListener('click', () => {
  if (!contextMenuTargetId) return
  const id = contextMenuTargetId
  closeContextMenu()
  startEdit(id)
})
```

- [ ] **Step 6: 動作確認**

タスクを長押し → メニューに「編集」が表示される → タップ → テキストがinputに変わる → テキストを変更してEnter → 変更が保存される（リロード後も反映される）。Escapeで変更がキャンセルされることも確認。

- [ ] **Step 7: コミット**

```bash
git add index.html app.js style.css
git commit -m "feat: add inline text editing from context menu"
```

---

## Task 3: ソート機能

**Files:**
- Modify: `index.html`
- Modify: `utils.js`
- Modify: `app.js`
- Modify: `style.css`

- [ ] **Step 1: index.html にソートボタンとメニューを追加**

`index.html` の `#task-controls` とその直後を以下に変更：
```html
    <div id="task-controls">
      <label>
        <input type="checkbox" id="hide-done-toggle">
        完了を非表示
      </label>
      <button id="sort-btn">⇅</button>
    </div>
    <div id="sort-menu" class="hidden">
      <button class="sort-option active" data-sort="manual">手動</button>
      <button class="sort-option" data-sort="date-desc">新しい順</button>
      <button class="sort-option" data-sort="date-asc">古い順</button>
      <button class="sort-option" data-sort="done">完了/TODO</button>
      <button class="sort-option" data-sort="alpha">ABC順</button>
    </div>
```

- [ ] **Step 2: utils.js に `applySort` を追加**

`utils.js` の末尾に追加：
```js
/**
 * タスク配列をモードに従ってソートする（非破壊）
 * @param {Array} tasks
 * @param {'manual'|'date-asc'|'date-desc'|'done'|'alpha'} mode
 * @returns {Array}
 */
export function applySort(tasks, mode) {
  if (mode === 'date-asc')  return [...tasks].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  if (mode === 'date-desc') return [...tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  if (mode === 'done')      return [...tasks].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0))
  if (mode === 'alpha')     return [...tasks].sort((a, b) => a.text.localeCompare(b.text, 'ja'))
  return tasks // 'manual'
}
```

- [ ] **Step 3: app.js の import に `applySort` を追加**

`app.js` の1行目を変更：
```js
import { parseTag, buildTree, filterTasks, getCategories, applySort } from './utils.js'
```

- [ ] **Step 4: app.js の `state` に `sortMode` を追加**

`app.js` の `let state = {` ブロックに `sortMode` を追加：
```js
let state = {
  tasks: [],
  filter: null,
  hideDone: false,
  collapsed: new Set(),
  pendingParentId: null,
  sortMode: localStorage.getItem('sortMode') || 'manual',
}
```

- [ ] **Step 5: app.js に DOM参照とソートUIロジックを追加**

`app.js` の `// ===== DOM参照 =====` セクション末尾（`const ctxEdit` の後）に追加：
```js
const sortBtn = document.getElementById('sort-btn')
const sortMenu = document.getElementById('sort-menu')
```

`app.js` の `// ===== テキスト編集 =====` セクションの直前に追加：
```js
// ===== ソート =====
sortBtn.addEventListener('click', e => {
  e.stopPropagation()
  sortMenu.classList.toggle('hidden')
  // 現在のモードにactiveクラスを設定
  sortMenu.querySelectorAll('.sort-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === state.sortMode)
  })
})

sortMenu.querySelectorAll('.sort-option').forEach(btn => {
  btn.addEventListener('click', () => {
    state.sortMode = btn.dataset.sort
    localStorage.setItem('sortMode', state.sortMode)
    sortMenu.classList.add('hidden')
    // manualでないときはdrag-handleを非表示
    document.body.classList.toggle('sort-auto', state.sortMode !== 'manual')
    renderTasks()
  })
})

document.addEventListener('click', e => {
  if (!sortMenu.classList.contains('hidden') && !sortMenu.contains(e.target) && e.target !== sortBtn) {
    sortMenu.classList.add('hidden')
  }
})
```

- [ ] **Step 6: app.js の `renderTasks` にソート適用を追加**

`app.js` の `renderTasks` 関数内、`const tree = buildTree(visible)` の後に以下を追加：

```js
function renderTasks() {
  const filtered = filterTasks(state.tasks, state.filter)
  const visible = state.hideDone ? filtered.filter(t => !t.done) : filtered

  renderFilterBar(getCategories(state.tasks))

  const tree = buildTree(visible)
  const sorted = sortTreeNodes(tree, state.sortMode)
  taskList.innerHTML = ''
  sorted.forEach(task => taskList.appendChild(renderTask(task)))
}
```

`renderTasks` の直前に `sortTreeNodes` ヘルパーを追加：
```js
function sortTreeNodes(nodes, mode) {
  const sorted = applySort(nodes, mode)
  return sorted.map(task => ({
    ...task,
    children: sortTreeNodes(task.children || [], mode)
  }))
}
```

- [ ] **Step 7: app.js の `init` 関数で初期状態のbodyクラスを設定**

`app.js` の `init()` 関数内、`const session = await getSession()` の直前に追加：
```js
  document.body.classList.toggle('sort-auto', state.sortMode !== 'manual')
```

- [ ] **Step 8: style.css にソートUIのスタイルを追加**

`style.css` の末尾に追加：
```css
/* ===== ソートボタン・メニュー ===== */
#sort-btn {
  margin-left: auto;
  background: none;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--fg2);
  font-size: 1rem;
  padding: 4px 10px;
  cursor: pointer;
  min-height: var(--tap);
}

#sort-menu {
  display: flex;
  gap: 6px;
  padding: 6px 12px 8px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
}
#sort-menu::-webkit-scrollbar { display: none; }

.sort-option {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1.5px solid var(--border);
  background: var(--bg);
  color: var(--fg2);
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
  min-height: var(--tap);
}

.sort-option.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
```

- [ ] **Step 9: 動作確認**

⇅ ボタンをタップ → ソートメニューが表示 → 「新しい順」を選択 → タスクが並び替わる → 「ABC順」「完了/TODO」も試す → リロード後もソートモードが維持される → 「手動」以外ではドラッグハンドルが消えることを確認

- [ ] **Step 10: コミット**

```bash
git add index.html utils.js app.js style.css
git commit -m "feat: add sort feature with 5 modes (manual/date/done/alpha)"
```

---

## Task 4: D&D実装（並び替え + 親子関係変更）

**Files:**
- Modify: `app.js`

- [ ] **Step 1: app.js に manual order のユーティリティ関数を追加**

`app.js` の `// ===== ソート =====` セクションの直前に追加：
```js
// ===== 手動並び順（localStorage） =====
function saveManualOrder() {
  const order = {}
  order['root'] = [...taskList.querySelectorAll(':scope > .task-item')].map(li => li.dataset.id)
  document.querySelectorAll('.subtask-list').forEach(ul => {
    const parentId = ul.closest('.task-item')?.dataset.id
    if (parentId) {
      order[parentId] = [...ul.querySelectorAll(':scope > .task-item')].map(li => li.dataset.id)
    }
  })
  localStorage.setItem('taskOrder', JSON.stringify(order))
}

function applyManualOrder(nodes) {
  const order = JSON.parse(localStorage.getItem('taskOrder') || '{}')

  function sortLevel(tasks, key) {
    const ids = order[key]
    if (!ids) return tasks
    const sorted = ids.map(id => tasks.find(t => t.id === id)).filter(Boolean)
    const rest = tasks.filter(t => !ids.includes(t.id))
    return [...sorted, ...rest]
  }

  function recurse(tasks, key) {
    return sortLevel(tasks, key).map(task => ({
      ...task,
      children: recurse(task.children || [], task.id)
    }))
  }

  return recurse(nodes, 'root')
}
```

- [ ] **Step 2: app.js の `sortTreeNodes` を `manual` 対応に更新**

`sortTreeNodes` 関数を以下に差し替え：
```js
function sortTreeNodes(nodes, mode) {
  if (mode === 'manual') return applyManualOrder(nodes)
  const sorted = applySort(nodes, mode)
  return sorted.map(task => ({
    ...task,
    children: sortTreeNodes(task.children || [], mode)
  }))
}
```

- [ ] **Step 3: app.js に `handleDragEnd` と `attachSortable` を追加**

`saveManualOrder` / `applyManualOrder` の直後に追加：
```js
function handleDragEnd(evt) {
  const itemId = evt.item.dataset.id
  if (evt.from !== evt.to) {
    // 親変更: evt.toの親タスクのIDを特定
    const newParentId = evt.to.id === 'task-list'
      ? null
      : evt.to.closest('.task-item')?.dataset.id ?? null
    updateTask(itemId, { parent_id: newParentId }).then(() => {
      const task = state.tasks.find(t => t.id === itemId)
      if (task) task.parent_id = newParentId
      saveManualOrder()
      renderTasks()
    }).catch(e => {
      console.error('親変更に失敗しました:', e)
      renderTasks() // DOM を元の状態に戻す
    })
  } else {
    saveManualOrder()
  }
}

function attachSortable(ul) {
  Sortable.create(ul, {
    group: 'tasks',
    handle: '.drag-handle',
    animation: 150,
    fallbackOnBody: true,
    swapThreshold: 0.65,
    delayOnTouchOnly: true,
    delay: 150,
    onEnd: handleDragEnd,
  })
}
```

- [ ] **Step 4: app.js の `renderTasks` に Sortable 初期化を追加**

`renderTasks` 関数を以下に差し替え：
```js
function renderTasks() {
  const filtered = filterTasks(state.tasks, state.filter)
  const visible = state.hideDone ? filtered.filter(t => !t.done) : filtered

  renderFilterBar(getCategories(state.tasks))

  const tree = buildTree(visible)
  const sorted = sortTreeNodes(tree, state.sortMode)
  taskList.innerHTML = ''
  sorted.forEach(task => taskList.appendChild(renderTask(task)))

  // D&D: manualモードのときのみSortable初期化
  if (state.sortMode === 'manual') {
    attachSortable(taskList)
    document.querySelectorAll('.subtask-list').forEach(ul => attachSortable(ul))
  }
}
```

- [ ] **Step 5: 動作確認 — 同一親内の並び替え**

ソートモードが「手動」の状態で、`⠿` ハンドルをドラッグしてタスクを並び替える → 順序が変わる → リロードしても順序が保たれる

- [ ] **Step 6: 動作確認 — 親変更**

子タスクを別の親タスクの下にドロップ → 子タスクの `parent_id` が変わり正しい親の下に入る。子タスクをルートリストにドロップ → `parent_id: null` になりルートレベルに上がる。

- [ ] **Step 7: 動作確認 — モバイル**

iOSのSafariで `⠿` ハンドルを長押し → ドラッグ開始 → 別の場所にドロップ → 正しく移動する。長押しコンテキストメニューと混同しないことを確認（ハンドル以外の場所を長押しでメニューが開く）。

- [ ] **Step 8: コミット**

```bash
git add app.js
git commit -m "feat: add drag-and-drop for reorder and parent-child change"
```

---

## 最終確認

- [ ] 全機能をモバイルブラウザで通しテスト（編集・ソート・D&D）
- [ ] `git push origin main` でデプロイ
- [ ] https://wtnbyuu.github.io/task-pwa/ で本番確認
