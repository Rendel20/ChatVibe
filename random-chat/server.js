const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const matchmaker = require('./utils/matchmaker');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Map of sessionId -> socket instance
const sessions = new Map();

// Simple in-memory rate limiting state: sessionId -> recent message timestamps (ms)
const messageHistory = new Map();
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 3000;

// In-memory reports and temporary bans
const reports = [];
const reportCounts = new Map();
const TEMP_BAN_THRESHOLD = 3;
const TEMP_BAN_DURATION_MS = 10 * 60 * 1000; // 10 minutes

const bannedWords = ['badword1', 'badword2', 'badword3'];

function applyProfanityFilter(text) {
  let result = text;
  bannedWords.forEach((word) => {
    if (!word) return;
    const pattern = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(pattern, '***');
  });
  return result;
}

function sanitizeMessage(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return applyProfanityFilter(escaped);
}

function handleMatchResult(match) {
  if (!match) return;

  const { roomId, users } = match;
  const [userA, userB] = users;

  const socketA = sessions.get(userA);
  const socketB = sessions.get(userB);

  // Handle edge case: one user disconnected before match was finalized
  if (socketA && socketB) {
    socketA.join(roomId);
    socketB.join(roomId);

    socketA.data.roomId = roomId;
    socketB.data.roomId = roomId;
    socketA.data.partnerId = userB;
    socketB.data.partnerId = userA;

    socketA.emit('chat:start', { roomId, partnerId: userB });
    socketB.emit('chat:start', { roomId, partnerId: userA });
  } else {
    // Clean up the chat session if one side is missing
    matchmaker.endChatBySession(userA);
    if (socketA) matchmaker.addToQueue(userA);
    if (socketB) matchmaker.addToQueue(userB);
  }
}

function handleDisconnectCleanup(sessionId, reason = 'disconnect') {
  if (!sessionId) return;

  // If the user is in an active chat, end that chat and handle their partner
  const ended = matchmaker.endChatBySession(sessionId);

  if (ended) {
    const { roomId, users } = ended;

    users.forEach((id) => {
      if (id === sessionId) {
        return;
      }

      const partnerSocket = sessions.get(id);
      if (!partnerSocket) return;

      partnerSocket.leave(roomId);
      partnerSocket.data.roomId = null;
      partnerSocket.data.partnerId = null;

      partnerSocket.emit('chat:ended', { reason });

      // Requeue connected partner and try to rematch
      const match = matchmaker.addToQueue(id);
      handleMatchResult(match);
    });
  }

  // Ensure the disconnecting user is not left in the waiting queue
  matchmaker.removeFromQueue(sessionId);
}

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route for clarity; static middleware would also handle this.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const sessionId = uuidv4();
  socket.data.sessionId = sessionId;
  sessions.set(sessionId, socket);

  console.log(
    `User connected: socketId=${socket.id}, sessionId=${sessionId}, queueLength=${matchmaker.getWaitingCount()}`
  );

  // Add user to matchmaking queue and attempt to match
  const match = matchmaker.addToQueue(sessionId);
  handleMatchResult(match);

  socket.on('chat:message', (payload) => {
    const now = Date.now();
    const fromId = socket.data.sessionId;

    // Rate limiting
    const history = messageHistory.get(fromId) || [];
    const recent = history.filter((t) => now - t <= RATE_LIMIT_WINDOW_MS);

    if (recent.length >= RATE_LIMIT_COUNT) {
      socket.emit('chat:rate_limited', {
        message: 'You are sending messages too quickly. Please slow down.',
      });
      return;
    }

    recent.push(now);
    messageHistory.set(fromId, recent);

    const { text } = payload || {};
    const clean = sanitizeMessage(text);
    if (!clean) return;

    const partnerId = socket.data.partnerId;
    const timestamp = new Date().toISOString();

    if (!partnerId) return;

    const partnerSocket = sessions.get(partnerId);
    if (!partnerSocket) return;

    partnerSocket.emit('chat:receive', {
      from: fromId,
      text: clean,
      timestamp,
    });
  });

  socket.on('chat:skip', () => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) return;

    // End current chat session, if any
    const ended = matchmaker.endChatBySession(sessionId);

    if (ended) {
      const { roomId, users } = ended;

      users.forEach((id) => {
        const s = sessions.get(id);
        if (!s) return;

        s.leave(roomId);
        s.data.roomId = null;
        s.data.partnerId = null;
        s.emit('chat:ended', { reason: 'skip' });
      });

      // Requeue connected users and attempt new matches
      users.forEach((id) => {
        const s = sessions.get(id);
        if (!s) return;
        const match = matchmaker.addToQueue(id);
        handleMatchResult(match);
      });
    } else {
      // Not in an active chat; ensure user is queued and try to match
      const match = matchmaker.addToQueue(sessionId);
      handleMatchResult(match);
    }
  });

  socket.on('chat:report', () => {
    const reporterId = socket.data.sessionId;
    const reportedId = socket.data.partnerId;

    if (!reporterId || !reportedId) return;

    const timestamp = Date.now();
    reports.push({ reporterId, reportedId, timestamp });

    const currentCount = reportCounts.get(reportedId) || 0;
    const newCount = currentCount + 1;
    reportCounts.set(reportedId, newCount);

    console.log(
      `Report received: reporter=${reporterId}, reported=${reportedId}, totalReportsForUser=${newCount}`
    );

    if (newCount >= TEMP_BAN_THRESHOLD) {
      const reportedSocket = sessions.get(reportedId);
      if (reportedSocket) {
        reportedSocket.emit('chat:banned', {
          durationMs: TEMP_BAN_DURATION_MS,
        });
      }

      // Disconnect reported user and clean up their chats; this will also notify and requeue the reporter
      handleDisconnectCleanup(reportedId, 'banned');
      if (reportedSocket) {
        reportedSocket.disconnect(true);
      }
    } else {
      // Even if not banned yet, end the current chat and requeue reporter
      const ended = matchmaker.endChatBySession(reporterId);
      if (ended) {
        const { roomId, users } = ended;

        users.forEach((id) => {
          const s = sessions.get(id);
          if (!s) return;

          s.leave(roomId);
          s.data.roomId = null;
          s.data.partnerId = null;
          if (id === reporterId) {
            s.emit('chat:ended', { reason: 'report' });
          } else {
            s.emit('chat:ended', { reason: 'disconnect' });
          }
        });

        users.forEach((id) => {
          const s = sessions.get(id);
          if (!s) return;
          if (id === reportedId && newCount >= TEMP_BAN_THRESHOLD) return;
          const match = matchmaker.addToQueue(id);
          handleMatchResult(match);
        });
      }
    }
  });

  socket.on('disconnect', () => {
    const id = socket.data.sessionId;

    // Clean up any active chat and requeue partner if needed
    handleDisconnectCleanup(id, 'disconnect');

    sessions.delete(id);

    console.log(
      `User disconnected: socketId=${socket.id}, sessionId=${id}, queueLength=${matchmaker.getWaitingCount()}`
    );
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

