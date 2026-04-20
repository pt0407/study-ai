// ============================================
// FIREBASE CONFIG
// Fill these in after creating your Firebase project.
// Leave empty to run without access enforcement (dev mode).
// ============================================
const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

// Optional: URL shown on the lock screen for purchasing access
const PURCHASE_LINK = '';

// ============================================
// LOCK SCREEN
// ============================================
let db = null;

function initFirebase() {
  if (!FIREBASE_CONFIG.projectId) return false; // dev mode
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    return true;
  } catch (e) {
    console.error('Firebase init failed:', e);
    return false;
  }
}

async function checkAccess() {
  const firebaseReady = initFirebase();

  // Set purchase link if provided
  if (PURCHASE_LINK) {
    const link = document.getElementById('getAccessLink');
    if (link) link.href = PURCHASE_LINK;
  }

  // Already unlocked on this browser → skip lock screen instantly
  if (localStorage.getItem('study_ai_unlocked') === 'true') {
    const ls = document.getElementById('lockScreen');
    if (ls) ls.style.display = 'none';
    return;
  }

  // No Firebase config → dev mode, bypass lock
  if (!firebaseReady) {
    const ls = document.getElementById('lockScreen');
    if (ls) ls.style.display = 'none';
    return;
  }

  // Lock screen stays visible — waiting for code entry
}

function formatAccessCode(input) {
  let raw = input.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (i === 4 || i === 8) out += '-';
    out += raw[i];
  }
  input.value = out;
}

async function submitAccessCode() {
  const input = document.getElementById('accessCodeInput');
  const btn = document.getElementById('unlockBtn');
  const errEl = document.getElementById('lockError');
  const okEl = document.getElementById('lockSuccess');

  const code = input.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (code.length < 8) {
    setLockError('Please enter a complete access code.');
    return;
  }

  if (!db) {
    setLockError('Access system not available. Contact support.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Verifying...';

  try {
    const ref = db.collection('codes').doc(code);
    const snap = await ref.get();

    if (!snap.exists) {
      setLockError('Invalid code. Please check and try again.');
      btn.disabled = false;
      btn.textContent = '🔓 Unlock Access';
      return;
    }

    if (snap.data().used) {
      setLockError('This code has already been used on another device.');
      btn.disabled = false;
      btn.textContent = '🔓 Unlock Access';
      return;
    }

    // Mark code as globally used
    await ref.update({
      used: true,
      usedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Permanently unlock this browser
    localStorage.setItem('study_ai_unlocked', 'true');

    // Animate success
    document.getElementById('lockIcon').textContent = '🔓';
    okEl.textContent = '✓ Access granted! Welcome to Study AI.';
    okEl.classList.remove('hidden');

    setTimeout(() => {
      const ls = document.getElementById('lockScreen');
      ls.style.transition = 'opacity 0.5s ease';
      ls.style.opacity = '0';
      setTimeout(() => { ls.style.display = 'none'; }, 500);
    }, 800);

  } catch (e) {
    setLockError('Connection error. Check your internet and try again.');
    btn.disabled = false;
    btn.textContent = '🔓 Unlock Access';
  }
}

function setLockError(msg) {
  const el = document.getElementById('lockError');
  el.textContent = msg;
  el.classList.remove('hidden');
  const icon = document.getElementById('lockIcon');
  icon.classList.add('shake');
  setTimeout(() => icon.classList.remove('shake'), 600);
}

// ============================================
// STATE
// ============================================
const DEFAULT_API_KEY = [8,28,4,48,40,13,0,13,21,32,56,1,58,45,88,24,44,44,88,43,23,33,57,54,56,40,11,22,13,92,41,54,21,28,38,62,12,62,56,31,34,2,40,40,8,6,30,4,42,60,4,5,13,41,44,26].map(c=>String.fromCharCode(c^111)).join('');
let apiKey = localStorage.getItem('groq_api_key') || DEFAULT_API_KEY;
let chatHistory = [];
let flashcards = [];
let currentFlashcardIndex = 0;
let isFlipped = false;
let quizData = [];
let quizAnswers = {};
let isGenerating = false;

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  marked.setOptions({ breaks: true, gfm: true });
  checkAccess();
  document.getElementById('apiModal').classList.add('hidden');
  showPanel('chat');
  updateKeyIndicator();
  initTabCloak();
});

// ============================================
// API KEY
// ============================================
function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) {
    showToast('Please enter a Groq API key', 'error');
    return;
  }
  if (!key.startsWith('gsk_')) {
    showToast('Key should start with gsk_ — check console.groq.com', 'error');
    return;
  }
  apiKey = key;
  localStorage.setItem('groq_api_key', key);
  document.getElementById('apiModal').classList.add('hidden');
  updateKeyIndicator();
  showToast('Your API key saved!', 'success');
}

function useDefaultKey() {
  apiKey = DEFAULT_API_KEY;
  localStorage.removeItem('groq_api_key');
  document.getElementById('apiKeyInput').value = '';
  document.getElementById('apiModal').classList.add('hidden');
  updateKeyIndicator();
  showToast('Using the default API key', 'success');
}

function changeApiKey() {
  const isCustom = localStorage.getItem('groq_api_key');
  document.getElementById('apiKeyInput').value = isCustom ? apiKey : '';
  document.getElementById('apiModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('apiModal').classList.add('hidden');
}

function updateKeyIndicator() {
  const isCustom = !!localStorage.getItem('groq_api_key');
  const el = document.getElementById('keyIndicator');
  if (!el) return;
  el.textContent = isCustom ? '🔑 Your Key' : '🔑 Default Key';
  el.className = isCustom
    ? 'text-xs text-green-400 font-medium'
    : 'text-xs text-gray-500 font-medium';
}

// ============================================
// TAB CLOAK
// ============================================
const CLOAKS = {
  none:      { title: 'Study AI \u2014 Powered by Groq',      icon: '' },
  google:    { title: 'Google',                              icon: 'https://www.google.com/favicon.ico' },
  classroom: { title: 'Home \u00b7 Google Classroom',        icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
  docs:      { title: 'Untitled document \u2014 Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  sheets:    { title: 'Untitled spreadsheet \u2014 Google Sheets', icon: 'https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico' },
  khan:      { title: 'Khan Academy',                        icon: 'https://cdn.kastatic.org/favicon.ico' },
  wikipedia: { title: 'Wikipedia',                           icon: 'https://en.wikipedia.org/favicon.ico' },
  desmos:    { title: 'Desmos | Graphing Calculator',        icon: 'https://www.desmos.com/favicon.ico' },
};

function applyTabCloak(value) {
  const cloak = CLOAKS[value] || CLOAKS.none;
  document.title = cloak.title;
  const favicon = document.getElementById('favicon');
  if (favicon) favicon.href = cloak.icon;
  localStorage.setItem('tab_cloak', value);
  const sel = document.getElementById('tabCloakSelect');
  if (sel) sel.value = value;
}

function initTabCloak() {
  const saved = localStorage.getItem('tab_cloak') || 'none';
  applyTabCloak(saved);
}

// ============================================
// NAVIGATION
// ============================================
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('panel-' + name).classList.remove('hidden');
  document.getElementById('nav-' + name).classList.add('active');
}

// ============================================
// GROQ API (with streaming)
// ============================================
async function callGroq(messages, onChunk = null) {
  if (!apiKey) {
    showToast('Please add your API key first', 'error');
    throw new Error('No API key');
  }

  const model = document.getElementById('modelSelect').value;
  const streaming = onChunk !== null;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      stream: streaming,
      max_tokens: 8192,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    let errMsg = 'API request failed';
    try {
      const err = await response.json();
      errMsg = err.error?.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  if (!streaming) {
    const data = await response.json();
    return data.choices[0].message.content;
  }

  // ---- Streaming ----
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const data = JSON.parse(line.slice(6));
        const delta = data.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onChunk(fullText);
        }
      } catch (_) {}
    }
  }

  return fullText;
}

// ============================================
// CHAT
// ============================================
async function sendChatMessage() {
  if (isGenerating) return;

  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  input.style.height = 'auto';

  const subject = document.getElementById('subjectContext').value.trim();
  appendChatMessage('user', message);
  chatHistory.push({ role: 'user', content: message });

  const msgId = appendChatMessage('ai', '');
  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  isGenerating = true;

  const systemContent = subject
    ? 'You are an expert AI tutor specializing in ' + subject + '. Provide clear, detailed, accurate explanations. Use markdown formatting — headings, bold, code blocks, lists — where helpful. Break down complex ideas.'
    : 'You are an expert AI tutor across all subjects. Provide clear, detailed, accurate explanations. Use markdown formatting — headings, bold, code blocks, lists — where helpful. Break down complex ideas.';

  try {
    const messages = [
      { role: 'system', content: systemContent },
      ...chatHistory
    ];

    let finalText = '';
    await callGroq(messages, (text) => {
      finalText = text;
      updateChatMessage(msgId, text, true);
    });

    chatHistory.push({ role: 'assistant', content: finalText });
    updateChatMessage(msgId, finalText, false);
  } catch (err) {
    updateChatMessage(msgId, '**Error:** ' + err.message, false);
    chatHistory.pop();
  }

  sendBtn.disabled = false;
  isGenerating = false;
  input.focus();
}

function appendChatMessage(role, content) {
  const container = document.getElementById('chatMessages');
  const id = 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const div = document.createElement('div');
  div.id = id;
  div.className = 'flex gap-3';

  if (role === 'user') {
    div.innerHTML =
      '<div class="flex-1 flex justify-end">' +
        '<div class="bg-purple-600 rounded-2xl rounded-tr-none p-4 max-w-3xl">' +
          '<p class="text-white text-sm whitespace-pre-wrap">' + escapeHtml(content) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">👤</div>';
  } else {
    div.innerHTML =
      '<div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">🧠</div>' +
      '<div class="bg-gray-800 rounded-2xl rounded-tl-none p-4 max-w-3xl flex-1 min-w-0">' +
        '<div class="prose-output text-gray-200 ai-content text-sm">' +
          '<span class="typing-cursor">▋</span>' +
        '</div>' +
      '</div>';
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function updateChatMessage(id, content, withCursor) {
  const el = document.getElementById(id);
  if (!el) return;
  const contentEl = el.querySelector('.ai-content');
  if (!contentEl) return;
  const cursor = withCursor ? '<span class="typing-cursor">▋</span>' : '';
  contentEl.innerHTML = marked.parse(content) + cursor;
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}

function clearChat() {
  chatHistory = [];
  document.getElementById('chatMessages').innerHTML =
    '<div class="flex gap-3">' +
      '<div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">🧠</div>' +
      '<div class="bg-gray-800 rounded-2xl rounded-tl-none p-4 max-w-3xl">' +
        '<p class="text-gray-200 text-sm leading-relaxed">Chat cleared! Ask me anything to continue studying.</p>' +
      '</div>' +
    '</div>';
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

// ============================================
// FLASHCARDS
// ============================================
async function generateFlashcards() {
  const text = document.getElementById('flashcardInput').value.trim();
  const count = parseInt(document.getElementById('flashcardCount').value) || 10;

  if (!text) { showToast('Please paste some text first', 'error'); return; }

  const btn = document.getElementById('generateFlashcardsBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  const prompt =
    'Create exactly ' + count + ' flashcards from the following text.\n' +
    'Return ONLY a valid JSON array, no extra text, no markdown code fences.\n' +
    'Format: [{"front":"question or term","back":"answer or definition"},...]\n\n' +
    'Text:\n' + text;

  try {
    const response = await callGroq([
      { role: 'system', content: 'You are a study assistant. Respond with valid JSON only — no markdown, no code fences, no extra text whatsoever.' },
      { role: 'user', content: prompt }
    ]);

    flashcards = parseJSON(response);
    if (!Array.isArray(flashcards) || flashcards.length === 0) throw new Error('Invalid response format');

    currentFlashcardIndex = 0;
    isFlipped = false;

    document.getElementById('flashcard-input-section').classList.add('hidden');
    document.getElementById('flashcard-display-section').classList.remove('hidden');

    renderFlashcard();
    renderFlashcardDots();
    showToast('Generated ' + flashcards.length + ' flashcards!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }

  btn.disabled = false;
  btn.innerHTML = '✨ Generate Flashcards';
}

function renderFlashcard() {
  const card = flashcards[currentFlashcardIndex];
  document.getElementById('flashcardFront').textContent = card.front;
  document.getElementById('flashcardBack').textContent = card.back;
  document.getElementById('flashcardProgress').textContent =
    'Card ' + (currentFlashcardIndex + 1) + ' of ' + flashcards.length;

  isFlipped = false;
  document.getElementById('flashcardInner').style.transform = 'rotateY(0deg)';

  document.querySelectorAll('.fc-dot').forEach((dot, i) => {
    dot.classList.toggle('bg-purple-500', i === currentFlashcardIndex);
    dot.classList.toggle('bg-gray-700', i !== currentFlashcardIndex);
  });
}

function renderFlashcardDots() {
  const container = document.getElementById('flashcardDots');
  container.innerHTML = '';
  const maxDots = Math.min(flashcards.length, 20);
  for (let i = 0; i < maxDots; i++) {
    const dot = document.createElement('div');
    dot.className = 'fc-dot w-2 h-2 rounded-full transition-colors cursor-pointer ' +
      (i === currentFlashcardIndex ? 'bg-purple-500' : 'bg-gray-700');
    const idx = i;
    dot.onclick = () => { currentFlashcardIndex = idx; renderFlashcard(); };
    container.appendChild(dot);
  }
}

function flipFlashcard() {
  isFlipped = !isFlipped;
  document.getElementById('flashcardInner').style.transform =
    isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
}

function nextFlashcard() {
  if (currentFlashcardIndex < flashcards.length - 1) {
    currentFlashcardIndex++;
    renderFlashcard();
  } else {
    showToast('You\'ve reached the last card!', 'info');
  }
}

function prevFlashcard() {
  if (currentFlashcardIndex > 0) {
    currentFlashcardIndex--;
    renderFlashcard();
  }
}

function shuffleFlashcards() {
  for (let i = flashcards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flashcards[i], flashcards[j]] = [flashcards[j], flashcards[i]];
  }
  currentFlashcardIndex = 0;
  renderFlashcard();
  renderFlashcardDots();
  showToast('Shuffled!', 'info');
}

function resetFlashcards() {
  document.getElementById('flashcard-input-section').classList.remove('hidden');
  document.getElementById('flashcard-display-section').classList.add('hidden');
}

function rateCard(difficulty) {
  const labels = { hard: '😓 Marked hard — keep reviewing!', medium: '🤔 Got it, keep going!', easy: '😊 Great, moving on!' };
  showToast(labels[difficulty], 'info');
  setTimeout(nextFlashcard, 400);
}

// ============================================
// QUIZ
// ============================================
async function generateQuiz() {
  const text = document.getElementById('quizInput').value.trim();
  const count = parseInt(document.getElementById('quizCount').value) || 5;
  const difficulty = document.getElementById('quizDifficulty').value;

  if (!text) { showToast('Please paste some text first', 'error'); return; }

  const btn = document.getElementById('generateQuizBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  const prompt =
    'Create exactly ' + count + ' multiple-choice quiz questions at ' + difficulty + ' difficulty from the text below.\n' +
    'Return ONLY a valid JSON array, no extra text, no markdown code fences.\n' +
    'Format: [{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"why correct"}]\n' +
    '"correct" is the 0-based index of the correct answer.\n\n' +
    'Text:\n' + text;

  try {
    const response = await callGroq([
      { role: 'system', content: 'You are a quiz generator. Respond with valid JSON only — no markdown, no code fences, no extra text.' },
      { role: 'user', content: prompt }
    ]);

    quizData = parseJSON(response);
    if (!Array.isArray(quizData) || quizData.length === 0) throw new Error('Invalid response format');

    quizAnswers = {};

    document.getElementById('quiz-input-section').classList.add('hidden');
    document.getElementById('quiz-display-section').classList.remove('hidden');
    document.getElementById('quizResult').classList.add('hidden');

    renderQuiz();
    showToast('Generated ' + quizData.length + ' questions!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }

  btn.disabled = false;
  btn.innerHTML = '✨ Generate Quiz';
}

function renderQuiz() {
  const container = document.getElementById('quizQuestions');
  container.innerHTML = '';

  quizData.forEach((q, qi) => {
    const div = document.createElement('div');
    div.className = 'bg-gray-800 border border-gray-700 rounded-2xl p-6';
    const optionsHtml = q.options.map((opt, oi) =>
      '<button onclick="selectAnswer(' + qi + ',' + oi + ')" id="opt-' + qi + '-' + oi + '" ' +
        'class="quiz-option w-full text-left px-4 py-3 rounded-xl border border-gray-600 text-gray-300 transition-all text-sm">' +
        '<span class="font-semibold mr-2">' + String.fromCharCode(65 + oi) + '.</span>' +
        escapeHtml(opt) +
      '</button>'
    ).join('');

    div.innerHTML =
      '<h3 class="font-semibold text-white mb-4 text-sm leading-relaxed">' +
        (qi + 1) + '. ' + escapeHtml(q.question) +
      '</h3>' +
      '<div class="space-y-2" id="options-' + qi + '">' + optionsHtml + '</div>' +
      '<div id="explanation-' + qi + '" class="hidden mt-4 p-4 bg-gray-900 rounded-xl text-sm text-gray-300 leading-relaxed"></div>';

    container.appendChild(div);
  });

  updateQuizScore();
}

function selectAnswer(qi, oi) {
  if (quizAnswers[qi] !== undefined) return;

  quizAnswers[qi] = oi;
  const correct = quizData[qi].correct;
  const explanation = quizData[qi].explanation;

  document.querySelectorAll('#options-' + qi + ' .quiz-option').forEach((opt, i) => {
    opt.disabled = true;
    if (i === correct) {
      opt.classList.add('border-green-500', 'bg-green-900/20', 'text-green-300');
    } else if (i === oi && oi !== correct) {
      opt.classList.add('border-red-500', 'bg-red-900/20', 'text-red-300');
    } else {
      opt.classList.add('opacity-50');
    }
  });

  const expEl = document.getElementById('explanation-' + qi);
  expEl.classList.remove('hidden');
  const isCorrect = oi === correct;
  expEl.innerHTML =
    '<span class="font-semibold ' + (isCorrect ? 'text-green-400' : 'text-red-400') + '">' +
      (isCorrect ? '✓ Correct!' : '✗ Incorrect.') +
    '</span> ' + escapeHtml(explanation);

  updateQuizScore();

  if (Object.keys(quizAnswers).length === quizData.length) {
    setTimeout(showQuizResult, 800);
  }
}

function updateQuizScore() {
  const answered = Object.keys(quizAnswers).length;
  const correct = Object.entries(quizAnswers).filter(([qi, oi]) => quizData[+qi].correct === oi).length;
  document.getElementById('quizScore').textContent =
    answered > 0 ? 'Score: ' + correct + '/' + answered + ' answered' : quizData.length + ' questions';
}

function showQuizResult() {
  const correct = Object.entries(quizAnswers).filter(([qi, oi]) => quizData[+qi].correct === oi).length;
  const total = quizData.length;
  const pct = Math.round((correct / total) * 100);

  const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : pct >= 40 ? '📚' : '💪';
  const title = pct >= 80 ? 'Excellent Work!' : pct >= 60 ? 'Good Job!' : pct >= 40 ? 'Keep Studying!' : 'Keep Practicing!';

  document.getElementById('quizResultEmoji').textContent = emoji;
  document.getElementById('quizResultTitle').textContent = title;
  document.getElementById('quizResultText').textContent =
    'You scored ' + correct + ' out of ' + total + ' (' + pct + '%)';

  const result = document.getElementById('quizResult');
  result.classList.remove('hidden');
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetQuiz() {
  document.getElementById('quiz-input-section').classList.remove('hidden');
  document.getElementById('quiz-display-section').classList.add('hidden');
}

// ============================================
// SUMMARIZE
// ============================================
async function summarizeText() {
  const text = document.getElementById('summarizeInput').value.trim();
  const format = document.getElementById('summarizeFormat').value;

  if (!text) { showToast('Please paste some text first', 'error'); return; }

  const btn = document.getElementById('summarizeBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Summarizing...';

  const formatPrompts = {
    concise: 'Write a concise, clear summary in 2-4 paragraphs capturing the main ideas.',
    bullet: 'Summarize using clear bullet points covering all key concepts, facts, and takeaways.',
    detailed: 'Create detailed study notes with markdown headings, key points, definitions, important details, and examples.',
    eli5: 'Explain this text simply, as if to someone with zero background. Use plain language, simple words, and helpful analogies.'
  };

  const outputEl = document.getElementById('summarizeOutput');
  const resultEl = document.getElementById('summarizeResult');
  outputEl.classList.remove('hidden');
  resultEl.innerHTML = '<span class="typing-cursor">▋</span>';

  try {
    await callGroq([
      { role: 'system', content: 'You are a study assistant that creates excellent summaries. Use markdown formatting.' },
      { role: 'user', content: formatPrompts[format] + '\n\nText:\n' + text }
    ], (chunk) => {
      resultEl.innerHTML = marked.parse(chunk) + '<span class="typing-cursor">▋</span>';
    });

    resultEl.innerHTML = resultEl.innerHTML.replace(/<span class="typing-cursor">▋<\/span>/g, '');
  } catch (err) {
    resultEl.innerHTML = '<span class="text-red-400">Error: ' + escapeHtml(err.message) + '</span>';
  }

  btn.disabled = false;
  btn.innerHTML = '✨ Summarize';
}

function copySummary() {
  const text = document.getElementById('summarizeResult').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'));
}

// ============================================
// STUDY PLAN
// ============================================
async function generateStudyPlan() {
  const subject = document.getElementById('studyplanSubject').value.trim();
  if (!subject) { showToast('Please enter a subject', 'error'); return; }

  const time = document.getElementById('studyplanTime').value;
  const hours = document.getElementById('studyplanHours').value;
  const level = document.getElementById('studyplanLevel').value;
  const goal = document.getElementById('studyplanGoal').value;
  const notes = document.getElementById('studyplanNotes').value.trim();

  const btn = document.getElementById('generatePlanBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  const prompt =
    'Create a detailed, actionable study plan:\n' +
    '- Subject: ' + subject + '\n' +
    '- Time available: ' + time + '\n' +
    '- Daily study time: ' + hours + '\n' +
    '- Current level: ' + level + '\n' +
    '- Goal: ' + goal + '\n' +
    (notes ? '- Notes: ' + notes + '\n' : '') +
    '\nInclude:\n' +
    '1. Phase/week breakdown with specific topics in learning order\n' +
    '2. Recommended free resources (websites, YouTube channels, books)\n' +
    '3. Practice exercises and projects\n' +
    '4. Review and milestone checkpoints\n' +
    '5. Subject-specific study tips\n' +
    '\nFormat with clear markdown headings and bullet points.';

  const outputEl = document.getElementById('studyplanOutput');
  const resultEl = document.getElementById('studyplanResult');
  outputEl.classList.remove('hidden');
  resultEl.innerHTML = '<span class="typing-cursor">▋</span>';

  try {
    await callGroq([
      { role: 'system', content: 'You are an expert educational coach. Create detailed, practical, motivating study plans.' },
      { role: 'user', content: prompt }
    ], (chunk) => {
      resultEl.innerHTML = marked.parse(chunk) + '<span class="typing-cursor">▋</span>';
    });

    resultEl.innerHTML = resultEl.innerHTML.replace(/<span class="typing-cursor">▋<\/span>/g, '');
  } catch (err) {
    resultEl.innerHTML = '<span class="text-red-400">Error: ' + escapeHtml(err.message) + '</span>';
  }

  btn.disabled = false;
  btn.innerHTML = '✨ Generate Study Plan';
}

function copyStudyPlan() {
  const text = document.getElementById('studyplanResult').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'));
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(text)));
  return div.innerHTML;
}

function parseJSON(raw) {
  let str = raw.trim();
  // Strip markdown code fences
  str = str.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  // Extract JSON array if buried in text
  const match = str.match(/\[[\s\S]*\]/);
  if (match) str = match[0];
  return JSON.parse(str);
}

function showToast(message, type) {
  const colors = { error: 'bg-red-700', success: 'bg-green-700', info: 'bg-gray-700' };
  const toast = document.createElement('div');
  toast.className =
    'fixed bottom-6 right-6 z-50 ' + (colors[type] || 'bg-gray-700') +
    ' text-white text-sm px-5 py-3 rounded-xl shadow-2xl transition-all opacity-0';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transition = 'opacity 0.2s ease';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}
