// Конфигурация Supabase (только для аутентификации)
// Конфигурация Supabase (только для аутентификации)
const SUPABASE_URL = 'https://ckjhpswgahgivhdoqxav.supabase.co'; // ваш URL
const SUPABASE_ANON_KEY = 'sb_publishable_zAIDsj7x3R3NiXhix13TXA_-9oHjNjH'; // ваш ключ
const { createClient } = supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // ← переименовали в supabase

let currentUser = null;
let currentPage = 1;
const TOPICS_PER_PAGE = 5;
let currentTopicId = null;

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ru');
}

function updateAuthUI() {
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const welcomeUser = document.getElementById('welcomeUser');
  const replyForm = document.getElementById('replyFormBlock');
  const loginToReply = document.getElementById('loginToReply');
  const loginToCreate = document.getElementById('loginToCreate');
  const newTitle = document.getElementById('newTitle');
  const newContent = document.getElementById('newContent');

  if (currentUser) {
    loginBtn.style.display = 'none';
    registerBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    welcomeUser.textContent = currentUser.email;
    if (replyForm) replyForm.style.display = 'block';
    if (loginToReply) loginToReply.style.display = 'none';
    if (loginToCreate) loginToCreate.style.display = 'none';
    if (newTitle) newTitle.disabled = false;
    if (newContent) newContent.disabled = false;
  } else {
    loginBtn.style.display = 'inline-flex';
    registerBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    welcomeUser.textContent = '';
    if (replyForm) replyForm.style.display = 'none';
    if (loginToReply) loginToReply.style.display = 'block';
    if (loginToCreate) loginToCreate.style.display = 'block';
    if (newTitle) newTitle.disabled = true;
    if (newContent) newContent.disabled = true;
  }
}

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetId = 'view' + viewName.charAt(0).toUpperCase() + viewName.slice(1);
  document.getElementById(targetId).classList.add('active');
}

async function loadTopics(filter = 'latest', searchQuery = '') {
  let query = supabase.from('topics').select('*');

  if (filter === 'popular') {
    // популярность будем считать по количеству ответов, но в API нет агрегации.
    // Сделаем клиентскую сортировку после получения всех тем.
    query = query.order('created_at', { ascending: false });
  } else if (filter === 'unanswered') {
    // неэффективно, но для демо сойдёт: получим все, потом отфильтруем
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: topics, error } = await query;
  if (error) return showToast('Ошибка загрузки тем');

  // Получаем количество ответов для каждой темы (можно одним запросом с группировкой, но проще так)
  const topicsWithReplies = await Promise.all(topics.map(async (topic) => {
    const { count } = await supabase
      .from('replies')
      .select('*', { count: 'exact', head: true })
      .eq('topic_id', topic.id);
    return { ...topic, repliesCount: count || 0 };
  }));

  let filtered = topicsWithReplies;

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q));
  }

  if (filter === 'popular') {
    filtered.sort((a, b) => b.repliesCount - a.repliesCount);
  } else if (filter === 'unanswered') {
    filtered = filtered.filter(t => t.repliesCount === 0);
  }

  // Пагинация
  const totalPages = Math.ceil(filtered.length / TOPICS_PER_PAGE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * TOPICS_PER_PAGE;
  const pageTopics = filtered.slice(start, start + TOPICS_PER_PAGE);

  const container = document.getElementById('topicsList');
  container.innerHTML = pageTopics.map(t => `
    <div class="topic-item" data-id="${t.id}">
      <div>
        <strong style="color:var(--gold);">${escapeHTML(t.title)}</strong>
        <div style="font-size:0.85rem; color: var(--text-secondary);">
          ${escapeHTML(t.author)} · ${formatDate(t.created_at)} · ${t.repliesCount} ответов
        </div>
      </div>
      <span class="badge">${t.repliesCount} <i class="fas fa-comment"></i></span>
    </div>
  `).join('');

  document.querySelectorAll('.topic-item').forEach(item => {
    item.addEventListener('click', () => openTopic(item.dataset.id));
  });

  const pagination = document.getElementById('pagination');
  pagination.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    if (i === currentPage) btn.classList.add('active');
    btn.addEventListener('click', () => { currentPage = i; loadTopics(getCurrentFilter(), document.getElementById('searchInput').value); });
    pagination.appendChild(btn);
  }

  document.getElementById('totalTopics').textContent = filtered.length;
  document.getElementById('totalMessages').textContent = filtered.reduce((sum, t) => sum + t.repliesCount + 1, 0);

  const top = [...filtered].sort((a, b) => b.repliesCount - a.repliesCount).slice(0, 4);
  document.getElementById('popularTopicsSidebar').innerHTML = top.map(t => `
    <div style="margin-bottom:0.8rem; cursor:pointer;" class="topic-item" data-id="${t.id}">
      <span>${escapeHTML(t.title)}</span>
      <span class="badge">${t.repliesCount}</span>
    </div>
  `).join('');
  document.querySelectorAll('#popularTopicsSidebar .topic-item').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openTopic(el.dataset.id); });
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m];
  });
}

function getCurrentFilter() {
  const activeTab = document.querySelector('.tab-btn.active');
  return activeTab ? activeTab.dataset.tab : 'latest';
}

async function openTopic(id) {
  currentTopicId = id;
  const { data: topic } = await supabase.from('topics').select('*').eq('id', id).single();
  if (!topic) return;

  const { data: replies, error } = await supabase.from('replies').select('*').eq('topic_id', id).order('created_at', { ascending: true });
  if (error) return showToast('Ошибка загрузки ответов');

  document.getElementById('topicTitle').textContent = topic.title;
  document.getElementById('topicMeta').innerHTML = `Автор: ${escapeHTML(topic.author)} · ${formatDate(topic.created_at)} · ${replies.length} ответов`;
  document.getElementById('topicContent').innerHTML = `<p>${escapeHTML(topic.content)}</p>`;
  document.getElementById('repliesContainer').innerHTML = replies.map(r => `
    <div style="background:rgba(255,255,255,0.03); padding:1rem; border-radius:12px; margin-bottom:0.8rem;">
      <strong>${escapeHTML(r.author)}</strong> <span style="color:#94a3b8; font-size:0.8rem;">${formatDate(r.created_at)}</span>
      <p style="margin-top:0.5rem;">${escapeHTML(r.text)}</p>
    </div>
  `).join('');

  showView('topic');
  updateAuthUI();
}

async function createTopic() {
  if (!currentUser) return showToast('Войдите, чтобы создать тему');
  const title = document.getElementById('newTitle').value.trim();
  const content = document.getElementById('newContent').value.trim();
  if (!title || !content) return showToast('Заполните все поля');

  const { error } = await supabase.from('topics').insert([{ title, content, author: currentUser.email }]);
  if (error) return showToast('Ошибка: ' + error.message);

  document.getElementById('newTitle').value = '';
  document.getElementById('newContent').value = '';
  showView('home');
  currentPage = 1;
  await loadTopics(getCurrentFilter());
  showToast('Тема создана!');
}

async function addReply() {
  if (!currentUser) return showToast('Войдите, чтобы ответить');
  const text = document.getElementById('replyText').value.trim();
  if (!text) return showToast('Введите текст ответа');

  const { error } = await supabase.from('replies').insert([{
    topic_id: currentTopicId,
    text,
    author: currentUser.email
  }]);
  if (error) return showToast('Ошибка: ' + error.message);

  document.getElementById('replyText').value = '';
  await openTopic(currentTopicId);
  showToast('Ответ добавлен!');
}

async function login(email, password) {
  const { user, error } = await supabase.auth.signIn({ email, password });
  if (error) return showToast(error.message);
  currentUser = user;
  updateAuthUI();
  document.getElementById('authModal').classList.remove('active');
  showToast(`Добро пожаловать, ${user.email}!`);
  await loadTopics(getCurrentFilter());
}

async function register(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return showToast(error.message);
  document.getElementById('authModal').classList.remove('active');
  showToast('Регистрация успешна. Подтверждение почты можно отключить в настройках Supabase.');
}

async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  updateAuthUI();
  showToast('Вы вышли');
  await loadTopics(getCurrentFilter());
}

function showAuthModal(mode) {
  const modal = document.getElementById('authModal');
  const dialog = document.getElementById('authDialog');
  dialog.innerHTML = `
    <h2 style="color:var(--gold); margin-bottom:1.5rem;">${mode === 'login' ? 'Вход' : 'Регистрация'}</h2>
    <div class="form-group"><label>Email</label><input type="email" id="authEmail" placeholder="email@example.com"></div>
    <div class="form-group"><label>Пароль</label><input type="password" id="authPassword" placeholder="Пароль"></div>
    <button class="btn-primary" id="authSubmit">${mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
    <button class="close-modal" id="authClose">Отмена</button>
    <p style="margin-top:1rem; color:var(--text-secondary); cursor:pointer;" id="switchAuthMode">
      ${mode === 'login' ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите'}
    </p>
  `;
  modal.classList.add('active');

  const close = () => modal.classList.remove('active');
  document.getElementById('authClose').addEventListener('click', close);
  document.getElementById('switchAuthMode').addEventListener('click', () => { close(); showAuthModal(mode === 'login' ? 'register' : 'login'); });
  document.getElementById('authSubmit').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    if (!email || !password) return showToast('Заполните все поля');
    if (mode === 'login') await login(email, password);
    else await register(email, password);
  });
}

// ---------------------------------------
// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
  const session = supabase.auth.session();
  if (session) currentUser = session.user;
  updateAuthUI();
  await loadTopics('latest');

  document.getElementById('navHome').addEventListener('click', (e) => {
    e.preventDefault();
    showView('home');
    currentPage = 1;
    loadTopics(getCurrentFilter(), document.getElementById('searchInput').value);
  });
  document.getElementById('navNewTopic').addEventListener('click', (e) => {
    e.preventDefault();
    showView('newTopic');
    updateAuthUI();
  });
  document.getElementById('goToNewTopic').addEventListener('click', () => {
    showView('newTopic');
    updateAuthUI();
  });
  document.getElementById('backToHome').addEventListener('click', () => showView('home'));
  document.getElementById('backToHomeFromNew').addEventListener('click', () => showView('home'));

  document.getElementById('loginBtn').addEventListener('click', () => showAuthModal('login'));
  document.getElementById('registerBtn').addEventListener('click', () => showAuthModal('register'));
  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPage = 1;
      loadTopics(btn.dataset.tab, document.getElementById('searchInput').value);
    });
  });

  document.getElementById('searchButton').addEventListener('click', () => {
    currentPage = 1;
    loadTopics(getCurrentFilter(), document.getElementById('searchInput').value);
  });
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentPage = 1;
      loadTopics(getCurrentFilter(), e.target.value);
    }
  });

  document.getElementById('createTopicBtn').addEventListener('click', createTopic);
  document.getElementById('submitReply').addEventListener('click', addReply);

  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('authModal')) document.getElementById('authModal').classList.remove('active');
  });

  // Анимация слов
  const words = ["решения", "интеграции", "ошибки", "запросы", "аналитика"];
  let wordIndex = 0;
  const dynamicEl = document.getElementById('dynamicWord');
  setInterval(() => {
    dynamicEl.style.opacity = '0';
    setTimeout(() => {
      wordIndex = (wordIndex + 1) % words.length;
      dynamicEl.textContent = words[wordIndex];
      dynamicEl.style.opacity = '1';
    }, 300);
  }, 2500);

  // Смена темы
  document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('themeToggle').innerHTML = isDark
      ? '<i class="fas fa-sun"></i><span>Светлая</span>'
      : '<i class="fas fa-moon"></i><span>Тема</span>';
  });
});