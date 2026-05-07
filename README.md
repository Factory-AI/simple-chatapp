# Simple Chat App

A demo chat application using the Factory Droid SDK with a React frontend and Express backend.

![Architecture Diagram](diagram.png)

## Getting Started

### Prerequisites

- Node.js 18+
- Factory CLI installed, and authenticated via login or the `FACTORY_API_KEY` environment variable

### Installation

```bash
npm install
```

### Running

```bash
npm run dev
```

This starts both:
- **Backend** (Express + WebSocket) on http://localhost:3001
- **Frontend** (Vite + React) on http://localhost:5173

Open http://localhost:5173 in your browser.

The backend starts a Droid SDK session with the `claude-opus-4-7` model and enables the app's configured tools: `Execute`, `Read`, `Create`, `Edit`, `Glob`, `Grep`, `LS`, and `WebSearch`.

To verify the configured tools are available for the selected model:

```bash
npm run tools:check
```

## Production Considerations

This is an example app for demonstration purposes. For production use, consider:

1. **Isolate the Droid SDK** - Move the SDK into a separate container/service. This provides better security isolation since the agent can access configured tools such as command execution, file operations, and web search.

2. **Persistent storage** - Replace the in-memory `ChatStore` with a database. Currently all chats are lost on server restart.

3. **Transcript syncing** - For Droid sessions to be persisted across server restarts, you'll need to persist and restore the SDK's conversation state. The SDK maintains internal state for multi-turn conversations that must be synced with your storage.

4. **Authentication** - Add user authentication and authorization. Currently anyone can access any chat.

## Demo

![Demo](demo.gif)