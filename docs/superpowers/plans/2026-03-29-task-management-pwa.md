# タスク管理PWAアプリ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mac/iPhone両対応のPWAタスク管理アプリを作る。入力ゼロ摩擦・親子タスク対応・Supabase同期。

**Architecture:** Vanilla JS (ES modules) + Supabase (PostgreSQL + Magic Link Auth) + GitHub Pages。純粋関数をutils.jsに分離してVitestでテスト。UIはapp.jsが制御し、supabase.jsのDB層を呼び出す。

**Tech Stack:** HTML/CSS/Vanilla JS (ES modules), Supabase JS v2 (CDN esm.sh), Vitest (テスト用ローカルのみ)

---

## ファイルマップ

| ファイル | 役割 |
|---|---|
| `index.html` | HTML骨格。全スクリプト/スタイルのエントリーポイント |
| `utils.js` | 純粋関数: `parseTag`, `buildTree`, `filterTasks`, `getCategories` |
| `supabase.js` | Supabase初期化・認証・CRUD関数 |
| `app.js` | UI状態管理・イベントハンドラ・描画 |
| `style.css` | レスポンシブCSS（iPhone/Mac、ダークモード） |
| `manifest.json` | PWA設定（standalone表示、アイコン） |
| `sw.js` | Service Worker（オフラインキャッシュ） |
| `tests/utils.test.js` | utils.jsの全関数ユニットテスト |
| `package.json` | Vitestのみ（アプリ本体はnpm不要） |

---

## 事前準備（手動）: Supabaseセットアップ

以下はコードを書く前にユーザーが手動で行う。

**1. Supabaseプロジェクト作成**
- https://supabase.com にアクセス → New Project

**2. tasksテーブル作成**
SQL Editorで実行:
```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  parent_id uuid references tasks(id) on delete cascade,
  text text not null,
  category text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

-- 自分のデータのみ読み書き可能にするRLS
alter table tasks enable row level security;

create policy "Users can manage their own tasks"
  on tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**3. 認証設定**
- Authentication > Providers > Email: 「Confirm email」をOFFに（Magic Link即ログイン）

**4. 接続情報をメモ**
- Project Settings > API > `Project URL` と `anon public key`

---

## Task 1: テスト環境セットアップ

**Files:**
- Create: `package.json`
- Create: `tests/utils.test.js` (空ファイル)

- [ ] **Step 1: package.jsonを作成**

```json
{
  "name": "task-pwa",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Vitestをインストール**

```bash
cd /Users/yuwatanabe/CC/99_tools/task
npm install
```

Expected: `node_modules/` が作成される

- [ ] **Step 3: 空のテストファイルを作成**

```bash
mkdir -p tests
touch tests/utils.test.js
```

- [ ] **Step 4: テストが実行できることを確認**

```bash
npm test
```

Expected: "No test files found" または "0 tests passed"（エラーなし）

---

## Task 2: `parseTag` 関数 (TDD)

**Files:**
- Create: `utils.js`
- Modify: `tests/utils.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/utils.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { parseTag } from '../utils.js'

describe('parseTag', () => {
  it('タグなしの場合、textをそのまま返しcategoryはnull', () => {
    expect(parseTag('買い物')).toEqual({ text: '買い物', category: null })
  })

  it('#タグがある場合、textからタグを除去しcategoryを返す', () => {
    expect(parseTag('メール返信 #仕事')).toEqual({ text: 'メール返信', category: '仕事' })
  })

  it('タグが先頭にある場合も動作する', () => {
    expect(parseTag('#個人 買い物')).toEqual({ text: '買い物', category: '個人' })
  })

  it('複数タグがある場合は最初のタグを使う', () => {
    expect(parseTag('タスク #仕事 #重要')).toEqual({ text: 'タスク', category: '仕事' })
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test
```

Expected: FAIL "Cannot find module '../utils.js'"

- [ ] **Step 3: 最小限の実装を書く**

`utils.js`:
```js
/**
 * テキストから#タグを抽出し、{ text, category } を返す
 * @param {string} raw - ユーザー入力文字列
 * @returns {{ text: string, category: string|null }}
 */
export function parseTag(raw) {
  const match = raw.match(/#(\S+)/)
  const text = raw.replace(/#\S+/g, '').trim()
  return { text, category: match ? match[1] : null }
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test
```

Expected: PASS "4 tests passed"

- [ ] **Step 5: コミット**

```bash
git init
git add utils.js tests/utils.test.js package.json package-lock.json
git commit -m "feat: add parseTag utility with tests"
```

---

## Task 3: `buildTree` 関数 (TDD)

**Files:**
- Modify: `utils.js`
- Modify: `tests/utils.test.js`

- [ ] **Step 1: 失敗するテストを追記**

`tests/utils.test.js` に追加:
```js
import { parseTag, buildTree } from '../utils.js'

describe('buildTree', () => {
  it('親子関係のないフラットなリストはそのまま返す', () => {
    const tasks = [
      { id: '1', parent_id: null, text: 'A' },
      { id: '2', parent_id: null, text: 'B' },
    ]
    const result = buildTree(tasks)
    expect(result).toHaveLength(2)
    expect(result[0].children).toEqual([])
    expect(result[1].children).toEqual([])
  })

  it('parent_idがある場合、子は親のchildrenに入る', () => {
    const tasks = [
      { id: '1', parent_id: null, text: '親' },
      { id: '2', parent_id: '1', text: '子' },
    ]
    const result = buildTree(tasks)
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children[0].text).toBe('子')
  })

  it('孤立したparent_idを持つタスクはルートとして扱う', () => {
    const tasks = [
      { id: '1', parent_id: 'nonexistent', text: 'A' },
    ]
    const result = buildTree(tasks)
    expect(result).toHaveLength(1)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test
```

Expected: FAIL "buildTree is not a function"

- [ ] **Step 3: 実装**

`utils.js` に追加:
```js
/**
 * フラットなタスク配列を親子ツリー構造に変換する
 * @param {Array<{id: string, parent_id: string|null}>} tasks
 * @returns {Array} ルートタスクの配列（各タスクにchildrenプロパティ付き）
 */
export function buildTree(tasks) {
  const map = {}
  tasks.forEach(t => { map[t.id] = { ...t, children: [] } })

  const roots = []
  tasks.forEach(t => {
    if (t.parent_id && map[t.parent_id]) {
      map[t.parent_id].children.push(map[t.id])
    } else {
      roots.push(map[t.id])
    }
  })
  return roots
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test
```

Expected: PASS "7 tests passed"

- [ ] **Step 5: コミット**

```bash
git add utils.js tests/utils.test.js
git commit -m "feat: add buildTree utility with tests"
```

---

## Task 4: `filterTasks` / `getCategories` 関数 (TDD)

**Files:**
- Modify: `utils.js`
- Modify: `tests/utils.test.js`

- [ ] **Step 1: 失敗するテストを追記**

`tests/utils.test.js` に追加:
```js
import { parseTag, buildTree, filterTasks, getCategories } from '../utils.js'

describe('filterTasks', () => {
  const tasks = [
    { id: '1', text: 'A', category: '仕事' },
    { id: '2', text: 'B', category: '個人' },
    { id: '3', text: 'C', category: null },
  ]

  it('categoryがnullの場合は全タスクを返す', () => {
    expect(filterTasks(tasks, null)).toHaveLength(3)
  })

  it('categoryが指定された場合は一致するタスクのみ返す', () => {
    expect(filterTasks(tasks, '仕事')).toEqual([tasks[0]])
  })
})

describe('getCategories', () => {
  it('タスク一覧からユニークなカテゴリ一覧を返す（nullは除く）', () => {
    const tasks = [
      { category: '仕事' },
      { category: '個人' },
      { category: '仕事' },
      { category: null },
    ]
    expect(getCategories(tasks)).toEqual(['仕事', '個人'])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test
```

Expected: FAIL

- [ ] **Step 3: 実装**

`utils.js` に追加:
```js
/**
 * タスクをカテゴリでフィルタリングする
 * @param {Array} tasks
 * @param {string|null} category - nullの場合は全件返す
 */
export function filterTasks(tasks, category) {
  if (!category) return tasks
  return tasks.filter(t => t.category === category)
}

/**
 * タスク一覧からユニークなカテゴリ一覧を返す
 * @param {Array} tasks
 * @returns {string[]}
 */
export function getCategories(tasks) {
  const set = new Set(tasks.map(t => t.category).filter(Boolean))
  return [...set]
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test
```

Expected: PASS "11 tests passed"

- [ ] **Step 5: コミット**

```bash
git add utils.js tests/utils.test.js
git commit -m "feat: add filterTasks and getCategories utilities with tests"
```

---

## Task 5: PWA基盤 (manifest.json + sw.js)

**Files:**
- Create: `manifest.json`
- Create: `sw.js`

- [ ] **Step 1: manifest.jsonを作成**

`manifest.json`:
```json
{
  "name": "タスク",
  "short_name": "タスク",
  "description": "シンプルなタスク管理",
  "start_url": "/task-pwa/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#4f46e5",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: アイコン画像をSVGで作成**

`icon.svg`（ブラウザでPNG変換にも使用）:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="40" fill="#4f46e5"/>
  <text x="96" y="130" text-anchor="middle" font-size="100" fill="white">✓</text>
</svg>
```

- [ ] **Step 3: PNGアイコンを生成**

ターミナルで実行（Macにsipsが標準インストール済み）:
```bash
# SVGをPNGに変換（qlmanage経由）
qlmanage -t -s 512 -o . icon.svg 2>/dev/null
mv icon.svg.png icon-512.png
sips -z 192 192 icon-512.png --out icon-192.png
```

Expected: `icon-192.png` と `icon-512.png` が作成される

- [ ] **Step 4: sw.jsを作成（オフラインキャッシュ）**

`sw.js`:
```js
const CACHE_NAME = 'task-pwa-v1'
const ASSETS = ['/', '/index.html', '/app.js', '/utils.js', '/supabase.js', '/style.css', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Supabaseへのリクエストはキャッシュしない
  if (e.request.url.includes('supabase.co')) return

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
```

- [ ] **Step 5: コミット**

```bash
git add manifest.json sw.js icon.svg icon-192.png icon-512.png
git commit -m "feat: add PWA manifest and service worker"
```

---

## Task 6: supabase.js — DB層

**Files:**
- Create: `supabase.js`

Supabase URL と anon key は事前準備でメモしたものを使う。

- [ ] **Step 1: supabase.jsを作成**

`supabase.js`（`YOUR_URL` と `YOUR_ANON_KEY` を実際の値に置き換え）:
```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'YOUR_URL'       // 例: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// --- 認証 ---

/** Magic Linkをメールに送信 */
export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({ email })
  if (error) throw error
}

/** 現在のセッション取得。未ログインならnull */
export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/** サインアウト */
export async function signOut() {
  await supabase.auth.signOut()
}

// --- タスクCRUD ---

/** 全タスクをcreated_at昇順で取得 */
export async function fetchTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

/**
 * タスクを追加
 * @param {{ text: string, category: string|null, parent_id: string|null }} task
 */
export async function addTask({ text, category, parent_id }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('tasks')
    .insert({ text, category, parent_id, user_id: user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * タスクを更新
 * @param {string} id
 * @param {Partial<{text: string, done: boolean, done_at: string|null, parent_id: string|null}>} updates
 */
export async function updateTask(id, updates) {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * タスクを削除
 * @param {string} id
 */
export async function deleteTask(id) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: コミット**

```bash
git add supabase.js
git commit -m "feat: add supabase DB layer"
```

---

## Task 7: index.html 骨格

**Files:**
- Create: `index.html`

- [ ] **Step 1: index.htmlを作成**

`index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="タスク">
  <link rel="apple-touch-icon" href="icon-192.png">
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="style.css">
  <title>タスク</title>
</head>
<body>

  <!-- ログイン画面 -->
  <div id="login-screen" class="screen hidden">
    <div class="login-box">
      <h1>タスク</h1>
      <p>メールアドレスにMagic Linkを送ります</p>
      <input id="email-input" type="email" placeholder="your@email.com" autocomplete="email">
      <button id="send-link-btn">リンクを送る</button>
      <p id="login-message" class="message"></p>
    </div>
  </div>

  <!-- メイン画面 -->
  <div id="app-screen" class="screen hidden">
    <header>
      <div id="input-area">
        <input
          id="task-input"
          type="text"
          placeholder="タスクを入力… (#カテゴリ)"
          autocomplete="off"
          autocorrect="off"
        >
        <button id="add-btn" aria-label="追加">+</button>
      </div>
    </header>

    <nav id="filter-bar">
      <button class="filter-btn active" data-category="">全て</button>
    </nav>

    <main>
      <div id="task-controls">
        <label>
          <input type="checkbox" id="hide-done-toggle">
          完了を非表示
        </label>
      </div>
      <ul id="task-list"></ul>
    </main>
  </div>

  <!-- タスクアイテムテンプレート（JS側でcloneして使う） -->
  <template id="task-template">
    <li class="task-item" data-id="">
      <div class="task-row">
        <button class="collapse-btn" aria-label="折りたたみ">▶</button>
        <button class="done-btn" aria-label="完了"></button>
        <span class="task-text"></span>
        <button class="menu-btn" aria-label="メニュー">⋯</button>
      </div>
      <ul class="subtask-list"></ul>
    </li>
  </template>

  <!-- 長押しメニュー（iPhone用） -->
  <div id="context-menu" class="hidden">
    <button id="ctx-subtask">サブタスクとして追加</button>
    <button id="ctx-delete">削除</button>
    <button id="ctx-cancel">キャンセル</button>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: ブラウザで開いて骨格が表示されることを確認**

```bash
# ローカルサーバーで確認（ES modulesはfile://では動かない）
python3 -m http.server 8080 --directory /Users/yuwatanabe/CC/99_tools/task
```

ブラウザで http://localhost:8080 を開く。
Expected: スタイルなしでHTML構造だけ表示される（エラーなし）

- [ ] **Step 3: コミット**

```bash
git add index.html
git commit -m "feat: add HTML skeleton"
```

---

## Task 8: style.css

**Files:**
- Create: `style.css`

- [ ] **Step 1: style.cssを作成**

`style.css`:
```css
/* ===== リセット・ベース ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #ffffff;
  --bg2: #f5f5f5;
  --fg: #111111;
  --fg2: #666666;
  --accent: #4f46e5;
  --done-fg: #aaaaaa;
  --border: #e0e0e0;
  --radius: 10px;
  --tap: 44px; /* 最小タップターゲット */
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --bg2: #1e1e1e;
    --fg: #f0f0f0;
    --fg2: #888888;
    --accent: #818cf8;
    --done-fg: #555555;
    --border: #2a2a2a;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--fg);
  min-height: 100dvh;
  max-width: 640px;
  margin: 0 auto;
}

.hidden { display: none !important; }

/* ===== ログイン画面 ===== */
#login-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px;
}

.login-box {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-box h1 { font-size: 2rem; font-weight: 700; }

.login-box input, .login-box button {
  width: 100%;
  padding: 12px 16px;
  border-radius: var(--radius);
  border: 1.5px solid var(--border);
  font-size: 1rem;
  background: var(--bg2);
  color: var(--fg);
}

.login-box button {
  background: var(--accent);
  color: white;
  border: none;
  cursor: pointer;
  font-weight: 600;
  min-height: var(--tap);
}

.message { font-size: 0.9rem; color: var(--fg2); min-height: 1.2em; }

/* ===== ヘッダー・入力欄 ===== */
header {
  position: sticky;
  top: 0;
  background: var(--bg);
  padding: env(safe-area-inset-top, 12px) 12px 8px;
  border-bottom: 1px solid var(--border);
  z-index: 10;
}

#input-area {
  display: flex;
  gap: 8px;
}

#task-input {
  flex: 1;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: 1rem;
  background: var(--bg2);
  color: var(--fg);
  outline: none;
  transition: border-color 0.15s;
}

#task-input:focus { border-color: var(--accent); }

#add-btn {
  width: var(--tap);
  height: var(--tap);
  border-radius: var(--radius);
  border: none;
  background: var(--accent);
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  flex-shrink: 0;
}

/* ===== フィルターバー ===== */
#filter-bar {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--border);
}
#filter-bar::-webkit-scrollbar { display: none; }

.filter-btn {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1.5px solid var(--border);
  background: var(--bg2);
  color: var(--fg2);
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
  min-height: var(--tap);
}

.filter-btn.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

/* ===== タスクコントロール ===== */
#task-controls {
  padding: 8px 12px;
  font-size: 0.875rem;
  color: var(--fg2);
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ===== タスクリスト ===== */
#task-list, .subtask-list {
  list-style: none;
}

.task-item { border-bottom: 1px solid var(--border); }
.subtask-list .task-item { border-bottom: none; }

.task-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 12px;
  min-height: var(--tap);
}

/* サブタスクはインデント */
.subtask-list .task-row { padding-left: 36px; }

.collapse-btn {
  background: none;
  border: none;
  color: var(--fg2);
  font-size: 0.7rem;
  width: 20px;
  height: 20px;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.15s;
  padding: 0;
}

.collapse-btn.expanded { transform: rotate(90deg); }
.collapse-btn:empty, .collapse-btn[data-no-children] { visibility: hidden; }

.done-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s, border-color 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: white;
}

.task-item.done .done-btn {
  background: var(--accent);
  border-color: var(--accent);
}

.task-text {
  flex: 1;
  font-size: 1rem;
  word-break: break-word;
  padding: 10px 4px;
}

.task-item.done .task-text {
  color: var(--done-fg);
  text-decoration: line-through;
}

.menu-btn {
  background: none;
  border: none;
  color: var(--fg2);
  font-size: 1.2rem;
  width: var(--tap);
  height: var(--tap);
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===== コンテキストメニュー ===== */
#context-menu {
  position: fixed;
  bottom: env(safe-area-inset-bottom, 20px);
  left: 12px;
  right: 12px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

#context-menu button {
  display: block;
  width: 100%;
  padding: 16px;
  text-align: center;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: var(--fg);
  font-size: 1rem;
  cursor: pointer;
  min-height: var(--tap);
}

#context-menu button:last-child { border-bottom: none; }
#ctx-delete { color: #ef4444; }
#ctx-cancel { color: var(--fg2); }

/* ===== スワイプ削除（タッチデバイス用の視覚フィードバック） ===== */
.task-item.swipe-delete {
  background: #ef4444;
  transition: background 0.2s;
}
```

- [ ] **Step 2: ブラウザで確認**

```bash
python3 -m http.server 8080 --directory /Users/yuwatanabe/CC/99_tools/task
```

http://localhost:8080 でスタイルが適用されていることを確認

- [ ] **Step 3: コミット**

```bash
git add style.css
git commit -m "feat: add responsive CSS with dark mode and iOS safe areas"
```

---

## Task 9: app.js — 認証フロー

**Files:**
- Create: `app.js`

- [ ] **Step 1: app.jsを作成（認証部分）**

> Note: `handleToggleDone` はTask 11で定義する。Task 10でrenderTask内から参照するため、app.js末尾に `async function handleToggleDone(task) {}` というスタブを残しておくこと。Task 11で上書きする。

`app.js`:
```js
import { supabase, signInWithEmail, getSession, signOut, fetchTasks, addTask, updateTask, deleteTask } from './supabase.js'
import { parseTag, buildTree, filterTasks, getCategories } from './utils.js'

// ===== 状態 =====
let state = {
  tasks: [],         // DBから取得したフラットなタスク一覧
  filter: null,      // 現在のカテゴリフィルター（nullは全て）
  hideDone: false,   // 完了タスクを非表示
  collapsed: new Set(), // 折りたたみ中のタスクID
  pendingParentId: null, // サブタスク追加時の親ID
}

// ===== DOM参照 =====
const loginScreen = document.getElementById('login-screen')
const appScreen = document.getElementById('app-screen')
const emailInput = document.getElementById('email-input')
const sendLinkBtn = document.getElementById('send-link-btn')
const loginMessage = document.getElementById('login-message')
const taskInput = document.getElementById('task-input')
const addBtn = document.getElementById('add-btn')
const taskList = document.getElementById('task-list')
const filterBar = document.getElementById('filter-bar')
const hideDoneToggle = document.getElementById('hide-done-toggle')
const contextMenu = document.getElementById('context-menu')
const ctxSubtask = document.getElementById('ctx-subtask')
const ctxDelete = document.getElementById('ctx-delete')
const ctxCancel = document.getElementById('ctx-cancel')

// ===== 初期化 =====
async function init() {
  // PWA Service Worker登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  }

  const session = await getSession()
  if (session) {
    showApp()
  } else {
    // Magic Link認証コールバック処理（メールリンクからの戻り）
    const { data: { session: callbackSession } } = await supabase.auth.getSession()
    if (callbackSession) {
      showApp()
    } else {
      showLogin()
    }
  }
}

function showLogin() {
  loginScreen.classList.remove('hidden')
  appScreen.classList.add('hidden')
  emailInput.focus()
}

async function showApp() {
  loginScreen.classList.add('hidden')
  appScreen.classList.remove('hidden')
  await loadTasks()
  taskInput.focus()
}

// ===== ログイン =====
sendLinkBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim()
  if (!email) return
  sendLinkBtn.disabled = true
  loginMessage.textContent = '送信中...'
  try {
    await signInWithEmail(email)
    loginMessage.textContent = 'メールを確認してください。リンクをクリックするとログインできます。'
  } catch (e) {
    loginMessage.textContent = 'エラー: ' + e.message
    sendLinkBtn.disabled = false
  }
})

emailInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendLinkBtn.click()
})

// ===== 認証状態の変化を監視（Magic Link callback） =====
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    showApp()
  } else if (event === 'SIGNED_OUT') {
    showLogin()
  }
})

init()
```

- [ ] **Step 2: ブラウザで確認**

```bash
python3 -m http.server 8080 --directory /Users/yuwatanabe/CC/99_tools/task
```

http://localhost:8080 を開く。
Expected: ログイン画面が表示される（コンソールエラーなし）

supabase.jsのYOUR_URLとYOUR_ANON_KEYが未設定の場合はエラーが出るが、それは次のタスクで対処。

- [ ] **Step 3: コミット**

```bash
git add app.js
git commit -m "feat: add auth flow in app.js"
```

---

## Task 10: app.js — タスク読み込み・描画

**Files:**
- Modify: `app.js`

- [ ] **Step 1: loadTasks・renderTasks・renderTree関数を追加**

`app.js` の `init()` 関数の前に追加:
```js
// ===== タスク読み込み =====
async function loadTasks() {
  state.tasks = await fetchTasks()
  renderTasks()
}

// ===== 描画 =====
function renderTasks() {
  // フィルター適用
  const filtered = filterTasks(state.tasks, state.filter)
  const visible = state.hideDone ? filtered.filter(t => !t.done) : filtered

  // カテゴリフィルターバー更新
  renderFilterBar(getCategories(state.tasks))

  // ツリー構築・描画
  const tree = buildTree(visible)
  taskList.innerHTML = ''
  tree.forEach(task => taskList.appendChild(renderTask(task)))
}

function renderFilterBar(categories) {
  // 既存ボタンを「全て」だけ残して再生成
  filterBar.innerHTML = ''
  const allBtn = createFilterBtn('全て', null)
  filterBar.appendChild(allBtn)
  categories.forEach(cat => filterBar.appendChild(createFilterBtn(cat, cat)))
}

function createFilterBtn(label, category) {
  const btn = document.createElement('button')
  btn.className = 'filter-btn' + (state.filter === category ? ' active' : '')
  btn.textContent = label
  btn.dataset.category = category ?? ''
  btn.addEventListener('click', () => {
    state.filter = category
    renderTasks()
  })
  return btn
}

function renderTask(task) {
  const template = document.getElementById('task-template')
  const li = template.content.cloneNode(true).querySelector('li')
  li.dataset.id = task.id
  if (task.done) li.classList.add('done')

  const collapseBtn = li.querySelector('.collapse-btn')
  const doneBtn = li.querySelector('.done-btn')
  const textSpan = li.querySelector('.task-text')
  const menuBtn = li.querySelector('.menu-btn')
  const subtaskList = li.querySelector('.subtask-list')

  textSpan.textContent = task.text

  // 子タスクがない場合は折りたたみボタンを非表示
  if (!task.children || task.children.length === 0) {
    collapseBtn.dataset.noChildren = '1'
  } else {
    const isCollapsed = state.collapsed.has(task.id)
    if (!isCollapsed) collapseBtn.classList.add('expanded')
    subtaskList.classList.toggle('hidden', isCollapsed)

    task.children.forEach(child => subtaskList.appendChild(renderTask(child)))

    collapseBtn.addEventListener('click', () => {
      if (state.collapsed.has(task.id)) {
        state.collapsed.delete(task.id)
        collapseBtn.classList.add('expanded')
        subtaskList.classList.remove('hidden')
      } else {
        state.collapsed.add(task.id)
        collapseBtn.classList.remove('expanded')
        subtaskList.classList.add('hidden')
      }
    })
  }

  // 完了ボタン（handleToggleDoneはTask 11で実装される）
  if (task.done) doneBtn.textContent = '✓'
  doneBtn.addEventListener('click', () => handleToggleDone(task))

  // メニューボタン（長押しと同等）
  menuBtn.addEventListener('click', () => openContextMenu(task.id))

  // Mac: Tabキーでサブタスク作成モード
  li.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      state.pendingParentId = task.id
      taskInput.placeholder = `「${task.text}」のサブタスクを入力…`
      taskInput.focus()
    }
  })

  // iPhone: 長押しメニュー
  let longPressTimer
  li.addEventListener('touchstart', () => {
    longPressTimer = setTimeout(() => openContextMenu(task.id), 500)
  })
  li.addEventListener('touchend', () => clearTimeout(longPressTimer))
  li.addEventListener('touchmove', () => clearTimeout(longPressTimer))

  return li
}
```

- [ ] **Step 2: supabase.jsのURL/Keyを実際の値に更新**

`supabase.js` の2行を更新:
```js
const SUPABASE_URL = '実際のProject URL'
const SUPABASE_ANON_KEY = '実際のAnon Key'
```

- [ ] **Step 3: ブラウザで動作確認**

```bash
python3 -m http.server 8080 --directory /Users/yuwatanabe/CC/99_tools/task
```

Magic Linkでログイン後、空のタスクリストが表示される。
Expected: エラーなし、フィルターバーに「全て」ボタンがある

- [ ] **Step 4: コミット**

```bash
git add app.js supabase.js
git commit -m "feat: add task rendering and tree display"
```

---

## Task 11: app.js — タスク追加・完了トグル

**Files:**
- Modify: `app.js`

- [ ] **Step 1: handleAddTask・handleToggleDone関数を追加**

`app.js` に追加（`init()` の前）:
```js
// ===== タスク追加 =====
async function handleAddTask() {
  const raw = taskInput.value.trim()
  if (!raw) return

  const { text, category } = parseTag(raw)
  const parent_id = state.pendingParentId ?? null

  taskInput.value = ''
  taskInput.placeholder = 'タスクを入力… (#カテゴリ)'
  state.pendingParentId = null

  const task = await addTask({ text, category, parent_id })
  state.tasks.push(task)
  renderTasks()
  taskInput.focus()
}

addBtn.addEventListener('click', handleAddTask)
taskInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAddTask()
  // ESCキーでサブタスクモードキャンセル
  if (e.key === 'Escape') {
    state.pendingParentId = null
    taskInput.placeholder = 'タスクを入力… (#カテゴリ)'
  }
})

// ===== 完了トグル =====
async function handleToggleDone(task) {
  const newDone = !task.done
  const updates = {
    done: newDone,
    done_at: newDone ? new Date().toISOString() : null
  }
  await updateTask(task.id, updates)
  // ローカル状態を更新
  const t = state.tasks.find(t => t.id === task.id)
  if (t) Object.assign(t, updates)
  renderTasks()
}

// ===== 完了非表示トグル =====
hideDoneToggle.addEventListener('change', () => {
  state.hideDone = hideDoneToggle.checked
  renderTasks()
})
```

- [ ] **Step 2: 動作確認**

```bash
python3 -m http.server 8080 --directory /Users/yuwatanabe/CC/99_tools/task
```

1. テキストを入力してEnterを押す → タスクが追加される
2. タスクをクリック/タップ → 完了マークがつく
3. 「完了を非表示」チェック → 完了タスクが消える

- [ ] **Step 3: コミット**

```bash
git add app.js
git commit -m "feat: add task creation and done toggle"
```

---

## Task 12: app.js — コンテキストメニュー・削除

**Files:**
- Modify: `app.js`

- [ ] **Step 1: コンテキストメニュー関数を追加**

`app.js` に追加:
```js
// ===== コンテキストメニュー =====
let contextMenuTargetId = null

function openContextMenu(taskId) {
  contextMenuTargetId = taskId
  contextMenu.classList.remove('hidden')
}

function closeContextMenu() {
  contextMenu.classList.add('hidden')
  contextMenuTargetId = null
}

ctxSubtask.addEventListener('click', () => {
  if (!contextMenuTargetId) return
  const task = state.tasks.find(t => t.id === contextMenuTargetId)
  if (task) {
    state.pendingParentId = task.id
    taskInput.placeholder = `「${task.text}」のサブタスクを入力…`
    taskInput.focus()
  }
  closeContextMenu()
})

ctxDelete.addEventListener('click', async () => {
  if (!contextMenuTargetId) return
  await deleteTask(contextMenuTargetId)
  state.tasks = state.tasks.filter(t => t.id !== contextMenuTargetId)
  renderTasks()
  closeContextMenu()
})

ctxCancel.addEventListener('click', closeContextMenu)

// メニュー外タップで閉じる
document.addEventListener('click', e => {
  if (!contextMenu.classList.contains('hidden') && !contextMenu.contains(e.target)) {
    closeContextMenu()
  }
})
```

- [ ] **Step 2: スワイプ削除（iPhone）を追加**

`renderTask` 関数内、`return li` の直前に追加:
```js
  // スワイプ削除（左スワイプ）
  let touchStartX = 0
  li.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX }, { passive: true })
  li.addEventListener('touchend', async e => {
    const dx = e.changedTouches[0].clientX - touchStartX
    if (dx < -80) { // 80px以上左スワイプで削除
      li.classList.add('swipe-delete')
      setTimeout(async () => {
        await deleteTask(task.id)
        state.tasks = state.tasks.filter(t => t.id !== task.id)
        renderTasks()
      }, 200)
    }
  })
```

- [ ] **Step 3: 動作確認**

1. タスクの「⋯」ボタンをクリック → メニューが表示される
2. 「削除」をタップ → タスクが消える
3. 「サブタスクとして追加」→ 入力欄のplaceholderが変わる → テキスト入力 → サブタスクとして追加される
4. iPhoneエミュレーター（Chrome DevTools）で左スワイプ → 削除される

- [ ] **Step 4: コミット**

```bash
git add app.js
git commit -m "feat: add context menu, delete, and swipe-to-delete"
```

---

## Task 13: GitHub Pagesデプロイ

**Files:** なし（GitHubの設定）

- [ ] **Step 1: GitHubリポジトリ作成**

```bash
gh repo create task-pwa --public --source=/Users/yuwatanabe/CC/99_tools/task --remote=origin --push
```

または GitHub.com でリポジトリを作成後:
```bash
cd /Users/yuwatanabe/CC/99_tools/task
git remote add origin https://github.com/<USERNAME>/task-pwa.git
git push -u origin main
```

- [ ] **Step 2: GitHub Pagesを有効化**

```bash
gh api repos/<USERNAME>/task-pwa/pages \
  --method POST \
  -f source.branch=main \
  -f source.path=/
```

または GitHub.com > Settings > Pages > Branch: main / root

- [ ] **Step 3: デプロイURLを確認**

```bash
gh api repos/<USERNAME>/task-pwa/pages --jq '.html_url'
```

Expected: `https://<USERNAME>.github.io/task-pwa/`

- [ ] **Step 4: sw.jsのASSETSパスを修正**

GitHub PagesのサブパスでService Workerが動くよう、`sw.js` を更新:
```js
// GitHub Pagesのリポジトリ名に合わせる
const ASSETS = [
  '/task-pwa/',
  '/task-pwa/index.html',
  '/task-pwa/app.js',
  '/task-pwa/utils.js',
  '/task-pwa/supabase.js',
  '/task-pwa/style.css',
  '/task-pwa/manifest.json',
]
```

```bash
git add sw.js
git commit -m "fix: update service worker paths for GitHub Pages subpath"
git push
```

- [ ] **Step 5: iPhoneで動作確認**

1. iPhoneのSafariで `https://<USERNAME>.github.io/task-pwa/` を開く
2. 共有ボタン → 「ホーム画面に追加」
3. ホーム画面のアイコンをタップ → フルスクリーンでアプリが起動する
4. Magic Linkでログイン
5. タスクを追加 → MacのブラウザでリロードしてTaskが同期されていることを確認

---

## 検証チェックリスト

- [ ] `npm test` が全テスト通過（11件）
- [ ] iPhoneでホーム画面に追加してフルスクリーン起動
- [ ] MacのブラウザでPWA動作
- [ ] どちらかでタスク追加 → もう一方でリロードして同期確認
- [ ] 親子タスクの表示・折りたたみ
- [ ] `#カテゴリ` タグの自動抽出
- [ ] スワイプ削除（iPhone）
- [ ] オフラインで既存タスクが表示される
