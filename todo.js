// ── 순수 함수 (비즈니스 로직) ──────────────────────────────────────────────

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function addTodo(todos, text, priority = 'medium') {
  const trimmed = text.trim();
  if (!trimmed) return todos;
  return [...todos, {
    id: Date.now(),
    text: trimmed,
    completed: false,
    priority,
    createdAt: Date.now(),
  }];
}

function toggleTodo(todos, id) {
  return todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
}

function deleteTodo(todos, id) {
  return todos.filter(t => t.id !== id);
}

function setPriority(todos, id, priority) {
  return todos.map(t => t.id === id ? { ...t, priority } : t);
}

function sortTodos(todos) {
  return [...todos].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

// dragId 항목을 targetId 바로 앞으로 이동한다
function reorderTodo(todos, dragId, targetId) {
  const dragIdx = todos.findIndex(t => t.id === dragId);
  const targetIdx = todos.findIndex(t => t.id === targetId);
  if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return todos;
  const result = [...todos];
  const [dragged] = result.splice(dragIdx, 1);
  result.splice(result.findIndex(t => t.id === targetId), 0, dragged);
  return result;
}

function filterTodos(todos, filter) {
  if (filter === 'active') return todos.filter(t => !t.completed);
  if (filter === 'completed') return todos.filter(t => t.completed);
  return todos;
}

const STORAGE_KEY = 'todo-app-items';

function saveTodos(todos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function loadTodos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

// Jest(Node.js) 환경에서만 함수를 내보낸다
if (typeof module !== 'undefined') {
  module.exports = { addTodo, toggleTodo, deleteTodo, setPriority, sortTodos, reorderTodo, filterTodos, saveTodos, loadTodos };
}

// ── DOM 조작 (브라우저 전용) ───────────────────────────────────────────────

if (typeof document !== 'undefined') {
  // 기존 localStorage 데이터에 priority가 없으면 'medium'으로 초기화
  let todos = loadTodos().map(t => ({ priority: 'medium', ...t }));
  let currentFilter = 'all';
  let dragId = null;

  const input = document.getElementById('todo-input');
  const priorityInput = document.getElementById('priority-input');
  const addBtn = document.getElementById('add-btn');
  const list = document.getElementById('todo-list');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const countEl = document.getElementById('active-count');

  function render() {
    const sorted = sortTodos(filterTodos(todos, currentFilter));
    list.innerHTML = '';
    sorted.forEach(todo => {
      const li = document.createElement('li');
      li.className = `todo-item priority-${todo.priority}${todo.completed ? ' completed' : ''}`;
      li.dataset.id = todo.id;
      li.draggable = true;
      li.innerHTML = `
        <span class="material-icons drag-handle" title="드래그하여 같은 우선순위 내 순서 변경">drag_indicator</span>
        <input type="checkbox" class="todo-check" ${todo.completed ? 'checked' : ''} aria-label="완료 토글">
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        <select class="priority-select" aria-label="우선순위 변경">
          <option value="high"  ${todo.priority === 'high'   ? 'selected' : ''}>높음</option>
          <option value="medium"${todo.priority === 'medium' ? 'selected' : ''}>중간</option>
          <option value="low"   ${todo.priority === 'low'    ? 'selected' : ''}>낮음</option>
        </select>
        <button class="icon-btn delete-btn" aria-label="삭제">
          <span class="material-icons">close</span>
        </button>
      `;
      list.appendChild(li);
    });

    countEl.textContent = `${todos.filter(t => !t.completed).length}개 남음`;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function addAndRender() {
    todos = addTodo(todos, input.value, priorityInput.value);
    saveTodos(todos);
    input.value = '';
    render();
  }

  addBtn.addEventListener('click', addAndRender);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') addAndRender(); });

  // 우선순위 변경
  list.addEventListener('change', e => {
    if (!e.target.classList.contains('priority-select')) return;
    const id = Number(e.target.closest('.todo-item').dataset.id);
    todos = setPriority(todos, id, e.target.value);
    saveTodos(todos);
    render();
  });

  // 완료 토글 / 삭제
  list.addEventListener('click', e => {
    const li = e.target.closest('.todo-item');
    if (!li) return;
    const id = Number(li.dataset.id);
    if (e.target.classList.contains('todo-check')) {
      todos = toggleTodo(todos, id);
      saveTodos(todos);
      render();
    }
    if (e.target.classList.contains('delete-btn')) {
      todos = deleteTodo(todos, id);
      saveTodos(todos);
      render();
    }
  });

  // 필터
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      render();
    });
  });

  // ── Drag & Drop (같은 우선순위 내 순서 변경) ──────────────────────────────

  list.addEventListener('dragstart', e => {
    const li = e.target.closest('.todo-item');
    if (!li) return;
    dragId = Number(li.dataset.id);
    // 약간의 지연 후 dragging 클래스 추가 (즉시 추가 시 드래그 고스트에도 적용됨)
    requestAnimationFrame(() => li.classList.add('dragging'));
    e.dataTransfer.effectAllowed = 'move';
  });

  list.addEventListener('dragend', () => {
    list.querySelectorAll('.todo-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
    dragId = null;
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    const li = e.target.closest('.todo-item');
    if (!li || Number(li.dataset.id) === dragId) return;

    const dragTodo  = todos.find(t => t.id === dragId);
    const targetTodo = todos.find(t => t.id === Number(li.dataset.id));
    if (!dragTodo || !targetTodo || dragTodo.priority !== targetTodo.priority) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    e.dataTransfer.dropEffect = 'move';
    list.querySelectorAll('.todo-item').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
  });

  list.addEventListener('drop', e => {
    e.preventDefault();
    const li = e.target.closest('.todo-item');
    if (!li || dragId === null) return;

    const targetId = Number(li.dataset.id);
    if (targetId === dragId) return;

    const dragTodo  = todos.find(t => t.id === dragId);
    const targetTodo = todos.find(t => t.id === targetId);
    if (!dragTodo || !targetTodo || dragTodo.priority !== targetTodo.priority) return;

    todos = reorderTodo(todos, dragId, targetId);
    saveTodos(todos);
    render();
  });

  render();
}
