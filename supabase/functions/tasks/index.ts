import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const API_KEY = Deno.env.get('API_KEY')!
const TASK_OWNER_USER_ID = Deno.env.get('TASK_OWNER_USER_ID')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function err(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  // 認証チェック
  const auth = req.headers.get('Authorization')
  if (!auth || auth !== `Bearer ${API_KEY}`) {
    return err('Unauthorized', 401)
  }

  const url = new URL(req.url)
  // /functions/v1/tasks または /functions/v1/tasks/:id
  const lastSegment = url.pathname.split('/').filter(Boolean).pop()
  const id = lastSegment !== 'tasks' ? lastSegment : undefined

  // GET /tasks — 全件取得
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) return err(error.message, 500)
    return json(data)
  }

  // POST /tasks — タスク追加
  if (req.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return err('Invalid JSON', 400)
    }
    if (!body.text || typeof body.text !== 'string') {
      return err('text is required', 400)
    }
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        text: body.text,
        category: body.category ?? null,
        parent_id: body.parent_id ?? null,
        user_id: TASK_OWNER_USER_ID,
      })
      .select()
      .single()
    if (error) return err(error.message, 500)
    return json(data, 201)
  }

  // PATCH /tasks/:id — タスク更新
  if (req.method === 'PATCH') {
    if (!id) return err('id is required', 400)
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return err('Invalid JSON', 400)
    }
    const updates: Record<string, unknown> = {}
    if (body.text !== undefined) updates.text = body.text
    if (body.done !== undefined) updates.done = body.done
    if (body.done_at !== undefined) updates.done_at = body.done_at
    if (body.parent_id !== undefined) updates.parent_id = body.parent_id
    if (Object.keys(updates).length === 0) return err('No fields to update', 400)

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') return err('Task not found', 404)
      return err(error.message, 500)
    }
    return json(data)
  }

  // DELETE /tasks/:id — タスク削除
  if (req.method === 'DELETE') {
    if (!id) return err('id is required', 400)
    // 存在チェック
    const { data: existing, error: selectError } = await supabase
      .from('tasks')
      .select('id')
      .eq('id', id)
      .single()
    if (selectError) {
      if (selectError.code === 'PGRST116') return err('Task not found', 404)
      return err(selectError.message, 500)
    }

    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return err(error.message, 500)
    return new Response(null, { status: 204 })
  }

  return err('Method not allowed', 405)
})
