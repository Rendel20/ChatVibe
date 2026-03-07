/* global io */

const socket = io();

const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('message-input');
const sendBtnEl = document.getElementById('send-btn');
const skipBtnEl = document.getElementById('skip-btn');
const reportBtnEl = document.getElementById('report-btn');
const statusPillEl = document.getElementById('status-pill');
const statusBadgeEl = document.getElementById('status-badge');

let isConnectedToPartner = false;

function clearMessages() {
  messagesEl.innerHTML = '';
}

function showWaitingState(subtitle) {
  messagesEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'waiting-state';
  wrap.innerHTML =
    '<div class="waiting-spinner" aria-hidden="true"></div>' +
    '<div class="waiting-title">Finding you a partner</div>' +
    '<div class="waiting-subtitle">' + (subtitle || 'Connecting to server and waiting for a partner...') + '</div>';
  messagesEl.appendChild(wrap);
}

function setStatusWaiting() {
  isConnectedToPartner = false;
  if (statusPillEl) {
    statusPillEl.classList.remove('status-connected');
    statusPillEl.classList.add('status-waiting');
  }
  if (statusBadgeEl) statusBadgeEl.textContent = 'Waiting';
  inputEl.disabled = true;
  sendBtnEl.disabled = true;
}

function setStatusConnected() {
  isConnectedToPartner = true;
  if (statusPillEl) {
    statusPillEl.classList.remove('status-waiting');
    statusPillEl.classList.add('status-connected');
  }
  if (statusBadgeEl) statusBadgeEl.textContent = 'Connected';
  inputEl.disabled = false;
  sendBtnEl.disabled = false;
  inputEl.focus();
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-message text-muted small mb-2';
  const span = document.createElement('span');
  span.textContent = text;
  div.appendChild(span);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addIncomingMessage(text, timestamp) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mb-2 message-incoming';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  const meta = document.createElement('div');
  meta.className = 'small text-muted mt-1 message-meta';
  meta.textContent = new Date(timestamp).toLocaleTimeString();

  wrapper.appendChild(bubble);
  wrapper.appendChild(meta);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addOutgoingMessage(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mb-2 message-outgoing';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Initial state: waiting for a partner
setStatusWaiting();
showWaitingState('Connecting to server and waiting for a partner...');

socket.on('connect', () => {
  // No-op; matchmaking is handled server-side on connection
});

socket.on('chat:start', () => {
  clearMessages();
  addSystemMessage('You are now connected to a random partner.');
  setStatusConnected();
});

// Server emits chat:receive when partner sends a message
socket.on('chat:receive', (payload) => {
  if (!payload) return;
  const { text, timestamp } = payload;
  if (!text) return;
  addIncomingMessage(text, timestamp || Date.now());
});

socket.on('chat:ended', (payload) => {
  const reason = payload && payload.reason ? payload.reason : 'ended';
  let subtitle = 'Looking for a new partner...';
  if (reason === 'skip') subtitle = 'Partner skipped. Looking for a new partner...';
  else if (reason === 'disconnect') subtitle = 'Partner disconnected. Looking for a new partner...';
  else if (reason === 'banned') subtitle = 'Your partner was removed. Looking for a new partner...';
  else if (reason === 'report') subtitle = 'You reported your partner. Looking for a new partner...';
  showWaitingState(subtitle);
  setStatusWaiting();
});

socket.on('chat:rate_limited', (payload) => {
  const msg =
    (payload && payload.message) ||
    'You are sending messages too quickly. Please slow down.';
  addSystemMessage(msg);
});

socket.on('chat:banned', () => {
  showWaitingState('You have been temporarily banned due to multiple reports.');
  setStatusWaiting();
  inputEl.disabled = true;
  sendBtnEl.disabled = true;
  skipBtnEl.disabled = true;
  reportBtnEl.disabled = true;
});

formEl.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!isConnectedToPartner) return;

  const text = inputEl.value.trim();
  if (!text) return;

  // Show optimistically in UI
  addOutgoingMessage(text);

  socket.emit('chat:message', { text });
  inputEl.value = '';
});

skipBtnEl.addEventListener('click', () => {
  if (!isConnectedToPartner) return;
  const confirmed = window.confirm(
    'Are you sure you want to skip this partner and start a new chat?'
  );
  if (!confirmed) return;

  socket.emit('chat:skip');
  showWaitingState('Skipping current chat. Looking for a new partner...');
  setStatusWaiting();
});

reportBtnEl.addEventListener('click', () => {
  if (!isConnectedToPartner) return;
  const confirmed = window.confirm(
    'Are you sure you want to report this partner? This will end the current chat.'
  );
  if (!confirmed) return;

  socket.emit('chat:report');
  showWaitingState('You reported your partner. We are reviewing and finding you a new partner...');
});

