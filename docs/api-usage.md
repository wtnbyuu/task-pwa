# Tasks API 使い方

## 認証

全リクエストに以下のヘッダーを付ける：

```
Authorization: Bearer mysecretkey123
```

## ベースURL

```
https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks
```

---

## エンドポイント

### タスク一覧取得

```bash
curl "https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks" \
  -H "Authorization: Bearer mysecretkey123"
```

---

### タスク追加

```bash
curl -X POST "https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks" \
  -H "Authorization: Bearer mysecretkey123" \
  -H "Content-Type: application/json" \
  -d '{"text": "タスク名", "category": "カテゴリ"}'
```

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `text` | ✅ | タスクのテキスト |
| `category` | - | カテゴリ名（例: `"仕事"`） |
| `parent_id` | - | 親タスクのUUID（サブタスク作成時） |

---

### タスク更新

```bash
curl -X PATCH "https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks/<id>" \
  -H "Authorization: Bearer mysecretkey123" \
  -H "Content-Type: application/json" \
  -d '{"done": true, "done_at": "2026-03-31T00:00:00Z"}'
```

| フィールド | 説明 |
|-----------|------|
| `text` | テキスト変更 |
| `done` | 完了フラグ（`true` / `false`） |
| `done_at` | 完了日時（`done: true` なら現在時刻、`done: false` なら `null`） |
| `parent_id` | 親タスク変更 |

完了トグルの例：

```bash
# 完了にする
curl -X PATCH "https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks/<id>" \
  -H "Authorization: Bearer mysecretkey123" \
  -H "Content-Type: application/json" \
  -d "{\"done\": true, \"done_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

# 未完了に戻す
curl -X PATCH "https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks/<id>" \
  -H "Authorization: Bearer mysecretkey123" \
  -H "Content-Type: application/json" \
  -d '{"done": false, "done_at": null}'
```

---

### タスク削除

```bash
curl -X DELETE "https://glngwocguhzsunsoeoqb.supabase.co/functions/v1/tasks/<id>" \
  -H "Authorization: Bearer mysecretkey123"
```

子タスクも自動削除される。

---

## エラーレスポンス

```json
{ "error": "エラーメッセージ" }
```

| ステータス | 状況 |
|-----------|------|
| 400 | `text` 未指定、更新フィールドなし、不正JSON |
| 401 | 認証ヘッダーなし or キー不一致 |
| 404 | 指定IDのタスクが存在しない |
| 405 | 未対応のHTTPメソッド |
| 500 | DB内部エラー |
