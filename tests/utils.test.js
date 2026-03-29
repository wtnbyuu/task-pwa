import { describe, it, expect } from 'vitest'
import { parseTag, buildTree, filterTasks, getCategories } from '../utils.js'

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
