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
  // ── Supabase 클라이언트 초기화 ────────────────────────────────────────
  const { createClient } = supabase;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── 상태 ───────────────────────────────────────────────────────────────
  let todos = [];
  let currentFilter = 'all';
  let dragId = null;

  // ── DOM 요소 참조 ──────────────────────────────────────────────────────
  const loginScreen   = document.getElementById('login-screen');
  const appScreen     = document.getElementById('app-screen');
  const emailInput    = document.getElementById('email-input');
  const passwordInput = document.getElementById('password-input');
  const loginBtn      = document.getElementById('login-btn');
  const signupBtn     = document.getElementById('signup-btn');
  const loginMsg      = document.getElementById('login-msg');
  const magicSection  = document.getElementById('magic-link-section');
  const magicBtn      = document.getElementById('magic-link-btn');
  const authTabs      = document.querySelectorAll('.auth-tab');
  const appBarAuth    = document.getElementById('app-bar-auth');
  const userEmailEl   = document.getElementById('user-email');
  const logoutBtn     = document.getElementById('logout-btn');
  const input         = document.getElementById('todo-input');
  const priorityInput = document.getElementById('priority-input');
  const addBtn        = document.getElementById('add-btn');
  const list          = document.getElementById('todo-list');
  const filterBtns    = document.querySelectorAll('.chip[data-filter]');
  const countEl       = document.getElementById('active-count');

  // ── 인증 상태 감지 ─────────────────────────────────────────────────────
  db.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      todos = [];
      userEmailEl.textContent = session.user.email;
      appBarAuth.hidden = false;
      loginScreen.hidden = true;
      appScreen.hidden = false;
      list.innerHTML = '<li class="loading-item"><span class="loading-spinner"></span>할 일을 불러오는 중...</li>';
      todos = await fetchTodos();
      render();
      input.focus();
    } else {
      // 앱 바 초기화
      appBarAuth.hidden = true;
      userEmailEl.textContent = '';
      // 앱 화면 전환
      loginScreen.hidden = false;
      appScreen.hidden = true;
      todos = [];
      // 폼 초기화
      emailInput.value = '';
      passwordInput.value = '';
      loginBtn.disabled = false;
      signupBtn.disabled = false;
      setMsg('');
      // 로그인 탭으로 복원
      authTabs.forEach(t => t.classList.remove('active'));
      authTabs[0].classList.add('active');
      loginBtn.hidden = false;
      signupBtn.hidden = true;
      magicSection.hidden = false;
      passwordInput.placeholder = '비밀번호';
    }
  });

  // ── 인증 헬퍼 ─────────────────────────────────────────────────────────
  function authError(msg) {
    const map = {
      'Invalid login credentials':     '이메일 또는 비밀번호가 올바르지 않습니다.',
      'Email not confirmed':           '이메일 인증이 필요합니다. 메일함을 확인해주세요.',
      'User already registered':       '이미 등록된 이메일입니다. 로그인 탭을 이용해주세요.',
      'Password should be at least 6': '비밀번호는 6자 이상이어야 합니다.',
      'rate limit':                    '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    };
    for (const [key, val] of Object.entries(map)) {
      if (msg.includes(key)) return val;
    }
    return msg;
  }

  function setMsg(text, type = '') {
    loginMsg.className = `login-msg${type ? ` login-msg--${type}` : ''}`;
    loginMsg.textContent = text;
  }

  // ── 탭 전환 (로그인 ↔ 회원가입) ──────────────────────────────────────
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      authTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      loginBtn.hidden            = !isLogin;
      signupBtn.hidden           = isLogin;
      magicSection.hidden        = !isLogin;
      passwordInput.placeholder  = isLogin ? '비밀번호' : '비밀번호 (6자 이상)';
      passwordInput.autocomplete = isLogin ? 'current-password' : 'new-password';
      setMsg('');
    });
  });

  // ── 로그인 (비밀번호) ──────────────────────────────────────────────────
  loginBtn.addEventListener('click', async () => {
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return;
    loginBtn.disabled = true;
    setMsg('로그인 중...');
    const { error } = await db.auth.signInWithPassword({ email, password });
    loginBtn.disabled = false;
    if (error) setMsg(authError(error.message), 'error');
  });

  // ── 회원가입 (비밀번호) ────────────────────────────────────────────────
  signupBtn.addEventListener('click', async () => {
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return;
    signupBtn.disabled = true;
    setMsg('회원가입 중...');
    const { error } = await db.auth.signUp({ email, password });
    signupBtn.disabled = false;
    if (error) {
      setMsg(authError(error.message), 'error');
    } else {
      setMsg('✓ 가입 완료! 확인 이메일을 발송했습니다. 메일함을 확인 후 로그인해주세요.', 'success');
    }
  });

  // ── 로그인 링크 (Magic Link) ───────────────────────────────────────────
  magicBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) return;
    magicBtn.disabled = true;
    setMsg('링크를 전송하는 중...');
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.href },
    });
    magicBtn.disabled = false;
    if (error) {
      setMsg(authError(error.message), 'error');
    } else {
      setMsg(`✓ ${email} 으로 로그인 링크를 발송했습니다. 메일함을 확인해주세요.`, 'success');
      emailInput.value = '';
    }
  });

  // Enter: 이메일 → 비밀번호 포커스, 비밀번호 → 현재 탭 액션 실행
  emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') passwordInput.focus(); });
  passwordInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const isLogin = [...authTabs].find(t => t.classList.contains('active'))?.dataset.tab === 'login';
    if (isLogin) loginBtn.click(); else signupBtn.click();
  });

  // ── 로그아웃 ───────────────────────────────────────────────────────────
  logoutBtn.addEventListener('click', () => db.auth.signOut());

  // ── Supabase DB 함수 ───────────────────────────────────────────────────
  async function fetchTodos() {
    const { data, error } = await db
      .from('todos')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) { console.error(error); return []; }
    return data;
  }

  async function insertTodo(text, priority) {
    const { data: { user } } = await db.auth.getUser();
    const maxOrder = todos.length
      ? Math.max(...todos.map(t => t.sort_order)) + 1
      : 0;
    const { error } = await db.from('todos').insert({
      text, priority,
      user_id: user.id,
      sort_order: maxOrder,
    });
    if (error) console.error(error);
  }

  async function updateCompleted(id, completed) {
    const { error } = await db.from('todos').update({ completed }).eq('id', id);
    if (error) console.error(error);
  }

  async function updatePriority(id, priority) {
    const { error } = await db.from('todos').update({ priority }).eq('id', id);
    if (error) console.error(error);
  }

  async function removeTodo(id) {
    const { error } = await db.from('todos').delete().eq('id', id);
    if (error) console.error(error);
  }

  async function reorderInDB(reordered) {
    await Promise.all(
      reordered.map((t, i) =>
        db.from('todos').update({ sort_order: i }).eq('id', t.id)
      )
    );
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────
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
    return str.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ── 이벤트: Todo 추가 ─────────────────────────────────────────────────
  async function addAndRender() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await insertTodo(text, priorityInput.value);
    todos = await fetchTodos();
    render();
  }

  addBtn.addEventListener('click', addAndRender);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') addAndRender(); });

  // ── 이벤트: 우선순위 변경 ─────────────────────────────────────────────
  list.addEventListener('change', async e => {
    if (!e.target.classList.contains('priority-select')) return;
    const id = e.target.closest('.todo-item').dataset.id;
    await updatePriority(id, e.target.value);
    todos = await fetchTodos();
    render();
  });

  // ── 이벤트: 체크박스 토글 / 삭제 ─────────────────────────────────────
  list.addEventListener('click', async e => {
    const li = e.target.closest('.todo-item');
    if (!li) return;
    const id = li.dataset.id;

    if (e.target.classList.contains('todo-check')) {
      const todo = todos.find(t => t.id === id);
      await updateCompleted(id, !todo.completed);
      todos = await fetchTodos();
      render();
    }
    if (e.target.closest('.delete-btn')) {
      await removeTodo(id);
      todos = await fetchTodos();
      render();
    }
  });

  // ── 이벤트: 필터 ──────────────────────────────────────────────────────
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      render();
    });
  });

  // ── Drag & Drop (같은 우선순위 내 순서 변경) ──────────────────────────

  list.addEventListener('dragstart', e => {
    const li = e.target.closest('.todo-item');
    if (!li) return;
    dragId = li.dataset.id;
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
    if (!li || li.dataset.id === dragId) return;

    const dragTodo   = todos.find(t => t.id === dragId);
    const targetTodo = todos.find(t => t.id === li.dataset.id);
    if (!dragTodo || !targetTodo || dragTodo.priority !== targetTodo.priority) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    list.querySelectorAll('.todo-item').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
  });

  list.addEventListener('drop', async e => {
    e.preventDefault();
    const li = e.target.closest('.todo-item');
    if (!li || dragId === null) return;

    const targetId = li.dataset.id;
    if (targetId === dragId) return;

    const dragTodo   = todos.find(t => t.id === dragId);
    const targetTodo = todos.find(t => t.id === targetId);
    if (!dragTodo || !targetTodo || dragTodo.priority !== targetTodo.priority) return;

    const reordered = reorderTodo(todos, dragId, targetId);
    todos = reordered;
    render();
    await reorderInDB(reordered);
    todos = await fetchTodos();
    render();
  });
}
