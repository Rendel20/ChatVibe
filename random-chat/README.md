# Anonymous Random Chat (ChatVibe)

Real-time anonymous random chat built with Node.js, Express, Socket.IO, and Bootstrap 5. Users are paired randomly into 1‑to‑1 rooms with support for skipping, reporting, profanity filtering, rate limiting, and dark mode.

## Features

- **Anonymous random matching**: No login or registration.
- **1‑to‑1 chat rooms**: Users are paired into private rooms.
- **Skip & requeue**: Skip your current partner and get a new one.
- **Report & temporary ban**: Report abusive partners; repeated reports trigger an auto‑ban.
- **Profanity filter**: Simple word-based censoring on the server.
- **Anti-spam rate limiting**: Blocks users sending >5 messages in 3 seconds.
- **Dark mode**: Toggle Dark/Light theme, persisted across pages.

## Requirements

- Node.js 18+ (recommended)
- npm

## Install

From the project root:

```bash
cd random-chat
npm install
```

This installs all dependencies defined in `package.json` (Express, Socket.IO, uuid, etc.).

## Run in development

```bash
cd random-chat
npm start
```

This starts the server using `server.js` on port `3000` by default.

- Open your browser and go to: `http://localhost:3000`
- Open the same URL in another tab or another browser to simulate two users.

## Environment variables

- **PORT**: (optional) Port for the HTTP/WebSocket server.
  - Example:

  ```bash
  PORT=4000 npm start
  ```

If `PORT` is not set, the server defaults to `3000`.

## How to use

1. **Landing page**
   - Visit `http://localhost:3000`.
   - Optionally toggle **Dark/Light** mode using the button in the top-right corner.
   - Click **Start Chat** to go to the chat interface.

2. **Chat interface**
   - Wait for the **status badge** to change from `Waiting` to `Connected`.
   - Type a message and click **Send** (or press Enter).
   - Messages are delivered only to your current partner.

3. **Skip**
   - Click **Skip** to end the current session.
   - You will be placed back into the queue and matched with a new partner when available.

4. **Report**
   - Click **Report** if your partner is abusive.
   - Their account is tracked with an in-memory report count; multiple reports lead to an automatic temporary ban.

5. **Disconnects**
   - If your partner disconnects, you will see a notice and automatically go back to `Waiting` for a new partner.

## Production / Deployment notes

- The server already uses `process.env.PORT || 3000`, so it works on platforms like Render, Railway, or a VPS behind Nginx.
- If you serve the frontend from a different origin, configure Socket.IO CORS in `server.js` accordingly.

