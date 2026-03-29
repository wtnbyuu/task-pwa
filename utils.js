/**
 * テキストから#タグを抽出し、{ text, category } を返す
 * @param {string} raw - ユーザー入力文字列
 * @returns {{ text: string, category: string|null }}
 */
export function parseTag(raw) {
  if (!raw) return { text: '', category: null }
  const match = raw.match(/#(\S+)/)
  const text = raw.replace(/#\S+/g, '').trim()
  return { text, category: match ? match[1] : null }
}

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
