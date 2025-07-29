
## IMPORTANT: Running the Backend (Consistent NODE_ENV Setting)

**You MUST set `NODE_ENV` when launching the backend to guarantee correct environment variable loading and database connections.**

- In development, always start the backend with `NODE_ENV=development`, e.g.:
    ```
    NODE_ENV=development npm run backend
    ```
- In production deployments, use `NODE_ENV=production` and _ensure your production environment loads its own `.env` file_ and uses the correct `MONGODB_URI_PROD` and secrets.

**If NODE_ENV is unset or set inconsistently, user authentication, token storage, and database operations may fail or mismatch across backend/frontend. This can cause "User not found or token revoked" errors and lost sessions.** Both frontend and backend must use the corresponding MongoDB URI (`MONGODB_URI_DEV` or `MONGODB_URI_PROD`) with matching `.env` settings.

See DEV_NOTES.md for additional troubleshooting and environment tips.

# AI Chat Assistant Project

This repository provides the base for a full-stack AI Chat Assistant with support for user authentication, chat conversation history, OpenAI integration, and real-time communication using Socket.io. The backend is built with ExpressJS and MongoDB, and the frontend with ReactJS, bundled via Webpack.

## Project Features

- **User Login/Signup**: JWT authentication, hashed passwords (bcrypt).
- **Chat Conversations**: View historical conversations and maintain multi-turn threads.
- **Real-time Messaging**: Send messages and receive OpenAI assistant responses streamed live via Socket.io.
- **AI Integration**: Uses OpenAI's API (configurable model) for chat completions.
- **Frontend**: ReactJS SPA with hot-reload in development; bundled to `/dist` for production.
- **Backend**: ExpressJS serves both API endpoints and static UI in production.
- **Database**: MongoDB, using the official `mongodb` npm package and collections: `users`, `conversations`.

---

## Folder Structure (Starter)

```
/dist                        # Compiled frontend (output directory)
/src/
  /classes                   # Future: utility classes (e.g. user/session helpers)
  /functions                 # Utility JS functions (e.g., mongo.js for MongoDB connection)
  /httpEndpoints             # Express route handlers (e.g. signup.js, login.js)
  /socketEventHandlers       # Socket.io event handler modules (e.g. message.js)
  /ui/
    /components              # React components (Navbar, LoginModal, app.jsx, etc.)
    index.html               # Frontend root HTML template
index.js                     # (to be created) Backend entrypoint
.babelrc                     # Babel config for JSX/ES6 transpilation
webpack.config.js            # Webpack config for React compilation/hot reload
.env.example                 # Environment variable template
README.md                    # Project documentation (this file)
```

---

## Getting Started

### 1. Install Dependencies

Install both backend and frontend dependencies together (monorepo):

```
npm install
```

**Key dependencies:**
- Backend: express, mongodb, bcrypt, jsonwebtoken, openai, socket.io
- Frontend: react, react-dom, socket.io-client
- Tooling: webpack, @babel/core, babel-loader, @babel/preset-env, @babel/preset-react

---

### 2. Environment Configuration

1. Duplicate `.env.example` to `.env`:

    ```
    cp .env.example .env
    ```

2. Edit your `.env` file and fill in all necessary values:

    - MongoDB URIs for dev/prod/test
    - JWT secret and expiry
    - Bcrypt salt rounds
    - OpenAI API key/base URL (get API key from https://platform.openai.com)
    - Server and socket ports
    - CORS origins, frontend variables, etc.

**Do NOT commit your real secrets or .env file to version control.**

---

### 3. Running the Project

#### Backend (API server + Socket.io)

```
npm run backend
```

- This will start the Express backend serving HTTP endpoints and (in production) also serve files from `/dist`.

#### Frontend (React development mode)

```
npm run dev
```

- Runs Webpack dev server for hot reloading at `localhost:1234`.

#### Build Frontend for Production

```
npm run build
```

- Builds the React app into `/dist`. These files are served by Express in prod.

---

### 4. Usage Notes

- **Login/Signup:** Use navbar to open Login/Signup modals. Submit forms to get a JWT token — it will be stored client-side.
- **Socket.io Connection:** Upon login/signup, the frontend connects to socket.io with the token for real-time streaming.
- **Conversations:** After login, view or start conversations in the history list. Select a conversation to load messages/history.
- **Chat:** Use the textarea and Send button (or Ctrl/Cmd+Enter) to submit a message in any conversation. AI replies are streamed live as they are generated.
- **Must Login:** If not logged in, the UI displays “must login to use service.”
- **Logout:** Click the logout button in the navbar to clear your session and disconnect.

---

## Next Steps & Roadmap

- Implement HTTP endpoint logic in `/src/httpEndpoints/`
- Add production/secure settings for CORS, HTTPS, etc.
- Polish error handling and add additional API endpoints (list conversations, fetch messages, etc.)
- Add Dockerfile/devcontainer for portable local development (optional)
- Add logging/error reporting integrations (optional)
- Expand the UI (forgot password, profile management, better conversation naming, etc.)

---

## Development Notes

- Separate backend and frontend logic but use a single (monorepo) codebase.
- `.env` variables control all keys and endpoints.
- In development, React UI uses its own dev server with hot reload and proxies API calls to Express backend.
- In production, backend serves both API and React `/dist` static files.
- All new code should use ES6 imports/exports and avoid CommonJS `require`.

---

## Questions?

For questions or support, open an issue or contact the project maintainer.

---

Happy building your AI Chat Assistant!