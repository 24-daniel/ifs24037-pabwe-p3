/**
 * RuangKu — Praktikum 3 (JavaScript)
 * Fitur: Tab (query URL), Expense Tracker, Bookmark Manager, Quiz App
 * Setiap fitur memakai key localStorage sendiri agar data tidak saling menimpa.
 */

/* ========== UTILITAS ========== */

/** Ambil satu elemen; lempar error jika tidak ada (membantu debug) */
function $(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Elemen tidak ditemukan: ${selector}`);
  return el;
}
const $all = (selector) => document.querySelectorAll(selector);

/** Buat elemen dengan class & teks (textContent = aman dari XSS) */
function createEl(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

/** Baca / simpan JSON ke localStorage */
function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
const saveData = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const formatRupiah = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const todayISO = () => new Date().toISOString().slice(0, 10);

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

/* ========== MODAL (<dialog>) ========== */

/** Tutup dialog lewat tombol [data-close] atau klik backdrop */
$all("dialog").forEach((dlg) => {
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
  });
});

/** Dialog hapus dipakai bersama; aksi hapus dikirim lewat callback */
const deleteDialog = $("#dlg-delete");
let pendingDelete = null;

function confirmDelete(label, onConfirm) {
  $("#delete-label").textContent = label;
  pendingDelete = onConfirm;
  deleteDialog.showModal();
}
$("#delete-confirm").addEventListener("click", () => {
  if (pendingDelete) pendingDelete();
  pendingDelete = null;
  deleteDialog.close();
});

/* ========== TAB (state di query string ?tab=) ========== */

const TABS = ["expense", "bookmark", "quiz"];
const DEFAULT_TAB = "expense";
const tabButtons = $all(".tab-btn");

function getTabFromUrl() {
  const tab = new URLSearchParams(location.search).get("tab");
  return TABS.includes(tab) ? tab : DEFAULT_TAB;
}

/** Tampilkan satu panel saja & tandai tombol aktif */
function renderTab(name) {
  TABS.forEach((key) => ($(`#panel-${key}`).hidden = key !== name));
  tabButtons.forEach((btn) => btn.setAttribute("aria-selected", String(btn.dataset.tab === name)));
}

function switchTab(name, pushHistory = true) {
  renderTab(name);
  if (pushHistory) {
    const url = new URL(location.href);
    url.searchParams.set("tab", name);
    history.pushState({ tab: name }, "", url);
  }
}

tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
window.addEventListener("popstate", () => renderTab(getTabFromUrl())); // tombol back/forward

/* ========== EXPENSE TRACKER ========== */

const EXPENSE_KEY = "pabwe-p3-expenses";
const CATEGORIES = ["Makan", "Transport", "Belanja", "Tagihan", "Hiburan", "Gaji", "Lainnya"];
let expenses = loadData(EXPENSE_KEY, []);
let editingExpenseId = null;

const expForm = $("#expense-form");
const expEditDialog = $("#dlg-expense-edit");
const expEditForm = $("#expense-edit-form");

/** Isi <select> kategori (form tambah, form ubah, filter) */
function fillCategoryOptions() {
  const options = (withAll) =>
    (withAll ? ['<option value="all">Semua kategori</option>'] : [])
      .concat(CATEGORIES.map((c) => `<option value="${c}">${c}</option>`))
      .join("");
  $("#exp-category").innerHTML = options(false);
  $("#ee-category").innerHTML = options(false);
  $("#exp-filter-category").innerHTML = options(true);
}

/** Validasi bersama untuk form tambah & ubah; return pesan error atau "" */
function validateExpense({ title, amount, date }) {
  if (!title) return "Judul wajib diisi.";
  if (amount === "" || !Number.isFinite(Number(amount)) || Number(amount) <= 0)
    return "Jumlah harus berupa angka lebih dari 0.";
  if (!date) return "Tanggal wajib diisi.";
  return "";
}

function renderExpenseSummary() {
  const sum = (type) => expenses.filter((e) => e.type === type).reduce((t, e) => t + e.amount, 0);
  const income = sum("income");
  const outcome = sum("expense");
  $("#sum-income").textContent = formatRupiah(income);
  $("#sum-expense").textContent = formatRupiah(outcome);
  $("#sum-balance").textContent = formatRupiah(income - outcome);
}

/** Filter + sort + render daftar transaksi */
function renderExpenses() {
  const query = $("#exp-search").value.trim().toLowerCase();
  const type = $("#exp-filter-type").value;
  const category = $("#exp-filter-category").value;
  const sort = $("#exp-sort").value;

  const items = expenses
    .filter((e) => e.title.toLowerCase().includes(query))
    .filter((e) => type === "all" || e.type === type)
    .filter((e) => category === "all" || e.category === category)
    .sort((a, b) => {
      if (sort === "oldest") return a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
      if (sort === "amount-desc") return b.amount - a.amount;
      if (sort === "amount-asc") return a.amount - b.amount;
      return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
    });

  const list = $("#exp-list");
  list.innerHTML = "";
  $("#exp-empty").hidden = expenses.length > 0;
  renderExpenseSummary();

  if (expenses.length > 0 && items.length === 0) {
    list.append(createEl("li", "py-6 text-center text-sm text-ink/60", "Tidak ada transaksi yang cocok."));
    return;
  }
  items.forEach((item) => list.append(buildExpenseItem(item)));
}

function buildExpenseItem(item) {
  const isIncome = item.type === "income";
  const li = createEl("li", "flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-3");

  const icon = createEl("span", `flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isIncome ? "bg-moss/15 text-moss" : "bg-clay/15 text-clay"}`);
  icon.innerHTML = `<i class="ti ${isIncome ? "ti-arrow-down-left" : "ti-arrow-up-right"}"></i>`;

  const info = createEl("div", "min-w-0 flex-1");
  const meta = createEl("div", "mt-0.5 flex flex-wrap items-center gap-1.5");
  meta.append(createEl("span", "badge", item.category), createEl("time", "text-xs text-ink/50", item.date));
  info.append(createEl("p", "truncate font-bold", item.title), meta);

  const amount = createEl("p", `shrink-0 text-sm font-bold sm:text-base ${isIncome ? "text-moss" : "text-clay"}`, `${isIncome ? "+" : "−"}${formatRupiah(item.amount)}`);

  const editBtn = createEl("button", "btn-mini");
  editBtn.type = "button";
  editBtn.setAttribute("aria-label", `Ubah ${item.title}`);
  editBtn.innerHTML = '<i class="ti ti-pencil"></i>';
  editBtn.addEventListener("click", () => openExpenseEdit(item.id));

  const delBtn = createEl("button", "btn-mini hover:!bg-rose-50 hover:!text-rose-700");
  delBtn.type = "button";
  delBtn.setAttribute("aria-label", `Hapus ${item.title}`);
  delBtn.innerHTML = '<i class="ti ti-trash"></i>';
  delBtn.addEventListener("click", () =>
    confirmDelete(`"${item.title}"`, () => {
      expenses = expenses.filter((e) => e.id !== item.id);
      saveData(EXPENSE_KEY, expenses);
      renderExpenses();
    })
  );

  li.append(icon, info, amount, editBtn, delBtn);
  return li;
}

function openExpenseEdit(id) {
  const item = expenses.find((e) => e.id === id);
  if (!item) return;
  editingExpenseId = id;
  $("#ee-title").value = item.title;
  $("#ee-type").value = item.type;
  $("#ee-category").value = item.category;
  $("#ee-amount").value = item.amount;
  $("#ee-date").value = item.date;
  showError($("#ee-error"), "");
  expEditDialog.showModal();
}

expForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#exp-title").value.trim(),
    type: $("#exp-type").value,
    category: $("#exp-category").value,
    amount: $("#exp-amount").value,
    date: $("#exp-date").value,
  };
  const error = validateExpense(data);
  showError($("#exp-error"), error);
  if (error) return;

  expenses.push({ ...data, amount: Number(data.amount), id: generateId(), createdAt: Date.now() });
  saveData(EXPENSE_KEY, expenses);
  expForm.reset();
  $("#exp-date").value = todayISO();
  renderExpenses();
});

expEditForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#ee-title").value.trim(),
    type: $("#ee-type").value,
    category: $("#ee-category").value,
    amount: $("#ee-amount").value,
    date: $("#ee-date").value,
  };
  const error = validateExpense(data);
  showError($("#ee-error"), error);
  if (error) return;

  expenses = expenses.map((x) => (x.id === editingExpenseId ? { ...x, ...data, amount: Number(data.amount) } : x));
  saveData(EXPENSE_KEY, expenses);
  expEditDialog.close();
  renderExpenses();
});

["#exp-search", "#exp-filter-type", "#exp-filter-category", "#exp-sort"].forEach((sel) => {
  $(sel).addEventListener("input", renderExpenses);
});

/* ========== BOOKMARK MANAGER ========== */

const BOOKMARK_KEY = "pabwe-p3-bookmarks";
let bookmarks = loadData(BOOKMARK_KEY, []);
let editingBookmarkId = null;

const bmForm = $("#bookmark-form");
const bmEditDialog = $("#dlg-bookmark-edit");
const bmEditForm = $("#bookmark-edit-form");

/** URL valid: diawali http:// atau https:// dan bisa di-parse */
function isValidUrl(value) {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function validateBookmark({ title, url, category }) {
  if (!title) return "Nama wajib diisi.";
  if (!isValidUrl(url)) return "URL harus diawali http:// atau https:// dan valid.";
  if (!category) return "Kategori wajib diisi.";
  return "";
}

function renderBookmarks() {
  const query = $("#bm-search").value.trim().toLowerCase();
  const sort = $("#bm-sort").value;

  const items = bookmarks
    .filter((b) => [b.title, b.url, b.category].some((f) => f.toLowerCase().includes(query)))
    .sort((a, b) => {
      if (sort === "title-asc") return a.title.localeCompare(b.title, "id");
      if (sort === "title-desc") return b.title.localeCompare(a.title, "id");
      return b.createdAt - a.createdAt;
    });

  const list = $("#bm-list");
  list.innerHTML = "";
  $("#bm-empty").hidden = bookmarks.length > 0;

  if (bookmarks.length > 0 && items.length === 0) {
    list.append(createEl("li", "col-span-full py-6 text-center text-sm text-ink/60", "Tidak ada bookmark yang cocok."));
    return;
  }
  items.forEach((item) => list.append(buildBookmarkCard(item)));
}

function buildBookmarkCard(item) {
  const li = createEl("li", "flex flex-col rounded-xl border border-ink/10 bg-white p-4");

  // Tautan dibuka di tab baru, aman dengan rel="noopener noreferrer"
  const link = createEl("a", "font-display text-lg font-bold leading-snug hover:text-clay", item.title);
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const host = createEl("a", "mt-0.5 truncate text-xs text-ink/50 hover:underline", item.url);
  host.href = item.url;
  host.target = "_blank";
  host.rel = "noopener noreferrer";

  li.append(createEl("span", "badge mb-2 self-start", item.category), link, host);
  if (item.note) li.append(createEl("p", "mt-2 text-sm text-ink/70", item.note));

  const actions = createEl("div", "mt-auto flex justify-end gap-1.5 pt-3");
  const editBtn = createEl("button", "btn-mini");
  editBtn.type = "button";
  editBtn.setAttribute("aria-label", `Ubah ${item.title}`);
  editBtn.innerHTML = '<i class="ti ti-pencil"></i>';
  editBtn.addEventListener("click", () => openBookmarkEdit(item.id));

  const delBtn = createEl("button", "btn-mini hover:!bg-rose-50 hover:!text-rose-700");
  delBtn.type = "button";
  delBtn.setAttribute("aria-label", `Hapus ${item.title}`);
  delBtn.innerHTML = '<i class="ti ti-trash"></i>';
  delBtn.addEventListener("click", () =>
    confirmDelete(`"${item.title}"`, () => {
      bookmarks = bookmarks.filter((b) => b.id !== item.id);
      saveData(BOOKMARK_KEY, bookmarks);
      renderBookmarks();
    })
  );
  actions.append(editBtn, delBtn);
  li.append(actions);
  return li;
}

function openBookmarkEdit(id) {
  const item = bookmarks.find((b) => b.id === id);
  if (!item) return;
  editingBookmarkId = id;
  $("#be-title").value = item.title;
  $("#be-url").value = item.url;
  $("#be-category").value = item.category;
  $("#be-note").value = item.note;
  showError($("#be-error"), "");
  bmEditDialog.showModal();
}

bmForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#bm-title").value.trim(),
    url: $("#bm-url").value.trim(),
    category: $("#bm-category").value.trim(),
    note: $("#bm-note").value.trim(),
  };
  const error = validateBookmark(data);
  showError($("#bm-error"), error);
  if (error) return;

  bookmarks.push({ ...data, id: generateId(), createdAt: Date.now() });
  saveData(BOOKMARK_KEY, bookmarks);
  bmForm.reset();
  renderBookmarks();
});

bmEditForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#be-title").value.trim(),
    url: $("#be-url").value.trim(),
    category: $("#be-category").value.trim(),
    note: $("#be-note").value.trim(),
  };
  const error = validateBookmark(data);
  showError($("#be-error"), error);
  if (error) return;

  bookmarks = bookmarks.map((b) => (b.id === editingBookmarkId ? { ...b, ...data } : b));
  saveData(BOOKMARK_KEY, bookmarks);
  bmEditDialog.close();
  renderBookmarks();
});

["#bm-search", "#bm-sort"].forEach((sel) => $(sel).addEventListener("input", renderBookmarks));

/* ========== QUIZ APP ========== */

const HIGHSCORE_KEY = "pabwe-p3-quiz-highscore";

/** Bank soal: array of object { question, options, answer (index) } */
const QUESTIONS = [
  { question: "Tag HTML5 yang tepat untuk navigasi utama situs adalah…", options: ["<div>", "<nav>", "<section>", "<aside>"], answer: 1 },
  { question: "Properti CSS untuk mengubah warna teks adalah…", options: ["font-color", "text-style", "color", "foreground"], answer: 2 },
  { question: "Method untuk memilih satu elemen dengan selector CSS adalah…", options: ["getElementByTag()", "querySelector()", "selectOne()", "findElement()"], answer: 1 },
  { question: "Hasil dari typeof [] di JavaScript adalah…", options: ["array", "list", "object", "undefined"], answer: 2 },
  { question: "Method untuk menyimpan data di localStorage adalah…", options: ["localStorage.setItem()", "localStorage.push()", "localStorage.save()", "localStorage.add()"], answer: 0 },
  { question: "Method array yang menghasilkan array baru berisi elemen yang lolos syarat adalah…", options: ["map()", "forEach()", "filter()", "find()"], answer: 2 },
];

const quizState = { index: 0, score: 0, answered: false };

const quizViews = { intro: $("#quiz-intro"), play: $("#quiz-play"), result: $("#quiz-result") };
const quizOptions = $("#quiz-options");
const quizNext = $("#quiz-next");

const getHighScore = () => Number(localStorage.getItem(HIGHSCORE_KEY)) || 0;

function showQuizView(name) {
  Object.entries(quizViews).forEach(([key, el]) => (el.hidden = key !== name));
}

function renderHighScore() {
  const best = localStorage.getItem(HIGHSCORE_KEY);
  $("#quiz-highscore").textContent = best === null ? "—" : `${best} / ${QUESTIONS.length}`;
}

function startQuiz() {
  Object.assign(quizState, { index: 0, score: 0, answered: false });
  showQuizView("play");
  renderQuestion();
}

/** Render soal aktif berdasarkan state */
function renderQuestion() {
  const current = QUESTIONS[quizState.index];
  quizState.answered = false;

  $("#quiz-progress").textContent = `Soal ${quizState.index + 1} dari ${QUESTIONS.length}`;
  $("#quiz-score").textContent = `Skor: ${quizState.score}`;
  $("#quiz-bar").style.width = `${(quizState.index / QUESTIONS.length) * 100}%`;
  $("#quiz-question").textContent = current.question;
  $("#quiz-feedback").textContent = "";
  quizNext.hidden = true;
  quizNext.textContent = quizState.index === QUESTIONS.length - 1 ? "Lihat hasil" : "Lanjut";

  quizOptions.innerHTML = "";
  current.options.forEach((text, i) => {
    const btn = createEl("button", "rounded-xl border border-ink/15 bg-white px-4 py-3 text-left font-medium transition hover:border-clay hover:bg-clay/5", `${String.fromCharCode(65 + i)}. ${text}`);
    btn.type = "button";
    btn.dataset.index = i;
    quizOptions.append(btn);
  });
}

/** Event delegation: satu listener untuk semua opsi */
quizOptions.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-index]");
  if (!btn || quizState.answered) return;

  quizState.answered = true;
  const chosen = Number(btn.dataset.index);
  const correct = QUESTIONS[quizState.index].answer;
  const isCorrect = chosen === correct;
  if (isCorrect) quizState.score++;

  [...quizOptions.children].forEach((b, i) => {
    b.disabled = true;
    b.classList.remove("hover:border-clay", "hover:bg-clay/5");
    if (i === correct) b.classList.add("border-moss", "bg-moss/15");
    else if (i === chosen) b.classList.add("border-rose-600", "bg-rose-50");
  });

  const feedback = $("#quiz-feedback");
  feedback.textContent = isCorrect ? "Benar! 🎉" : "Kurang tepat — jawaban benar ditandai hijau.";
  feedback.className = `mt-4 text-sm font-bold ${isCorrect ? "text-moss" : "text-rose-700"}`;
  $("#quiz-score").textContent = `Skor: ${quizState.score}`;
  quizNext.hidden = false;
  quizNext.focus();
});

quizNext.addEventListener("click", () => {
  if (quizState.index < QUESTIONS.length - 1) {
    quizState.index++;
    renderQuestion();
  } else {
    finishQuiz();
  }
});

function finishQuiz() {
  const { score } = quizState;
  const isNewRecord = score > getHighScore() || localStorage.getItem(HIGHSCORE_KEY) === null;
  if (isNewRecord) localStorage.setItem(HIGHSCORE_KEY, String(score));

  $("#quiz-final").textContent = `${score} / ${QUESTIONS.length}`;
  $("#quiz-message").textContent = isNewRecord
    ? "Rekor baru! Skor terbaik diperbarui."
    : `Skor terbaik kamu: ${getHighScore()} / ${QUESTIONS.length}. Coba lagi untuk menyalip!`;
  renderHighScore();
  showQuizView("result");
}

$("#quiz-start").addEventListener("click", startQuiz);
$("#quiz-restart").addEventListener("click", startQuiz);

/* ========== INISIALISASI ========== */

function init() {
  fillCategoryOptions();
  $("#exp-date").value = todayISO();
  renderExpenses();
  renderBookmarks();
  renderHighScore();
  showQuizView("intro");

  // Pulihkan tab dari query URL; normalisasi jika tidak valid / kosong
  const tab = getTabFromUrl();
  renderTab(tab);
  const url = new URL(location.href);
  if (url.searchParams.get("tab") !== tab) {
    url.searchParams.set("tab", tab);
    history.replaceState({ tab }, "", url);
  }
}

init();
