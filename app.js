import { supabase, signInWithEmail, getSession, fetchTasks, addTask, updateTask, deleteTask } from './supabase.js'
import { parseTag, buildTree, filterTasks, getCategories, applySort } from './utils.js'

// ===== 状態 =====
let state = {
  tasks: [],              // DBから取得したフラットなタスク一覧
  filter: null,           // 現在のカテゴリフィルター（nullは全て）
  hideDone: false,        // 完了タスクを非表示
  expanded: new Set(),    // 展開中のタスクID
  pendingParentId: null,  // サブタスク追加時の親ID
  sortMode: localStorage.getItem('sortMode') || 'manual',
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
const ctxEdit = document.getElementById('ctx-edit')
const sortBtn = document.getElementById('sort-btn')
const sortMenu = document.getElementById('sort-menu')

// ===== 初期化 =====
async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/task-pwa/sw.js').catch(console.error)
  }

  document.body.classList.toggle('sort-auto', state.sortMode !== 'manual')
  const session = await getSession()
  if (session) {
    showApp()
  } else {
    showLogin()
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
    sendLinkBtn.disabled = false
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

// ===== タスク読み込み =====
async function loadTasks() {
  state.tasks = await fetchTasks()
  renderTasks()
}

// ===== 手動並び順（localStorage） =====

// Merges a new visible order into an existing stored order.
// Hidden items (in existing but not visible) stay in their relative positions.
// New visible items not yet in existing are appended at the end.
function mergeOrder(existingIds, visibleIds) {
  const visibleSet = new Set(visibleIds)
  const visibleQueue = [...visibleIds]
  const result = []
  for (const id of existingIds) {
    if (visibleSet.has(id)) {
      result.push(visibleQueue.shift())
    } else {
      result.push(id)
    }
  }
  result.push(...visibleQueue)
  return result
}

function saveManualOrder() {
  const existing = JSON.parse(localStorage.getItem('taskOrder') || '{}')
  const newOrder = { ...existing }

  const visibleRootIds = [...taskList.querySelectorAll(':scope > .task-item')].map(li => li.dataset.id)
  newOrder['root'] = mergeOrder(existing['root'] || [], visibleRootIds)

  document.querySelectorAll('.subtask-list').forEach(ul => {
    const parentId = ul.closest('.task-item')?.dataset.id
    if (parentId) {
      const visibleChildIds = [...ul.querySelectorAll(':scope > .task-item')].map(li => li.dataset.id)
      newOrder[parentId] = mergeOrder(existing[parentId] || [], visibleChildIds)
    }
  })

  localStorage.setItem('taskOrder', JSON.stringify(newOrder))
}

function applyManualOrder(nodes) {
  const order = JSON.parse(localStorage.getItem('taskOrder') || '{}')

  function sortLevel(tasks, key) {
    const ids = order[key]
    if (!ids) return tasks
    const sorted = ids.map(id => tasks.find(t => t.id === id)).filter(Boolean)
    const rest = tasks.filter(t => !ids.includes(t.id))
    return [...sorted, ...rest]
  }

  function recurse(tasks, key) {
    return sortLevel(tasks, key).map(task => ({
      ...task,
      children: recurse(task.children || [], task.id)
    }))
  }

  return recurse(nodes, 'root')
}

function handleDragEnd(evt) {
  const itemId = evt.item.dataset.id
  if (evt.from !== evt.to) {
    const newParentId = evt.to.id === 'task-list'
      ? null
      : evt.to.closest('.task-item')?.dataset.id ?? null
    updateTask(itemId, { parent_id: newParentId }).then(() => {
      const task = state.tasks.find(t => t.id === itemId)
      if (task) task.parent_id = newParentId
      saveManualOrder()
      renderTasks()
    }).catch(e => {
      console.error('親変更に失敗しました:', e)
      renderTasks()
    })
  } else {
    saveManualOrder()
  }
}

function attachSortable(ul) {
  const existing = Sortable.get(ul)
  if (existing) existing.destroy()
  Sortable.create(ul, {
    group: 'tasks',
    handle: '.drag-handle',
    animation: 150,
    fallbackOnBody: true,
    swapThreshold: 0.65,
    delayOnTouchOnly: true,
    delay: 150,
    onEnd: handleDragEnd,
  })
}

// ===== 描画 =====
function sortTreeNodes(nodes, mode) {
  if (mode === 'manual') return applyManualOrder(nodes)
  const sorted = applySort(nodes, mode)
  return sorted.map(task => ({
    ...task,
    children: sortTreeNodes(task.children || [], mode)
  }))
}

function renderTasks() {
  const filtered = filterTasks(state.tasks, state.filter)
  const visible = state.hideDone ? filtered.filter(t => !t.done) : filtered

  renderFilterBar(getCategories(state.tasks))

  const tree = buildTree(visible)
  const sorted = sortTreeNodes(tree, state.sortMode)
  taskList.innerHTML = ''
  sorted.forEach(task => taskList.appendChild(renderTask(task)))

  if (state.sortMode === 'manual') {
    attachSortable(taskList)
    document.querySelectorAll('.subtask-list').forEach(ul => attachSortable(ul))
  }
}

function renderFilterBar(categories) {
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

  if (!task.children || task.children.length === 0) {
    collapseBtn.dataset.noChildren = '1'
  } else {
    const isExpanded = state.expanded.has(task.id)
    if (isExpanded) collapseBtn.classList.add('expanded')
    subtaskList.classList.toggle('hidden', !isExpanded)
    task.children.forEach(child => subtaskList.appendChild(renderTask(child)))

    collapseBtn.addEventListener('click', () => {
      if (state.expanded.has(task.id)) {
        state.expanded.delete(task.id)
        collapseBtn.classList.remove('expanded')
        subtaskList.classList.add('hidden')
      } else {
        state.expanded.add(task.id)
        collapseBtn.classList.add('expanded')
        subtaskList.classList.remove('hidden')
      }
    })
  }

  if (task.done) doneBtn.textContent = '✓'
  doneBtn.addEventListener('click', () => handleToggleDone(task))

  menuBtn.addEventListener('click', e => {
    e.stopPropagation()
    openContextMenu(task.id)
  })

  li.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      state.pendingParentId = task.id
      taskInput.placeholder = `「${task.text}」のサブタスクを入力…`
      taskInput.focus()
    }
  })

  // タッチ操作: 長押しメニュー + スワイプ削除
  let longPressTimer
  let touchStartX = 0

  li.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX
    longPressTimer = setTimeout(() => openContextMenu(task.id), 500)
  }, { passive: true })

  li.addEventListener('touchend', async e => {
    clearTimeout(longPressTimer)
    const dx = e.changedTouches[0].clientX - touchStartX
    if (dx < -80) {
      li.classList.add('swipe-delete')
      setTimeout(async () => {
        await deleteTask(task.id)
        state.tasks = state.tasks.filter(t => t.id !== task.id)
        renderTasks()
      }, 200)
    }
  })

  li.addEventListener('touchmove', () => clearTimeout(longPressTimer), { passive: true })

  return li
}

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
  const t = state.tasks.find(t => t.id === task.id)
  if (t) Object.assign(t, updates)
  renderTasks()
}

// ===== 完了非表示トグル =====
hideDoneToggle.addEventListener('change', () => {
  state.hideDone = hideDoneToggle.checked
  renderTasks()
})

// ===== ソート =====
sortBtn.addEventListener('click', e => {
  e.stopPropagation()
  sortMenu.classList.toggle('hidden')
  sortMenu.querySelectorAll('.sort-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === state.sortMode)
  })
})

sortMenu.querySelectorAll('.sort-option').forEach(btn => {
  btn.addEventListener('click', () => {
    state.sortMode = btn.dataset.sort
    localStorage.setItem('sortMode', state.sortMode)
    sortMenu.classList.add('hidden')
    document.body.classList.toggle('sort-auto', state.sortMode !== 'manual')
    renderTasks()
  })
})

document.addEventListener('click', e => {
  if (!sortMenu.classList.contains('hidden') && !sortMenu.contains(e.target) && e.target !== sortBtn) {
    sortMenu.classList.add('hidden')
  }
})

// ===== テキスト編集 =====
function startEdit(taskId) {
  const li = taskList.querySelector(`[data-id="${taskId}"]`)
  if (!li) return
  const span = li.querySelector('.task-text')
  const originalText = span.textContent
  const input = document.createElement('input')
  input.className = 'edit-input'
  input.value = originalText
  span.replaceWith(input)
  input.focus()
  input.select()

  let committed = false
  function commit() {
    if (committed) return
    committed = true
    const newText = input.value.trim()
    if (newText && newText !== originalText) {
      commitEdit(taskId, newText)
    } else {
      input.replaceWith(span)
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { committed = true; input.replaceWith(span) }
  })
  input.addEventListener('blur', commit)
}

async function commitEdit(taskId, newText) {
  try {
    await updateTask(taskId, { text: newText })
    const task = state.tasks.find(t => t.id === taskId)
    if (task) task.text = newText
    renderTasks()
  } catch (e) {
    console.error('編集に失敗しました:', e)
    renderTasks()
  }
}

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
  const id = contextMenuTargetId
  closeContextMenu()
  try {
    await deleteTask(id)
    state.tasks = state.tasks.filter(t => t.id !== id)
    renderTasks()
  } catch (e) {
    console.error('削除に失敗しました:', e)
  }
})

ctxEdit.addEventListener('click', () => {
  if (!contextMenuTargetId) return
  const id = contextMenuTargetId
  closeContextMenu()
  startEdit(id)
})

ctxCancel.addEventListener('click', closeContextMenu)

document.addEventListener('click', e => {
  if (!contextMenu.classList.contains('hidden') && !contextMenu.contains(e.target)) {
    closeContextMenu()
  }
})

init()
