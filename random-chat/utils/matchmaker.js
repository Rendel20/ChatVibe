const { v4: uuidv4 } = require('uuid');

// Waiting users stored in insertion order
const waitingUsers = new Set();

// Active chat sessions: roomId -> { users: [sessionIdA, sessionIdB], createdAt }
const activeChats = new Map();

function addToQueue(sessionId) {
  if (!sessionId) return null;
  if (waitingUsers.has(sessionId)) return null;

  waitingUsers.add(sessionId);
  return tryMatch();
}

function removeFromQueue(sessionId) {
  waitingUsers.delete(sessionId);
}

function tryMatch() {
  if (waitingUsers.size < 2) {
    return null;
  }

  const pair = [];
  for (const id of waitingUsers) {
    pair.push(id);
    if (pair.length === 2) break;
  }

  const [first, second] = pair;

  // Prevent self-matching; very defensive (should not normally happen)
  if (!first || !second || first === second) {
    return null;
  }

  waitingUsers.delete(first);
  waitingUsers.delete(second);

  const roomId = `room_${uuidv4()}`;
  const users = [first, second];
  activeChats.set(roomId, { users, createdAt: Date.now() });

  return { roomId, users };
}

function endChatBySession(sessionId) {
  for (const [roomId, chat] of activeChats.entries()) {
    if (chat.users.includes(sessionId)) {
      activeChats.delete(roomId);
      return { roomId, users: chat.users };
    }
  }
  return null;
}

function getWaitingCount() {
  return waitingUsers.size;
}

module.exports = {
  waitingUsers,
  activeChats,
  addToQueue,
  removeFromQueue,
  tryMatch,
  endChatBySession,
  getWaitingCount,
};

