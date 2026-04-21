// ============================================
// FIREBASE CONFIG
// Fill these in after creating your Firebase project.
// Leave empty to run without access enforcement (dev mode).
// ============================================
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCDxN4ZMtXkSP6Sm2jue4xlpuT0Hc7zzpo',
  authDomain: 'jaggieplatobackend.firebaseapp.com',
  projectId: 'jaggieplatobackend',
  storageBucket: 'jaggieplatobackend.firebasestorage.app',
  messagingSenderId: '978388681927',
  appId: '1:978388681927:web:b5ee926b51b83fa6092ae2'
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
  loadKeysFromFirestore();
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
// Groq default keys (each free account at console.groq.com gives one key)
const DEFAULT_API_KEYS = [
  [8,28,4,48,40,13,0,13,21,32,56,1,58,45,88,24,44,44,88,43,23,33,57,54,56,40,11,22,13,92,41,54,21,28,38,62,12,62,56,31,34,2,40,40,8,6,30,4,42,60,4,5,13,41,44,26].map(c=>String.fromCharCode(c^111)).join(''),
];
// Gemini default keys (aistudio.google.com/apikey)
const DEFAULT_GEMINI_KEYS = [
  [46,38,21,14,60,22,46,3,3,30,94,2,4,58,28,94,29,92,53,48,34,10,37,0,91,1,0,33,55,4,60,91,41,27,35,87,92,94,28].map(c=>String.fromCharCode(c^111)).join(''),
];
// Cerebras default keys (cloud.cerebras.ai)
const DEFAULT_CEREBRAS_KEYS = [
  [12,28,4,66,23,7,89,2,29,25,4,89,4,86,11,11,5,27,24,92,93,25,27,11,9,92,7,22,11,25,89,25,86,86,4,12,22,24,4,4,90,24,31,7,2,90,27,25,31,22,4,25].map(c=>String.fromCharCode(c^111)).join(''),
];

let defaultKeyIndex = 0;
let apiKey = localStorage.getItem('groq_api_key') || '';
let dynamicKeys = [];         // Groq — loaded from Firestore
let dynamicGeminiKeys = [];   // Gemini — loaded from Firestore
let dynamicCerebrasKeys = []; // Cerebras — loaded from Firestore

function getApiKey() {
  const custom = apiKey;
  if (custom) return custom;
  const all = [...dynamicKeys, ...DEFAULT_API_KEYS];
  return all[defaultKeyIndex % Math.max(all.length, 1)] || '';
}

function rotateDefaultKey() {
  const all = [...dynamicKeys, ...DEFAULT_API_KEYS];
  defaultKeyIndex = (defaultKeyIndex + 1) % Math.max(all.length, 1);
}

function getProviderKey(provId) {
  const custom = localStorage.getItem(PROVIDERS[provId]?.storageKey || '');
  if (custom) return custom;
  if (provId === 'groq')     { const all = [...dynamicKeys, ...DEFAULT_API_KEYS]; return all[defaultKeyIndex % Math.max(all.length,1)] || ''; }
  if (provId === 'gemini')   { const all = [...dynamicGeminiKeys, ...DEFAULT_GEMINI_KEYS]; return all[0] || ''; }
  if (provId === 'cerebras') { const all = [...dynamicCerebrasKeys, ...DEFAULT_CEREBRAS_KEYS]; return all[0] || ''; }
  return '';
}

function _decodeKeys(arr, prefix) {
  return arr.map(e => e.split(',').map(n => String.fromCharCode(parseInt(n) ^ 111)).join('')).filter(k => k.startsWith(prefix));
}

async function loadKeysFromFirestore() {
  if (!db) return;
  try {
    const [gDoc, gmDoc, cbDoc] = await Promise.all([
      db.collection('config').doc('keys').get(),
      db.collection('config').doc('gemini_keys').get(),
      db.collection('config').doc('cerebras_keys').get(),
    ]);
    if (gDoc.exists  && Array.isArray(gDoc.data().keys))  dynamicKeys         = _decodeKeys(gDoc.data().keys,  'gsk_');
    if (gmDoc.exists && Array.isArray(gmDoc.data().keys)) dynamicGeminiKeys   = _decodeKeys(gmDoc.data().keys, 'AIza');
    if (cbDoc.exists && Array.isArray(cbDoc.data().keys)) dynamicCerebrasKeys = _decodeKeys(cbDoc.data().keys, 'csk-');
  } catch (e) { console.warn('Dynamic keys unavailable:', e); }
}

// ============================================
// PROVIDER CONFIG
// ============================================
const PROVIDERS = {
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    storageKey: 'groq_api_key',
    keyPlaceholder: 'gsk_...',
    keyPrefix: 'gsk_',
    signupUrl: 'https://console.groq.com',
    signupLabel: 'console.groq.com (free)',
    models: [
      { value: 'llama-3.1-8b-instant',   label: 'Llama 3.1 8B (Fastest)' },
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Best)'   },
      { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B'           },
      { value: 'gemma2-9b-it',            label: 'Gemma 2 9B'             },
    ]
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    storageKey: 'openrouter_api_key',
    keyPlaceholder: 'sk-or-...',
    keyPrefix: 'sk-or-',
    signupUrl: 'https://openrouter.ai/keys',
    signupLabel: 'openrouter.ai/keys (free tier)',
    models: [
      { value: 'meta-llama/llama-3.3-70b-instruct:free',   label: 'Llama 3.3 70B (Free)'      },
      { value: 'google/gemini-2.0-flash-exp:free',          label: 'Gemini 2.0 Flash (Free)'   },
      { value: 'deepseek/deepseek-r1-distill-llama-70b:free', label: 'DeepSeek R1 70B (Free)' },
      { value: 'mistralai/mistral-7b-instruct:free',        label: 'Mistral 7B (Free)'         },
    ]
  },
  cerebras: {
    name: 'Cerebras',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    storageKey: 'cerebras_api_key',
    keyPlaceholder: 'csk-...',
    keyPrefix: 'csk-',
    signupUrl: 'https://cloud.cerebras.ai',
    signupLabel: 'cloud.cerebras.ai',
    models: [
      { value: 'llama3.1-8b', label: 'Llama 3.1 8B' },
      { value: 'llama3.3-70b', label: 'Llama 3.3 70B' },
    ]
  },
  gemini: {
    name: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    storageKey: 'gemini_api_key',
    keyPlaceholder: 'AIza...',
    keyPrefix: 'AIza',
    signupUrl: 'https://aistudio.google.com/apikey',
    signupLabel: 'aistudio.google.com (free)',
    models: [
      { value: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1.5-flash',   label: 'Gemini 1.5 Flash' },
      { value: 'gemini-1.5-pro',     label: 'Gemini 1.5 Pro'   },
    ]
  },
};
let currentProvider = localStorage.getItem('ai_provider') || 'groq';

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
  initProvider();
  updateKeyIndicator();
  initTabCloak();
  initAdmin();
  loadChatHistory();
  window.addEventListener('beforeunload', _flushAnalytics);
});

// ============================================
// PROVIDER + API KEY
// ============================================
function initProvider() {
  const saved = localStorage.getItem('ai_provider') || 'groq';
  currentProvider = PROVIDERS[saved] ? saved : 'groq';
  const sel = document.getElementById('providerSelect');
  if (sel) sel.value = currentProvider;
  updateModelOptions();
}

function changeProvider(prov) {
  if (!PROVIDERS[prov]) return;
  currentProvider = prov;
  localStorage.setItem('ai_provider', prov);
  const sel = document.getElementById('providerSelect');
  if (sel) sel.value = prov;
  updateModelOptions();
  updateKeyIndicator();
}

function updateModelOptions() {
  const prov = PROVIDERS[currentProvider];
  const select = document.getElementById('modelSelect');
  if (!select) return;
  const savedModel = localStorage.getItem('model_' + currentProvider);
  select.innerHTML = prov.models.map(m =>
    '<option value="' + m.value + '"' + (m.value === savedModel ? ' selected' : '') + '>' + m.label + '</option>'
  ).join('');
}

function saveModelChoice() {
  const val = document.getElementById('modelSelect')?.value;
  if (val) localStorage.setItem('model_' + currentProvider, val);
}

// Settings modal state
let _modalProvider = 'groq';

function changeApiKey() {
  _modalProvider = currentProvider;
  refreshSettingsModal();
  document.getElementById('apiModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('apiModal').classList.add('hidden');
}

function setModalProvider(prov) {
  _modalProvider = prov;
  refreshSettingsModal();
}

const _MODAL_STEPS = {
  groq: [
    { n: 1, text: 'Go to <a href="https://console.groq.com" target="_blank" class="text-purple-400 underline">console.groq.com</a> — free, no credit card' },
    { n: 2, text: 'Click <strong class="text-gray-200">API Keys</strong> in the left sidebar' },
    { n: 3, text: 'Click <strong class="text-gray-200">Create API Key</strong>, give it any name' },
    { n: 4, text: 'Copy the key (starts with <code class="bg-gray-800 px-1 rounded text-purple-300">gsk_</code>) and paste below' },
  ],
  openrouter: [
    { n: 1, text: 'Go to <a href="https://openrouter.ai/keys" target="_blank" class="text-purple-400 underline">openrouter.ai/keys</a> — free tier available' },
    { n: 2, text: 'Sign up or log in, then click <strong class="text-gray-200">Create Key</strong>' },
    { n: 3, text: 'Copy the key (starts with <code class="bg-gray-800 px-1 rounded text-purple-300">sk-or-</code>) and paste below' },
    { n: 4, text: 'Free models are marked <strong class="text-green-400">:free</strong> in the model dropdown — no billing needed' },
  ],
  cerebras: [
    { n: 1, text: 'Go to <a href="https://cloud.cerebras.ai" target="_blank" class="text-purple-400 underline">cloud.cerebras.ai</a> — free tier, very fast inference' },
    { n: 2, text: 'Sign up, then go to <strong class="text-gray-200">API Keys</strong> in the dashboard' },
    { n: 3, text: 'Click <strong class="text-gray-200">Generate New API Key</strong>' },
    { n: 4, text: 'Copy the key (starts with <code class="bg-gray-800 px-1 rounded text-purple-300">csk-</code>) and paste below' },
  ],
  gemini: [
    { n: 1, text: 'Go to <a href="https://aistudio.google.com/apikey" target="_blank" class="text-purple-400 underline">aistudio.google.com/apikey</a> — completely free' },
    { n: 2, text: 'Sign in with your Google account' },
    { n: 3, text: 'Click <strong class="text-gray-200">Create API Key</strong> → select any Google Cloud project' },
    { n: 4, text: 'Copy the key (starts with <code class="bg-gray-800 px-1 rounded text-purple-300">AIza</code>) and paste below' },
  ],
};

function refreshSettingsModal() {
  const prov = PROVIDERS[_modalProvider];
  Object.keys(PROVIDERS).forEach(p => {
    const tab = document.getElementById('tab-' + p);
    if (!tab) return;
    tab.className = 'provider-tab flex-1 py-2 rounded-lg text-xs font-semibold transition-all ' +
      (p === _modalProvider ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white');
  });

  // Free key notice: show for providers that have built-in defaults
  const hasDefaults = ['groq', 'gemini', 'cerebras'].includes(_modalProvider);
  const notice = document.getElementById('modalFreeKeyNotice');
  if (notice) notice.classList.toggle('hidden', !hasDefaults);

  // How-to steps
  const howTo = document.getElementById('modalHowTo');
  if (howTo) {
    const steps = _MODAL_STEPS[_modalProvider] || [];
    howTo.innerHTML = steps.length
      ? '<p class="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">How to get your own free key</p>' +
        steps.map(s =>
          '<div class="flex gap-2.5 items-start">' +
          '<span class="bg-purple-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">' + s.n + '</span>' +
          '<p class="text-gray-400 text-xs leading-relaxed">' + s.text + '</p>' +
          '</div>'
        ).join('')
      : '';
  }

  const label = document.getElementById('modalKeyLabel');
  if (label) label.textContent = prov.name + ' API Key' + (hasDefaults ? ' (optional)' : '');
  const existingKey = localStorage.getItem(prov.storageKey) || '';
  const input = document.getElementById('apiKeyInput');
  if (input) { input.value = existingKey; input.placeholder = prov.keyPlaceholder; }
  const resetBtn = document.getElementById('modalResetBtn');
  if (resetBtn) resetBtn.classList.toggle('hidden', !existingKey);
  const signupEl = document.getElementById('modalSignupLink');
  if (signupEl) signupEl.innerHTML = 'Get a free key → <a href="' + prov.signupUrl + '" target="_blank" class="text-purple-400 underline">' + prov.signupLabel + '</a>';
}

function saveProviderKeyModal() {
  const prov = PROVIDERS[_modalProvider];
  const key = (document.getElementById('apiKeyInput').value || '').trim();
  if (!key) { showToast('Please enter a key', 'error'); return; }
  localStorage.setItem(prov.storageKey, key);
  if (_modalProvider === 'groq') apiKey = key;
  changeProvider(_modalProvider);
  document.getElementById('apiModal').classList.add('hidden');
  showToast(prov.name + ' key saved!', 'success');
  updateKeyIndicator();
}

function resetProviderKeyModal() {
  const prov = PROVIDERS[_modalProvider];
  localStorage.removeItem(prov.storageKey);
  if (_modalProvider === 'groq') apiKey = '';
  document.getElementById('apiKeyInput').value = '';
  if (_modalProvider === currentProvider) updateKeyIndicator();
  showToast(prov.name + ' key removed', 'success');
  refreshSettingsModal();
}

function updateKeyIndicator() {
  const prov = PROVIDERS[currentProvider];
  const hasCustom = !!localStorage.getItem(prov?.storageKey || '');
  const hasDefault = ['groq','gemini','cerebras'].includes(currentProvider);
  const el = document.getElementById('keyIndicator');
  if (!el) return;
  const provName = prov?.name || 'Groq';
  el.textContent = hasCustom ? ('\ud83d\udd11 ' + provName + ' \u00b7 Your Key') : (hasDefault ? '\ud83d\udd11 ' + provName + ' \u00b7 Default' : '\ud83d\udd11 ' + provName + ' \u00b7 No Key');
  el.className = hasCustom ? 'text-xs text-green-400 font-medium' : (hasDefault ? 'text-xs text-gray-500 font-medium' : 'text-xs text-red-400 font-medium');
}

// ============================================
// ADMIN PANEL
// ============================================
// Admin URL: https://pt0407.github.io/study-ai/?admin=PLATO
const _ap = 'OTALLP'.split('').reverse().join('') + ''; // decoded at runtime only

let adminCodes = [];
let _platoRevealed = false;
let _genCodesRevealed = false;
let _allCodesRevealed = false;

function initAdmin() {
  const param = new URLSearchParams(window.location.search).get('admin');
  if (!param) return;
  // Decode stored admin password
  const pwd = [80,76,65,84,79].map(c => String.fromCharCode(c)).join('');
  if (param !== pwd) return;

  const panel = document.getElementById('adminPanel');
  if (!panel) return;
  panel.classList.remove('hidden');

  // Show Firebase status in admin panel
  const fbStatus = document.getElementById('adminFbStatus');
  if (db) {
    fbStatus.innerHTML = '<span class="text-green-400">✓ Connected to Firebase: <strong>' + FIREBASE_CONFIG.projectId + '</strong></span>';
  } else {
    fbStatus.innerHTML = '<span class="text-red-400">✗ Firebase not connected. Check FIREBASE_CONFIG in app.js.</span>';
  }
  adminLoadCodes();
  adminLoadKeys();
  adminLoadAnalytics();

  // Reset all reveal states on open
  _platoRevealed = false;
  _genCodesRevealed = false;
  _allCodesRevealed = false;
  const pwEl = document.getElementById('adminUrlPassword');
  if (pwEl) pwEl.classList.add('blur-sm', 'select-none');
  const platoBtn = document.getElementById('platoRevealBtn');
  if (platoBtn) platoBtn.textContent = '👁 Reveal';
  const genBtn = document.getElementById('genCodesRevealBtn');
  if (genBtn) genBtn.textContent = '👁 Reveal';
  const genList = document.getElementById('adminCodesList');
  if (genList) genList.classList.add('blur-sm');
  const allBtn = document.getElementById('allCodesRevealBtn');
  if (allBtn) allBtn.textContent = '👁 Reveal';
  const allList = document.getElementById('adminAllCodesList');
  if (allList) allList.classList.add('blur-sm');
}

function adminGenCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 12; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c.slice(0,4) + '-' + c.slice(4,8) + '-' + c.slice(8,12);
}

async function adminGenerateCodes() {
  if (!db) { alert('Firebase not connected.'); return; }
  const count = Math.min(500, Math.max(1, parseInt(document.getElementById('adminCodeCount').value) || 10));
  const btn = document.getElementById('adminGenBtn');
  const status = document.getElementById('adminGenStatus');
  btn.disabled = true;
  btn.textContent = '⏳ Uploading...';
  status.classList.add('hidden');

  adminCodes = [];
  // Firestore batch limit is 500
  const batch = db.batch();
  for (let i = 0; i < count; i++) {
    const raw = adminGenCode();
    const key = raw.replace(/-/g, '');
    adminCodes.push(raw);
    batch.set(db.collection('codes').doc(key), {
      used: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  try {
    await batch.commit();
    status.textContent = '✓ ' + count + ' codes uploaded!';
    status.className = 'text-sm text-green-400';
    status.classList.remove('hidden');

    const list = document.getElementById('adminCodesList');
    list.innerHTML = adminCodes.map(c => '<div>' + c + '</div>').join('');
    document.getElementById('adminCodesOutput').classList.remove('hidden');
    adminLoadCodes();
  } catch (e) {
    status.textContent = '✗ Upload failed: ' + e.message;
    status.className = 'text-sm text-red-400';
    status.classList.remove('hidden');
  }
  btn.disabled = false;
  btn.textContent = 'Generate & Upload';
}

function encodeApiKey(raw) {
  const key = (raw || '').trim();
  const out = document.getElementById('encodedKeyOutput');
  const txt = document.getElementById('encodedKeyText');
  const valid = document.getElementById('encodedKeyValid');

  if (!key) { out.classList.add('hidden'); return; }

  const encoded = key.split('').map(c => c.charCodeAt(0) ^ 111).join(',');
  const line = '[' + encoded + '].map(c=>String.fromCharCode(c^111)).join(\'\')';

  txt.textContent = line;
  out.classList.remove('hidden');

  if (key.startsWith('gsk_')) {
    valid.textContent = '✓ Valid Groq key format';
    valid.className = 'text-xs text-green-400';
  } else {
    valid.textContent = '⚠️ Key should start with gsk_ — double-check it';
    valid.className = 'text-xs text-yellow-400';
  }
}

let _lastEncodedKey = '';
function adminCopyKey() {
  const txt = document.getElementById('encodedKeyText').textContent;
  navigator.clipboard.writeText(txt)
    .then(() => showToast('Encoded key copied!', 'success'));
}

function adminCopyCodes() {
  navigator.clipboard.writeText(adminCodes.join('\n'))
    .then(() => showToast('Codes copied to clipboard!', 'success'));
}

async function adminLoadCodes() {
  if (!db) return;
  const btn = document.getElementById('adminLoadBtn');
  if (btn) btn.disabled = true;
  try {
    const snap = await db.collection('codes').get();
    const list = document.getElementById('adminAllCodesList');
    if (list) list.innerHTML = '';
    let total = 0, used = 0;
    snap.forEach(doc => {
      total++;
      const d = doc.data();
      if (d.used) used++;
      if (!list) return;
      const code = doc.id.slice(0,4) + '-' + doc.id.slice(4,8) + '-' + doc.id.slice(8,12);
      const usedAt = d.usedAt ? new Date(d.usedAt.toDate()).toLocaleDateString() : '—';
      const row = document.createElement('div');
      row.className = 'flex gap-6 items-center';
      row.innerHTML =
        '<span class="w-44 text-white">' + code + '</span>' +
        '<span class="w-24 ' + (d.used ? 'text-red-400' : 'text-green-400') + '">' + (d.used ? '✗ Used' : '✓ Available') + '</span>' +
        '<span class="text-gray-500">' + usedAt + '</span>';
      list.appendChild(row);
    });
    // Update stat cards
    const el = (id) => document.getElementById(id);
    if (el('statTotal')) el('statTotal').textContent = total;
    if (el('statUsed'))  el('statUsed').textContent  = used;
    if (el('statAvail')) el('statAvail').textContent = total - used;
    const fbStatus = el('adminFbStatus');
    if (fbStatus) fbStatus.innerHTML =
      '<span class="text-green-400">✓ Firebase connected: <strong>' + FIREBASE_CONFIG.projectId + '</strong></span>';
    const allCodes = el('adminAllCodes');
    if (allCodes) allCodes.classList.remove('hidden');
  } catch (e) {
    console.error('Admin load codes failed:', e);
  }
  if (btn) btn.disabled = false;
}

const _ADMIN_PROV_DOCS = { groq: 'keys', gemini: 'gemini_keys', cerebras: 'cerebras_keys' };
const _ADMIN_PROV_PREFIX = { groq: 'gsk_', gemini: 'AIza', cerebras: 'csk-' };

function _adminSelectedProv() {
  return document.getElementById('adminKeyProviderSelect')?.value || 'groq';
}

async function adminLoadKeys() {
  if (!db) return;
  const container = document.getElementById('adminKeysList');
  if (!container) return;
  const prov = _adminSelectedProv();
  const docId = _ADMIN_PROV_DOCS[prov];
  try {
    const doc = await db.collection('config').doc(docId).get();
    const keys = (doc.exists && Array.isArray(doc.data().keys)) ? doc.data().keys : [];
    container.innerHTML = keys.length === 0
      ? '<p class="text-gray-600 text-sm">No ' + prov + ' keys saved yet.</p>'
      : '';
    keys.forEach((encoded, i) => {
      const decoded = encoded.split(',').map(n => String.fromCharCode(parseInt(n) ^ 111)).join('');
      const masked = decoded.slice(0, 10) + '…' + decoded.slice(-4);
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5';
      row.innerHTML =
        '<span class="font-mono text-sm text-green-400">' + masked + '</span>' +
        '<button onclick="adminRemoveKey(' + i + ')" class="text-red-400 hover:text-red-300 text-xs px-3 py-1 rounded-lg hover:bg-red-900/20 transition-colors">✕ Remove</button>';
      container.appendChild(row);
    });
  } catch (e) {
    container.innerHTML = '<p class="text-red-400 text-sm">Error loading keys: ' + e.message + '</p>';
  }
}

async function adminAddKey() {
  const input = document.getElementById('adminNewKeyInput');
  const statusEl = document.getElementById('adminKeyStatus');
  const btn = document.getElementById('adminAddKeyBtn');
  const raw = (input.value || '').trim();
  const prov = _adminSelectedProv();
  const prefix = _ADMIN_PROV_PREFIX[prov];
  const docId  = _ADMIN_PROV_DOCS[prov];

  statusEl.classList.add('hidden');
  if (!raw.startsWith(prefix)) {
    statusEl.textContent = '⚠️ ' + (prov === 'groq' ? 'Groq' : prov === 'gemini' ? 'Gemini' : 'Cerebras') + ' key must start with ' + prefix;
    statusEl.className = 'text-sm text-yellow-400';
    statusEl.classList.remove('hidden'); return;
  }
  if (!db) { alert('Firebase not connected.'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Saving…';
  try {
    const encoded = raw.split('').map(c => c.charCodeAt(0) ^ 111).join(',');
    const doc = await db.collection('config').doc(docId).get();
    const existing = (doc.exists && Array.isArray(doc.data().keys)) ? doc.data().keys : [];
    await db.collection('config').doc(docId).set({ keys: [...existing, encoded] });
    input.value = '';
    statusEl.textContent = '✓ Key saved!';
    statusEl.className = 'text-sm text-green-400';
    statusEl.classList.remove('hidden');
    await loadKeysFromFirestore();
    await adminLoadKeys();
  } catch (e) {
    statusEl.textContent = '✗ Failed: ' + e.message;
    statusEl.className = 'text-sm text-red-400';
    statusEl.classList.remove('hidden');
  }
  btn.disabled = false;
  btn.textContent = '+ Add Key';
}

async function adminRemoveKey(index) {
  if (!db || !confirm('Remove this key?')) return;
  const prov = _adminSelectedProv();
  const docId = _ADMIN_PROV_DOCS[prov];
  try {
    const doc = await db.collection('config').doc(docId).get();
    const keys = (doc.exists && Array.isArray(doc.data().keys)) ? [...doc.data().keys] : [];
    keys.splice(index, 1);
    await db.collection('config').doc(docId).set({ keys });
    await loadKeysFromFirestore();
    await adminLoadKeys();
  } catch (e) { alert('Error: ' + e.message); }
}

async function adminLoadAnalytics() {
  if (!db) return;
  const container = document.getElementById('analyticsContent');
  if (!container) return;
  const days = parseInt(document.getElementById('analyticsRange')?.value || '7');
  const btn = document.getElementById('analyticsRefreshBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const docs = await Promise.all(dates.map(d => db.collection('analytics').doc(d).get()));

    const a = { qt:0, qc:0, qf:0, qq:0, qs:0, qsp:0, pg:0, por:0, pcb:0, pgm:0,
      tp:0, tc:0, te:0, et:0, erl:0, ch:0, ok:0, lms:0, ln:0, daily:[] };
    docs.forEach((doc, i) => {
      const d = doc.exists ? doc.data() : {};
      a.qt  += d.q?.total || 0;  a.qc  += d.q?.chat || 0;    a.qf  += d.q?.flashcard || 0;
      a.qq  += d.q?.quiz  || 0;  a.qs  += d.q?.summarize || 0; a.qsp += d.q?.studyplan || 0;
      a.pg  += d.p?.groq  || 0;  a.por += d.p?.openrouter || 0;
      a.pcb += d.p?.cerebras || 0; a.pgm += d.p?.gemini || 0;
      a.tp  += d.tok?.prompt || 0; a.tc += d.tok?.completion || 0; a.te += d.tok?.estimated || 0;
      a.et  += d.err?.total || 0; a.erl += d.err?.rl || 0;
      a.ch  += d.cache_hits || 0; a.ok += d.success || 0;
      a.lms += d.lat?.ms || 0;    a.ln += d.lat?.n || 0;
      a.daily.push({ date: dates[i].slice(5), q: d.q?.total || 0 });
    });

    const totalReq = a.qt + a.ch;
    const totalTok = a.tp + a.tc + (a.te > 0 && (a.tp + a.tc) === 0 ? a.te : 0);
    const avgLat = a.ln > 0 ? Math.round(a.lms / a.ln) : 0;
    const successRate = a.qt > 0 ? Math.round(a.ok / a.qt * 100) : 100;
    const cacheRate  = totalReq > 0 ? Math.round(a.ch / totalReq * 100) : 0;
    const maxDay = Math.max(...a.daily.map(d => d.q), 1);

    const stat = (label, val, sub = '', color = 'text-white') =>
      '<div class="bg-gray-850 border border-gray-700/50 rounded-xl p-4">' +
        '<p class="text-gray-500 text-xs mb-1 uppercase tracking-wide">' + label + '</p>' +
        '<p class="' + color + ' text-2xl font-bold leading-none">' + val + '</p>' +
        (sub ? '<p class="text-gray-600 text-xs mt-1.5 leading-snug">' + sub + '</p>' : '') +
      '</div>';

    const bar = (label, val, max, col = 'bg-purple-600') =>
      '<div class="flex items-center gap-2.5">' +
        '<span class="text-gray-400 text-xs w-20 shrink-0 truncate">' + label + '</span>' +
        '<div class="flex-1 bg-gray-700 rounded-full h-1.5">' +
          '<div class="' + col + ' h-1.5 rounded-full transition-all" style="width:' + (max>0?Math.min(Math.round(val/max*100),100):0) + '%"></div>' +
        '</div>' +
        '<span class="text-gray-300 text-xs w-8 text-right shrink-0">' + val + '</span>' +
      '</div>';

    const dailyBars = [...a.daily].reverse().map(d =>
      '<div class="flex-1 flex flex-col items-center gap-1 min-w-0">' +
        '<div class="w-full bg-purple-600 rounded-sm transition-all" style="height:' + (d.q > 0 ? Math.max(Math.round(d.q/maxDay*100),6) : 2) + '%; opacity:' + (d.q > 0 ? 1 : 0.2) + '"></div>' +
        '<span class="text-gray-600 text-[9px] truncate w-full text-center">' + d.date + '</span>' +
      '</div>'
    ).join('');

    const tokStr = totalTok > 0 ? totalTok.toLocaleString() : '—';
    const tokSub = a.tp > 0
      ? a.tp.toLocaleString() + ' in / ' + a.tc.toLocaleString() + ' out'
      : (a.te > 0 ? '~' + a.te.toLocaleString() + ' est.' : 'no data yet');

    container.innerHTML =
      '<div class="grid grid-cols-2 gap-3 mb-4">' +
        stat('Total Requests', totalReq.toLocaleString(), a.ch + ' served from cache') +
        stat('Tokens Used', tokStr, tokSub, totalTok > 0 ? 'text-blue-300' : 'text-gray-500') +
        stat('Success Rate', successRate + '%', a.ok + ' ok · ' + a.et + ' failed', successRate >= 90 ? 'text-green-400' : successRate >= 70 ? 'text-yellow-400' : 'text-red-400') +
        stat('Rate Limits', a.erl, a.erl > 0 ? 'auto-retried, keys rotated' : 'none — keys healthy ✓', a.erl > 5 ? 'text-yellow-400' : 'text-white') +
        stat('Cache Saves', cacheRate + '%', a.ch + ' requests skipped API call', 'text-cyan-400') +
        stat('Avg Latency', avgLat > 0 ? avgLat + ' ms' : '—', a.ln + ' calls measured') +
      '</div>' +
      (days > 1 ?
        '<div class="bg-gray-800 rounded-xl p-4 mb-4">' +
          '<p class="text-gray-500 text-xs uppercase tracking-wide mb-3">Queries / Day</p>' +
          '<div class="flex items-end gap-1 h-14">' + dailyBars + '</div>' +
        '</div>'
      : '') +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div class="bg-gray-800 rounded-xl p-4 space-y-2.5">' +
          '<p class="text-gray-500 text-xs uppercase tracking-wide mb-3">By Feature</p>' +
          bar('Chat',       a.qc,  a.qt, 'bg-purple-500') +
          bar('Flashcards', a.qf,  a.qt, 'bg-blue-500') +
          bar('Quiz',       a.qq,  a.qt, 'bg-green-500') +
          bar('Summarize',  a.qs,  a.qt, 'bg-yellow-500') +
          bar('Study Plan', a.qsp, a.qt, 'bg-pink-500') +
        '</div>' +
        '<div class="bg-gray-800 rounded-xl p-4 space-y-2.5">' +
          '<p class="text-gray-500 text-xs uppercase tracking-wide mb-3">By Provider</p>' +
          bar('Groq',       a.pg,  a.qt, 'bg-orange-500') +
          bar('Gemini',     a.pgm, a.qt, 'bg-blue-400') +
          bar('Cerebras',   a.pcb, a.qt, 'bg-cyan-500') +
          bar('OpenRouter', a.por, a.qt, 'bg-emerald-500') +
        '</div>' +
      '</div>';
  } catch (e) {
    container.innerHTML = '<p class="text-red-400 text-sm">Error: ' + e.message + '</p>';
  }
  if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
}

function togglePlatoReveal() {
  _platoRevealed = !_platoRevealed;
  const pw = document.getElementById('adminUrlPassword');
  const btn = document.getElementById('platoRevealBtn');
  if (_platoRevealed) {
    pw.classList.remove('blur-sm', 'select-none');
    btn.textContent = '🙈 Hide';
  } else {
    pw.classList.add('blur-sm', 'select-none');
    btn.textContent = '👁 Reveal';
  }
}

function copyAdminUrl() {
  const base = document.getElementById('adminUrlBase').textContent;
  const pw = document.getElementById('adminUrlPassword').textContent;
  navigator.clipboard.writeText(base + pw)
    .then(() => showToast('Admin URL copied!', 'success'));
}

function toggleGenCodesReveal() {
  _genCodesRevealed = !_genCodesRevealed;
  const list = document.getElementById('adminCodesList');
  const btn = document.getElementById('genCodesRevealBtn');
  if (_genCodesRevealed) {
    list.classList.remove('blur-sm');
    btn.textContent = '🙈 Hide';
  } else {
    list.classList.add('blur-sm');
    btn.textContent = '👁 Reveal';
  }
}

function toggleAllCodesReveal() {
  _allCodesRevealed = !_allCodesRevealed;
  const list = document.getElementById('adminAllCodesList');
  const btn = document.getElementById('allCodesRevealBtn');
  if (_allCodesRevealed) {
    list.classList.remove('blur-sm');
    btn.textContent = '🙈 Hide';
  } else {
    list.classList.add('blur-sm');
    btn.textContent = '👁 Reveal';
  }
}

// ============================================
// TAB CLOAK
// ============================================
const CLOAKS = {
  none:      { title: 'Study AI \u2014 Powered by Groq',      icon: '' },
  blank:     { title: '',                                    icon: '' },
  google:    { title: 'Google',                              icon: 'https://www.google.com/favicon.ico' },
  classroom: { title: 'Home \u00b7 Google Classroom',        icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
  docs:      { title: 'Untitled document \u2014 Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  sheets:    { title: 'Untitled spreadsheet \u2014 Google Sheets', icon: 'https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico' },
  khan:      { title: 'Khan Academy',                        icon: 'https://cdn.kastatic.org/favicon.ico' },
  wikipedia: { title: 'Wikipedia',                           icon: 'https://en.wikipedia.org/favicon.ico' },
  desmos:    { title: 'Desmos | Graphing Calculator',        icon: 'https://www.desmos.com/favicon.ico' },
};

function applyTabCloak(value) {
  localStorage.setItem('tab_cloak', value);
  const sel = document.getElementById('tabCloakSelect');
  if (sel) sel.value = value;

  if (value === 'blank') {
    const w = window.open('about:blank', '_blank');
    if (w) {
      w.document.write(
        '<!DOCTYPE html><html><head><title></title></head><body style="margin:0;padding:0;overflow:hidden;">' +
        '<iframe src="' + location.href.split('?')[0] + '" style="width:100vw;height:100vh;border:none;"></iframe>' +
        '</body></html>'
      );
      w.document.close();
    }
    return;
  }

  const cloak = CLOAKS[value] || CLOAKS.none;
  document.title = cloak.title;
  const favicon = document.getElementById('favicon');
  if (favicon) favicon.href = cloak.icon;
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
// ANALYTICS
// ============================================
const _agg = {
  q: { total:0, chat:0, flashcard:0, quiz:0, summarize:0, studyplan:0 },
  p: { groq:0, openrouter:0, cerebras:0, gemini:0 },
  tok: { prompt:0, completion:0, estimated:0 },
  err: { total:0, rate_limits:0 },
  cache_hits:0, success:0, lat_ms:0, lat_n:0,
};
let _aggFlushTimer = null;

function _inferContext(messages) {
  const s = (messages[0]?.content || '').toLowerCase();
  if (s.includes('flashcard')) return 'flashcard';
  if (s.includes('quiz') || s.includes('multiple-choice')) return 'quiz';
  if (s.includes('summari')) return 'summarize';
  if (s.includes('study plan') || s.includes('educational coach')) return 'studyplan';
  return 'chat';
}

function _analyticsTrack(event, d = {}) {
  if (event === 'query_start') {
    _agg.q.total++;
    const f = d.feature || 'chat';
    if (_agg.q[f] !== undefined) _agg.q[f]++;
    const p = d.provider || 'groq';
    if (_agg.p[p] !== undefined) _agg.p[p]++;
  } else if (event === 'query_success') {
    _agg.success++;
    if (d.latency_ms)        { _agg.lat_ms += d.latency_ms; _agg.lat_n++; }
    if (d.prompt_tokens)       _agg.tok.prompt     += d.prompt_tokens;
    if (d.completion_tokens)   _agg.tok.completion += d.completion_tokens;
    if (d.estimated_tokens)    _agg.tok.estimated  += d.estimated_tokens;
  } else if (event === 'rate_limit') {
    _agg.err.rate_limits++; _agg.err.total++;
  } else if (event === 'error') {
    _agg.err.total++;
  } else if (event === 'cache_hit') {
    _agg.cache_hits++; _agg.q.total++;
    const f = d.feature || 'chat';
    if (_agg.q[f] !== undefined) _agg.q[f]++;
  }
  if (!_aggFlushTimer) _aggFlushTimer = setTimeout(_flushAnalytics, 30000);
}

async function _flushAnalytics() {
  _aggFlushTimer = null;
  if (!db) return;
  const hasData = _agg.q.total > 0 || _agg.cache_hits > 0;
  if (!hasData) return;
  const today = new Date().toISOString().slice(0, 10);
  const inc = firebase.firestore.FieldValue.increment;
  const u = {};
  if (_agg.q.total)           u['q.total']       = inc(_agg.q.total);
  if (_agg.q.chat)            u['q.chat']        = inc(_agg.q.chat);
  if (_agg.q.flashcard)       u['q.flashcard']   = inc(_agg.q.flashcard);
  if (_agg.q.quiz)            u['q.quiz']        = inc(_agg.q.quiz);
  if (_agg.q.summarize)       u['q.summarize']   = inc(_agg.q.summarize);
  if (_agg.q.studyplan)       u['q.studyplan']   = inc(_agg.q.studyplan);
  if (_agg.p.groq)            u['p.groq']        = inc(_agg.p.groq);
  if (_agg.p.openrouter)      u['p.openrouter']  = inc(_agg.p.openrouter);
  if (_agg.p.cerebras)        u['p.cerebras']    = inc(_agg.p.cerebras);
  if (_agg.p.gemini)          u['p.gemini']      = inc(_agg.p.gemini);
  if (_agg.tok.prompt)        u['tok.prompt']    = inc(_agg.tok.prompt);
  if (_agg.tok.completion)    u['tok.completion']= inc(_agg.tok.completion);
  if (_agg.tok.estimated)     u['tok.estimated'] = inc(_agg.tok.estimated);
  if (_agg.err.total)         u['err.total']     = inc(_agg.err.total);
  if (_agg.err.rate_limits)   u['err.rl']        = inc(_agg.err.rate_limits);
  if (_agg.cache_hits)        u['cache_hits']    = inc(_agg.cache_hits);
  if (_agg.success)           u['success']       = inc(_agg.success);
  if (_agg.lat_ms)            u['lat.ms']        = inc(_agg.lat_ms);
  if (_agg.lat_n)             u['lat.n']         = inc(_agg.lat_n);
  try {
    await db.collection('analytics').doc(today).set(u, { merge: true });
    // Reset buffer after flush
    _agg.q={total:0,chat:0,flashcard:0,quiz:0,summarize:0,studyplan:0};
    _agg.p={groq:0,openrouter:0,cerebras:0,gemini:0};
    _agg.tok={prompt:0,completion:0,estimated:0};
    _agg.err={total:0,rate_limits:0};
    _agg.cache_hits=0; _agg.success=0; _agg.lat_ms=0; _agg.lat_n=0;
  } catch (e) { console.warn('Analytics flush failed:', e); }
}

// ============================================
// RESPONSE CACHE (localStorage + 24h TTL)
// ============================================
const _CACHE_TTL = 24 * 60 * 60 * 1000;
const _CACHE_MAX = 50;
const _CACHE_LS  = 'ai_response_cache';

function _cacheHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function _buildCacheKey(messages) {
  const last = messages.filter(m => m.role === 'user').pop()?.content || '';
  return _cacheHash(currentProvider + '|' + (document.getElementById('modelSelect')?.value || '') + '|' + last);
}

function _readCache() {
  try { return JSON.parse(localStorage.getItem(_CACHE_LS) || '{}'); } catch { return {}; }
}

function cacheGet(key) {
  const c = _readCache();
  const e = c[key];
  if (!e) return null;
  if (Date.now() - e.ts > _CACHE_TTL) { delete c[key]; try { localStorage.setItem(_CACHE_LS, JSON.stringify(c)); } catch {} return null; }
  return e.r;
}

function cacheSet(key, response) {
  const c = _readCache();
  c[key] = { r: response, ts: Date.now() };
  const keys = Object.keys(c);
  if (keys.length > _CACHE_MAX) delete c[keys.sort((a, b) => c[a].ts - c[b].ts)[0]];
  try { localStorage.setItem(_CACHE_LS, JSON.stringify(c)); } catch {}
}

// ============================================
// AI API (multi-provider, streaming)
// ============================================
async function callAI(messages, onChunk = null, _attempt = 0, _ctx = null) {
  const ctx = _ctx || _inferContext(messages);

  // Cache hit for non-streaming calls (flashcards, quiz JSON generation)
  if (onChunk === null && _attempt === 0) {
    const hit = cacheGet(_buildCacheKey(messages));
    if (hit) { showToast('⚡ Instant result from cache', 'info'); _analyticsTrack('cache_hit', { feature: ctx }); return hit; }
  }

  const t0 = Date.now();
  if (_attempt === 0) _analyticsTrack('query_start', { feature: ctx, provider: currentProvider });

  const prov = PROVIDERS[currentProvider] || PROVIDERS.groq;
  const activeKey = getProviderKey(currentProvider);

  if (!activeKey) {
    _analyticsTrack('error');
    showToast('No ' + prov.name + ' key — click 🔑 to add one', 'error');
    throw new Error('No API key');
  }

  const model = document.getElementById('modelSelect').value;
  const streaming = onChunk !== null;

  const headers = {
    'Authorization': 'Bearer ' + activeKey,
    'Content-Type': 'application/json'
  };
  if (currentProvider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://pt0407.github.io/study-ai';
    headers['X-Title'] = 'Study AI';
  }

  const response = await fetch(prov.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: streaming, max_tokens: 4096, temperature: 0.7 })
  });

  if (response.status === 429) {
    if (_attempt >= 4) throw new Error('Rate limit: please wait ~1 minute and try again.');
    if (currentProvider === 'groq' && !apiKey) rotateDefaultKey();
    const wait = Math.max(parseInt(response.headers.get('retry-after') || '30'), 20);
    const allKeys = [...dynamicKeys, ...DEFAULT_API_KEYS];
    const keyLabel = currentProvider === 'groq' && !apiKey && allKeys.length > 1 ? ' (switching key)' : '';
    _analyticsTrack('rate_limit');
    showToast('Rate limited — retrying in ' + wait + 's' + keyLabel + '…', 'info');
    await new Promise(r => setTimeout(r, wait * 1000));
    return callAI(messages, onChunk, _attempt + 1, ctx);
  }

  if (!response.ok) {
    let errMsg = 'API request failed (' + response.status + ')';
    try {
      const err = await response.json();
      errMsg = err.error?.message || errMsg;
    } catch (_) {}
    _analyticsTrack('error');
    throw new Error(errMsg);
  }

  if (!streaming) {
    const data = await response.json();
    const result = data.choices[0].message.content;
    _analyticsTrack('query_success', {
      latency_ms: Date.now() - t0,
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
    });
    cacheSet(_buildCacheKey(messages), result);
    return result;
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
        if (delta) { fullText += delta; onChunk(fullText); }
      } catch (_) {}
    }
  }

  _analyticsTrack('query_success', {
    latency_ms: Date.now() - t0,
    estimated_tokens: Math.round(fullText.length / 4),
  });
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

  // Slash command routing
  const cmdMatch = Object.keys(CHAT_COMMANDS).find(c => message.toLowerCase().startsWith(c));
  if (cmdMatch) {
    const body = message.slice(cmdMatch.length).trim();
    input.value = '';
    input.style.height = 'auto';
    if (cmdMatch === '/summarize')  return chatAgentSummarize(body);
    if (cmdMatch === '/flashcard')  return chatAgentFlashcard(body);
    if (cmdMatch === '/quiz')       return chatAgentQuiz(body);
    if (cmdMatch === '/studyplan')  return chatAgentStudyplan(body);
    if (cmdMatch === '/resetcache') return chatAgentResetCache();
  }

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
    await callAI(messages, (text) => {
      finalText = text;
      updateChatMessage(msgId, text, true);
    });

    chatHistory.push({ role: 'assistant', content: finalText });
    updateChatMessage(msgId, finalText, false);
    saveChatHistory();
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
  localStorage.removeItem('chat_history');
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
// CONVERSATION HISTORY (localStorage)
// ============================================
function saveChatHistory() {
  try {
    localStorage.setItem('chat_history', JSON.stringify(chatHistory.slice(-50)));
  } catch (e) { console.warn('Could not save chat history:', e); }
}

function loadChatHistory() {
  try {
    const saved = localStorage.getItem('chat_history');
    if (!saved) return;
    const msgs = JSON.parse(saved);
    if (!Array.isArray(msgs) || msgs.length === 0) return;
    chatHistory = msgs;
    const container = document.getElementById('chatMessages');
    container.innerHTML =
      '<div class="text-center text-xs text-gray-600 py-2 select-none">— previous session restored —</div>';
    msgs.forEach(msg => {
      const id = appendChatMessage(msg.role === 'user' ? 'user' : 'ai', msg.role === 'user' ? msg.content : '');
      if (msg.role !== 'user') updateChatMessage(id, msg.content, false);
    });
  } catch (e) {
    chatHistory = [];
    localStorage.removeItem('chat_history');
  }
}

// ============================================
// CHAT AGENTS (slash commands)
// ============================================
const CHAT_COMMANDS = {
  '/summarize':   { label: '📋 Summarize',      hint: 'Summarize pasted text inline'         },
  '/flashcard':   { label: '📚 Flashcards',     hint: 'Generate flashcards from text'        },
  '/quiz':        { label: '📝 Quiz',            hint: 'Create a quiz from text'              },
  '/studyplan':   { label: '📅 Study Plan',      hint: 'Build a study plan for a topic'      },
  '/resetcache':  { label: '🗑️ Reset Cache',    hint: 'Clear AI response cache (stay logged in)' },
};

function insertChatCmd(cmd) {
  const input = document.getElementById('chatInput');
  input.value = cmd;
  input.focus();
  autoResize(input);
  document.getElementById('cmdPopup').classList.add('hidden');
}

function handleChatInput(val) {
  const popup = document.getElementById('cmdPopup');
  if (!popup) return;
  if (val.startsWith('/')) {
    const partial = val.toLowerCase().split(/\s/)[0];
    const matches = Object.entries(CHAT_COMMANDS).filter(([cmd]) => cmd.startsWith(partial));
    if (matches.length && val.trim() === partial) {
      popup.innerHTML = matches.map(([cmd, cfg]) =>
        '<button class="w-full text-left px-4 py-2.5 hover:bg-gray-700 transition-colors text-sm flex items-center gap-3 border-b border-gray-700/50 last:border-0" onclick="insertChatCmd(\'' + cmd + ' \')">' +
          '<span class="font-mono text-purple-400">' + cmd + '</span>' +
          '<span class="text-gray-500 text-xs">' + cfg.hint + '</span>' +
        '</button>'
      ).join('');
      popup.classList.remove('hidden');
      return;
    }
  }
  popup.classList.add('hidden');
}

// Helper: lock/unlock UI during agent run
function _agentStart() {
  isGenerating = true;
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('cmdPopup').classList.add('hidden');
}
function _agentEnd() {
  isGenerating = false;
  document.getElementById('sendBtn').disabled = false;
  document.getElementById('chatInput').focus();
}

async function _runInlineAgent(userLabel, systemPrompt, userPrompt) {
  appendChatMessage('user', userLabel);
  chatHistory.push({ role: 'user', content: userLabel });
  const msgId = appendChatMessage('ai', '');
  _agentStart();
  try {
    let finalText = '';
    await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], (chunk) => {
      finalText = chunk;
      updateChatMessage(msgId, chunk, true);
    });
    updateChatMessage(msgId, finalText, false);
    chatHistory.push({ role: 'assistant', content: finalText });
    saveChatHistory();
  } catch (err) {
    updateChatMessage(msgId, '**Error:** ' + err.message, false);
  }
  _agentEnd();
}

async function chatAgentSummarize(text) {
  if (!text) { showToast('Paste text after /summarize', 'error'); return; }
  await _runInlineAgent(
    '📋 /summarize [text]',
    'You are a study assistant. Create a clear, well-structured summary using markdown headings and bullet points.',
    'Summarize this text with key points, main ideas, and important details:\n\n' + text
  );
}

function chatAgentResetCache() {
  const raw = localStorage.getItem(_CACHE_LS);
  let count = 0;
  try { count = Object.keys(JSON.parse(raw || '{}')).length; } catch {}
  localStorage.removeItem(_CACHE_LS);
  const msg = '🗑️ **Response cache cleared** — ' + count + ' cached entr' + (count === 1 ? 'y' : 'ies') + ' removed.\n\nYour login, API keys, and chat history are untouched. Next AI call will fetch fresh from the API.';
  appendChatMessage('user', '/resetcache');
  appendChatMessage('ai', msg);
  showToast('Cache cleared (' + count + ' entries)', 'success');
}

async function chatAgentStudyplan(text) {
  if (!text) { showToast('Add a topic after /studyplan', 'error'); return; }
  await _runInlineAgent(
    '📅 /studyplan ' + text.slice(0, 50),
    'You are an expert educational coach. Create detailed, practical, motivating study plans using markdown.',
    'Create a comprehensive study plan for: ' + text
  );
}

async function chatAgentFlashcard(text) {
  if (!text) { showToast('Paste text after /flashcard', 'error'); return; }
  appendChatMessage('user', '📚 /flashcard [text]');
  chatHistory.push({ role: 'user', content: '📚 /flashcard [text]' });
  const msgId = appendChatMessage('ai', '');
  _agentStart();
  try {
    updateChatMessage(msgId, '⏳ Generating flashcards…', true);
    const count = 8;
    const response = await callAI([
      { role: 'system', content: 'You are a study assistant. Respond with valid JSON only — no markdown, no code fences.' },
      { role: 'user', content: 'Create exactly ' + count + ' flashcards from the text below.\nReturn ONLY a valid JSON array.\nFormat: [{"front":"term or question","back":"definition or answer"}]\n\nText:\n' + text }
    ]);
    const cards = parseJSON(response);
    if (!Array.isArray(cards) || !cards.length) throw new Error('Invalid flashcard data');
    flashcards = cards;
    currentFlashcardIndex = 0;
    isFlipped = false;
    document.getElementById('flashcard-input-section').classList.add('hidden');
    document.getElementById('flashcard-display-section').classList.remove('hidden');
    renderFlashcard();
    renderFlashcardDots();
    const preview = cards.slice(0, 3).map(c => '- **' + escapeHtml(c.front) + '**').join('\n');
    const fcMsg = '✅ **' + cards.length + ' flashcards created!**\n\n' + preview +
      (cards.length > 3 ? '\n_…and ' + (cards.length - 3) + ' more_' : '') +
      '\n\n[→ Open Flashcards panel to study them](#fc)';
    chatHistory.push({ role: 'assistant', content: fcMsg });
    saveChatHistory();
    updateChatMessage(msgId, fcMsg, false);
    setTimeout(() => {
      const el = document.getElementById(msgId);
      if (el) {
        const a = el.querySelector('a[href="#fc"]');
        if (a) { a.href = '#'; a.onclick = (e) => { e.preventDefault(); showPanel('flashcards'); }; }
      }
    }, 100);
    setTimeout(() => showPanel('flashcards'), 1400);
  } catch (err) {
    updateChatMessage(msgId, '**Error:** ' + err.message, false);
  }
  _agentEnd();
}

async function chatAgentQuiz(text) {
  if (!text) { showToast('Paste text after /quiz', 'error'); return; }
  appendChatMessage('user', '📝 /quiz [text]');
  chatHistory.push({ role: 'user', content: '📝 /quiz [text]' });
  const msgId = appendChatMessage('ai', '');
  _agentStart();
  try {
    updateChatMessage(msgId, '⏳ Generating quiz…', true);
    const response = await callAI([
      { role: 'system', content: 'You are a quiz generator. Respond with valid JSON only — no markdown, no code fences.' },
      { role: 'user', content: 'Create exactly 5 multiple-choice quiz questions at medium difficulty.\nReturn ONLY a valid JSON array.\nFormat: [{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"why A is correct"}]\n\nText:\n' + text }
    ]);
    const quiz = parseJSON(response);
    if (!Array.isArray(quiz) || !quiz.length) throw new Error('Invalid quiz data');
    quizData = quiz;
    quizAnswers = {};
    document.getElementById('quiz-input-section').classList.add('hidden');
    document.getElementById('quiz-display-section').classList.remove('hidden');
    document.getElementById('quizResult').classList.add('hidden');
    renderQuiz();
    const qzMsg = '✅ **' + quiz.length + ' quiz questions ready!**\n\n' +
      '_Q1: ' + escapeHtml(quiz[0].question.slice(0, 90)) + (quiz[0].question.length > 90 ? '…' : '') + '_\n\n' +
      '[→ Open Quiz panel to take the quiz](#qz)';
    chatHistory.push({ role: 'assistant', content: qzMsg });
    saveChatHistory();
    updateChatMessage(msgId, qzMsg, false);
    setTimeout(() => {
      const el = document.getElementById(msgId);
      if (el) {
        const a = el.querySelector('a[href="#qz"]');
        if (a) { a.href = '#'; a.onclick = (e) => { e.preventDefault(); showPanel('quiz'); }; }
      }
    }, 100);
    setTimeout(() => showPanel('quiz'), 1400);
  } catch (err) {
    updateChatMessage(msgId, '**Error:** ' + err.message, false);
  }
  _agentEnd();
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
    const response = await callAI([
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
    const response = await callAI([
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
    await callAI([
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
    await callAI([
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
