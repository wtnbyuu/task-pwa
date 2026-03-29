import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://glngwocguhzsunsoeoqb.supabase.co'       // 例: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsbmd3b2NndWh6c3Vuc29lb3FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3ODIyMTMsImV4cCI6MjA5MDM1ODIxM30.AMCuxMncE4DFJfAkX_dBc8gifOdQM5ZBjtdodogikoQ'

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
