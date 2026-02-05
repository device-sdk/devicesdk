# Authentication

This document provides a comprehensive overview of how authentication is handled within the `devicesdk-api` application.

## Overview

The authentication system is designed to be stateless from the perspective of the server, relying on tokens for authenticating requests. It supports two primary methods of authentication:

1.  **Bearer Token:** The client can include a token in the `Authorization` header with the `Bearer` scheme.
2.  **Session Cookie:** For web-based clients, a session cookie named `devicesdk-session` is used to authenticate requests.

The core of the authentication logic resides in `src/foundation/auth.ts`.

## Authentication Middleware

The `authenticateUser` middleware is responsible for protecting routes. It performs the following steps:

1.  **Token Extraction:** It attempts to extract a token from the `Authorization` header or the `devicesdk-session` cookie.
2.  **Token Validation:** The extracted token is validated against the `user_sessions` table in the database.
3.  **Session Expiration:** The middleware checks if the session has expired.
4.  **User Context:** If the token is valid and the session has not expired, the corresponding user's details are fetched from the `user` table and attached to the request context (`c.set('user', ...)`).
5.  **Unauthorized Access:** If the token is missing, invalid, or expired, the middleware returns a `401 Unauthorized` response.

### Protecting Routes

To protect a route, simply apply the `authenticateUser` middleware to it. In this application, all routes under `/v1/user` are protected by this middleware, as configured in `src/index.ts`.

## Google OAuth 2.0

The application uses Google as an OAuth 2.0 provider for user login. The flow is as follows:

1.  **Initiate Login:** The user is redirected to Google's authentication page.
2.  **Google Callback:** After the user authenticates with Google, they are redirected back to the application's `/v1/auth/google` endpoint.
3.  **`handleGoogleCallback` Function:** This function is responsible for handling the callback from Google. It performs the following actions:
    *   **User Creation/Retrieval:** It checks if a user with the provided Google email already exists in the `user` table.
        *   If the user does not exist, a new user is created.
        *   If the user already exists, their details are fetched.
    *   **Session Creation:** A new session is created for the user and stored in the `user_sessions` table. The session token is a SHA-256 hash.
    *   **Session Cookie:** A session cookie (`devicesdk-session`) is set in the user's browser.
    *   **Redirection:** The user is redirected to the application's dashboard at `https://dash.devicesdk.com`.

## Token and Session Management

-   **Token Generation:** Session tokens are generated using a combination of `Math.random()` and the `hashPassword` function, which uses the `SHA-256` algorithm.
-   **Session Storage:** Sessions are stored in the `user_sessions` table in the D1 database.
-   **Session Duration:** Sessions are configured to last for 7 days, as defined by the `SESSION_DURATION_MS` constant in `src/foundation/consts.ts`.

## Database Schema

The authentication system relies on two tables in the D1 database:

### `user`

| Column         | Type    | Description                               |
| :------------- | :------ | :---------------------------------------- |
| `id`           | `TEXT`  | The unique identifier for the user (UUID). |
| `name`         | `TEXT`  | The user's name.                          |
| `picture`      | `TEXT`  | A URL to the user's profile picture.      |
| `email`        | `TEXT`  | The user's email address (unique).        |
| `verified_email` | `INTEGER` | Whether the user's email is verified.     |
| `created_at`   | `INTEGER` | The timestamp of when the user was created. |

### `user_sessions`

| Column       | Type      | Description                                                  |
| :----------- | :-------- | :----------------------------------------------------------- |
| `id`         | `INTEGER` | The unique identifier for the session (auto-incrementing).   |
| `user_id`    | `TEXT`    | A foreign key referencing the `id` of the user in the `user` table. |
| `token`      | `TEXT`    | The session token.                                           |
| `created_at` | `INTEGER` | The timestamp of when the session was created.               |
| `expires_at` | `INTEGER` | The timestamp of when the session expires.                   |
