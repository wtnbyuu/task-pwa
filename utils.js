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
