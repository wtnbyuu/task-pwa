import { supabase, signInWithEmail, getSession, fetchTasks, addTask, updateTask, deleteTask } from './supabase.js'
import { parseTag, buildTree, filterTasks, getCategories } from './utils.js'

// ===== 状態 =====
let state = {
  tasks: [],              // DBから取得したフラットなタスク一覧
  filter: null,           // 現在のカテゴリフィルター（nullは全て）
  hideDone: false,        // 完了タスクを非表示
  collapsed: new Set(),   // 折りたたみ中のタスクID
  pendingParentId: null,  // サブタスク追加時の親ID
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

// ===== 初期化 =====
async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  }

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

// ===== 描画 =====
function renderTasks() {
  const filtered = filterTasks(state.tasks, state.filter)
  const visible = state.hideDone ? filtered.filter(t => !t.done) : filtered

  renderFilterBar(getCategories(state.tasks))

  const tree = buildTree(visible)
  taskList.innerHTML = ''
  tree.forEach(task => taskList.appendChild(renderTask(task)))
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
    const isCollapsed = state.collapsed.has(task.id)
    if (!isCollapsed) collapseBtn.classList.add('expanded')
    subtaskList.classList.toggle('hidden', isCollapsed)
    task.children.forEach(child => subtaskList.appendChild(renderTask(child)))

    collapseBtn.addEventListener('click', () => {
      if (state.collapsed.has(task.id)) {
        state.collapsed.delete(task.id)
        collapseBtn.classList.add('expanded')
        subtaskList.classList.remove('hidden')
      } else {
        state.collapsed.add(task.id)
        collapseBtn.classList.remove('expanded')
        subtaskList.classList.add('hidden')
      }
    })
  }

  if (task.done) doneBtn.textContent = '✓'
  doneBtn.addEventListener('click', () => handleToggleDone(task))

  menuBtn.addEventListener('click', () => openContextMenu(task.id))

  li.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      state.pendingParentId = task.id
      taskInput.placeholder = `「${task.text}」のサブタスクを入力…`
      taskInput.focus()
    }
  })

  let longPressTimer
  li.addEventListener('touchstart', () => {
    longPressTimer = setTimeout(() => openContextMenu(task.id), 500)
  })
  li.addEventListener('touchend', () => clearTimeout(longPressTimer))
  li.addEventListener('touchmove', () => clearTimeout(longPressTimer))

  // スワイプ削除（左スワイプ）
  let touchStartX = 0
  li.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX }, { passive: true })
  li.addEventListener('touchend', async e => {
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
  await deleteTask(contextMenuTargetId)
  state.tasks = state.tasks.filter(t => t.id !== contextMenuTargetId)
  renderTasks()
  closeContextMenu()
})

ctxCancel.addEventListener('click', closeContextMenu)

document.addEventListener('click', e => {
  if (!contextMenu.classList.contains('hidden') && !contextMenu.contains(e.target)) {
    closeContextMenu()
  }
})

init()
