const socket = io();

const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('message-form');
const inputEl = document.getElementById('message-input');

function addMessage(text) {
  const div = document.createElement('div');
  div.classList.add('mb-2');
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

socket.on('connect', () => {
  addMessage('Connected to server.');
});

// Placeholder event handlers; detailed chat logic will come in Step 2.
socket.on('chat-message', (msg) => {
  addMessage(msg);
});

formEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit('chat-message', text);
  inputEl.value = '';
});

