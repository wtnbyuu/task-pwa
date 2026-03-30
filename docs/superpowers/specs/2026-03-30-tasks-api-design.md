# タスク管理API — 設計仕様

## Context

既存のタスク管理PWA（GitHub Pages + Supabase）を外部から操作できるよう、REST APIを追加する。
用途：他のアプリ・サービスからの連携。使用者は自分のみ。

---

## アーキテクチャ

- **実装**: Supabase Edge Function（Deno）
- **ファイル**: `supabase/functions/tasks/index.ts`（新規追加のみ、既存コード変更なし）
- **URL**: `https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks`

既存の `supabase.js` はフロントエンド用としてそのまま維持する。Edge Function は Supabase Admin Client（`service_role` key）を使って直接DBを操作する。

---

## 認証

全リクエストに以下のヘッダーが必要：

```
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
```

Edge Function 側でヘッダーを検証し、不一致なら `401 Unauthorized` を返す。

---

## エンドポイント

### GET /functions/v1/tasks
全タスクを `created_at` 昇順で取得。

**Response 200:**
```json
[
  {
    "id": "uuid",
    "parent_id": null,
    "text": "メール返信",
    "category": "仕事",
    "done": false,
    "created_at": "2026-03-30T00:00:00Z",
    "done_at": null
  }
]
```

---

### POST /functions/v1/tasks
タスクを追加。`parent_id` を指定するとサブタスクになる。

**Request body:**
```json
{
  "text": "メール返信",
  "category": "仕事",
  "parent_id": null
}
```

- `text`: 必須
- `category`: 任意（null可）
- `parent_id`: 任意（null可、サブタスク化する場合に親タスクのUUIDを指定）

**Response 201:** 作成されたタスクオブジェクト

---

### PATCH /functions/v1/tasks/:id
タスクを更新。完了トグルは `done: true/false` で行う。

**Request body（すべて任意）:**
```json
{
  "text": "新しいテキスト",
  "done": true,
  "done_at": "2026-03-30T12:00:00Z",
  "parent_id": "parent-uuid"
}
```

- `done: true` にする場合、`done_at` に現在時刻を一緒に渡す
- `done: false` に戻す場合、`done_at: null` を一緒に渡す

**Response 200:** 更新後のタスクオブジェクト

---

### DELETE /functions/v1/tasks/:id
タスクを削除。子タスクは `ON DELETE CASCADE` により自動削除される。

**Response 204:** No content

---

## エラーレスポンス

| ステータス | 状況 |
|-----------|------|
| 400 | リクエストボディ不正（`text` 未指定など） |
| 401 | 認証ヘッダーなし or 不一致 |
| 404 | 指定IDのタスクが存在しない |
| 405 | 未対応のHTTPメソッド |
| 500 | Supabase内部エラー |

エラーレスポンス形式：
```json
{ "error": "エラーメッセージ" }
```

---

## 環境変数（Edge Function）

| 変数名 | 内容 |
|--------|------|
| `SUPABASE_SERVICE_ROLE_KEY` | 認証検証とAdmin Client用（Supabaseが自動注入） |
| `TASK_OWNER_USER_ID` | タスク作成時に使用するユーザーID（Supabase AuthのユーザーUUID） |

`TASK_OWNER_USER_ID` は Supabase Dashboard の Authentication → Users から確認できる。

---

## ファイル構成（追加分のみ）

```
task/
└── supabase/
    └── functions/
        └── tasks/
            └── index.ts   -- Edge Function本体
```

## 使用例（curl）

```bash
# 全取得
curl https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

# 追加
curl -X POST https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "メール返信", "category": "仕事"}'

# 完了トグル
curl -X PATCH https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks/<id> \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"done": true, "done_at": "2026-03-30T12:00:00Z"}'

# 削除
curl -X DELETE https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks/<id> \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```
