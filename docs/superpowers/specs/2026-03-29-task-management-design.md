# タスク管理PWAアプリ — 設計仕様

## Context
入力の面倒くさを解消し、Mac/iPhone両対応の「続けられる」タスク管理ツールを作る。
UX最優先。ホーム画面から最短でアクセスでき、即入力できることが最重要。

---

## アーキテクチャ
- **フロントエンド**: Vanilla HTML/CSS/JS（ES modules、ビルド不要）
- **バックエンド**: Supabase（PostgreSQL + Auth）
- **デプロイ**: GitHub Pages（無料）
- **同期**: iPhoneとMacで同じSupabaseアカウント → 自動データ共有

## データモデル
```sql
tasks
├── id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── parent_id   UUID REFERENCES tasks(id) ON DELETE CASCADE (nullable)
├── text        TEXT NOT NULL
├── category    TEXT (nullable)  -- "#仕事" などのタグから自動抽出
├── done        BOOLEAN DEFAULT false
├── created_at  TIMESTAMPTZ DEFAULT now()
└── done_at     TIMESTAMPTZ (nullable)
```

## UXルール
1. アプリ起動時に入力欄が自動フォーカス
2. Enter / 送信ボタンで即保存（確認なし）
3. `#カテゴリ名` を入力に含めると自動タグ付け（例: `メール返信 #仕事`）
4. タップ/クリック1回で完了トグル
5. 親タスクの完了は手動のみ
6. サブタスク: Mac=Tabキー、iPhone=長押しメニューからサブタスク化
7. 完了タスクは薄く表示、「完了を非表示」トグルあり
8. 削除は明示的スワイプ（誤削除防止）

## 画面構成
**iPhone（フルスクリーンPWA）**
```
┌─────────────────┐
│ ✏️ タスクを入力  │  ← 起動時フォーカス
│ [全て][仕事][個人]│
│ ○ 親タスクA     │
│   ○ サブタスク  │  ← インデント表示
│ ○ タスクB       │
│ ✓ 完了タスク    │  ← 薄く表示
└─────────────────┘
```

**Mac（ブラウザ or PWA）**
```
┌──────────────────────────────┐
│ ✏️ タスクを入力...   [追加]   │
│ [全て] [仕事] [個人]          │
│ ▶ ○ 親タスクA               │
│     ○ サブタスク             │
│   ○ タスクB                 │
│   ✓ 完了タスク               │
└──────────────────────────────┘
```

## ファイル構成
```
task/
├── index.html     -- メイン画面（全UI）
├── utils.js       -- 純粋関数（parseTag, buildTree, filterTasks）
├── supabase.js    -- DB操作・認証
├── app.js         -- UI制御・状態管理（utils + supabaseをimport）
├── style.css      -- レスポンシブ（iOS/Mac対応、ダークモード）
├── manifest.json  -- PWA設定
├── sw.js          -- Service Worker（オフラインキャッシュ）
└── tests/
    └── utils.test.js -- 純粋関数のユニットテスト
```

## 前提（ユーザーが事前に用意するもの）
- Supabaseアカウント（無料）: https://supabase.com
- GitHubアカウント（GitHub Pagesデプロイ用）
