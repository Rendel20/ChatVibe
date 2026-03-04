/* global io */

const socket = io();

const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('message-input');
const sendBtnEl = document.getElementById('send-btn');
const skipBtnEl = document.getElementById('skip-btn');
const reportBtnEl = document.getElementById('report-btn');
const statusBadgeEl = document.getElementById('status-badge');

let isConnectedToPartner = false;

function clearMessages() {
  messagesEl.innerHTML = '';
}

function setStatusWaiting() {
  isConnectedToPartner = false;
  statusBadgeEl.textContent = 'Waiting';
  statusBadgeEl.classList.remove('bg-success');
  statusBadgeEl.classList.add('bg-secondary');
  inputEl.disabled = true;
  sendBtnEl.disabled = true;
}

function setStatusConnected() {
  isConnectedToPartner = true;
  statusBadgeEl.textContent = 'Connected';
  statusBadgeEl.classList.remove('bg-secondary');
  statusBadgeEl.classList.add('bg-success');
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
  bubble.className = 'p-2 bubble border';
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
  bubble.className = 'p-2 bubble bg-primary text-white d-inline-block';
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Initial state: waiting for a partner
setStatusWaiting();
addSystemMessage('Connecting to server and waiting for a partner...');

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
  clearMessages();
  const reason = payload && payload.reason ? payload.reason : 'ended';
  if (reason === 'skip') {
    addSystemMessage('Partner skipped. Looking for a new partner...');
  } else if (reason === 'disconnect') {
    addSystemMessage('Partner disconnected. Looking for a new partner...');
  } else if (reason === 'banned') {
    addSystemMessage('Your partner was removed. Looking for a new partner...');
  } else if (reason === 'report') {
    addSystemMessage('You reported your partner. Looking for a new partner...');
  } else {
    addSystemMessage('Chat ended. Looking for a new partner...');
  }
  setStatusWaiting();
});

socket.on('chat:rate_limited', (payload) => {
  const msg =
    (payload && payload.message) ||
    'You are sending messages too quickly. Please slow down.';
  addSystemMessage(msg);
});

socket.on('chat:banned', () => {
  addSystemMessage('You have been temporarily banned due to multiple reports.');
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
  addSystemMessage('Skipping current chat. Looking for a new partner...');
  setStatusWaiting();
});

reportBtnEl.addEventListener('click', () => {
  if (!isConnectedToPartner) return;
  const confirmed = window.confirm(
    'Are you sure you want to report this partner? This will end the current chat.'
  );
  if (!confirmed) return;

  socket.emit('chat:report');
  addSystemMessage(
    'You reported your partner. We are reviewing and finding you a new partner...'
  );
});

