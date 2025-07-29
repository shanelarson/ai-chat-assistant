# DEV NOTES: Authentication, Tokens, and Database Consistency

## Overview

This file documents important requirements and pitfalls regarding authentication, token storage/lookup, and MongoDB usage for this codebase. Please read carefully to avoid confusion and debugging headaches!

---

## 1. Database and Environment Consistency

- **ALWAYS keep `NODE_ENV` and Mongo connection URIs (`MONGODB_URI_DEV`, `MONGODB_URI_PROD`, etc.) consistent between any process that creates users/tokens and any process that checks them (e.g., API server, REPL, test runner).**
- The code picks the database URI by `NODE_ENV` (`production` -> `MONGODB_URI_PROD`, `test` -> `MONGODB_URI_TEST`, else `MONGODB_URI_DEV`).
- The Mongo client _always_ uses the database name: `ai_chat_assistant` (see `connectToMongo`).
- If you create users/tokens in one logical DB and validate with another (different env var/db), you will get "User not found or token revoked." errors even when the token is valid.
- **Recommendation:** Double-check your `.env`, shell environment, and process management for `NODE_ENV` and Mongo URIs before running signup, login, app server, or test scripts.

---

## 2. Token Creation, Storage, and Lookup

- Tokens are created using JWT. The payload always contains `{ userId, email }` where `userId` is the Mongo User `ObjectId` as a 24-character hex string.
- Upon signup/login, the created JWT token (as a string) is _inserted as a plain string_ in the user's `tokens` array (`$push: { tokens: token }`).
- When authenticating, the backend **extracts the token from the `Authorization` header ("Bearer ...")**, strips the "Bearer " prefix, and **compares the raw string** to array values in DB (`tokens: { $elemMatch: { $eq: token } }`).
- **No transformation, encoding, or whitespace adjustment is performed except trimming.**
- Make sure you do not mutate the token string at the client or server before sending/storing/checking.

---

## 3. ObjectId Consistency

- **All lookups on the `_id` field of users MUST use `ObjectId`.**
- The code converts string `userId` from JWT payload to a Mongo `ObjectId` (`new db.bson.ObjectId(id)`) before querying.
- If you fail to convert and instead search with plain string, you will never match a real Mongo user (Mongo compares _types_ for `_id`).

---

## 4. Token Revocation and Email Change

- If a user's email changes, any token previously issued for that user will contain an out-of-date (old) email in its payload.
- When authenticating, if a user is found by `_id` and `tokens` but their email differs from `decoded.email`, the backend removes that token from the account and returns a 401 error.
- This prevents re-use of stale tokens if email is changed.

---

## 5. Logging for Token Lookup Failures

- If authentication fails to find a user by token (and userId), the backend logs:
  - The DB and collection being queried
  - The token value being searched
  - The decoded userId and email
  - The exact search criteria used
- Use these logs for troubleshooting—often, the root cause is a mismatch between databases (see #1).

---

## 6. Multiple Users With Same Token

- Tokens are supposed to be unique per session and per user.
- The logic **does not** explicitly check for another user having the same token, though in normal operation this cannot occur unless there is a serious bug or the JWT secret is shared/copied inappropriately.
- If more than one user ever has the same token in their `tokens` array, authentication is NOT guaranteed to function correctly (and you should investigate immediately).

---

## 7. Environment-specific Pitfalls

- In development, running `npm run backend` and `npm run dev`/React UI will use `NODE_ENV=development` unless overridden.
- In production, always set **all** related environments (backend, workers, etc.) to `NODE_ENV=production` and set `MONGODB_URI_PROD` and all other sensitive secrets appropriately.
- In CI/test, set `NODE_ENV=test` and `MONGODB_URI_TEST` so tests do not pollute dev/prod databases.

---

## 8. Quick Checklist for Debugging "User not found or token revoked"

- **Did you create the user _and_ authenticate in the same DB? (`NODE_ENV` and Mongo URI match?)**
- **Does the token string as sent from the client exactly match what is in the DB (no extra whitespace, no mutation)?**
- **Does the backend properly convert userId to ObjectId on all lookups?**
- **Is the JWT secret the same for issuing and verifying tokens?**
- **Are you starting/stopping backend processes in such a way that DB connection caches and session state are not lost between requests?**
- **Check the logs for detailed DB query criteria and what was actually found (or not found).**

---

## 9. [Optional] Hardening

- For high-security deployments, consider:
  - Enforcing token uniqueness across users with a DB-level sparse index: `{ tokens: 1 }, { unique: true, sparse: true }` on tokens array (may require code changes).
  - Encrypting or signing tokens with stronger algorithms or adding device/session fingerprinting if needed.
  - Regular token pruning if the token array grows very large for any user (though support for multiple concurrent sessions/devices is intentional).

---

## Conclusion

**Authentication in this codebase is simple and secure, but ONLY when the environment, database, and session logic are consistent and correct! When in doubt, check your env, your DB, and your logs before debugging token errors.**

If you discover a token-related bug that is not covered here, PLEASE update this file to help future developers.

---

Happy coding!