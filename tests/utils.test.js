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
