# THRUST-webdb

Central web database for THRUST measurements. The server stores pseudonymous participant codes only; the mapping between a participant and their real identity must remain outside this system.

## Current scope

- public aggregate overview;
- self-hosted administrator accounts;
- Argon2id password hashing;
- opaque, server-side sessions in secure cookies;
- PostgreSQL persistence;
- participant and measurement foundations;
- versioned measurement and analysis contracts.

Student accounts and measurement upload are intentionally deferred until the first data contract is validated against real SCoPE output.

## Local development

1. Copy `.env.example` to `.env` and replace the database password.
2. Start the stack: `docker compose up --build`.
3. Apply migrations: `docker compose exec backend alembic upgrade head`.
4. Create the first administrator: `docker compose exec backend python -m app.create_admin admin`.
5. Open `http://localhost:8080`.

Set `COOKIE_SECURE=true` when the application is served through HTTPS in production.

## GitHub Codespaces

The repository includes a `.devcontainer` configuration for browser-based development.
Create a Codespace from the repository, then run:

```bash
docker compose up --build -d
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.create_admin admin
```

Open the forwarded port `8080` in the Codespace. The first Codespace setup installs
Neovim, Docker Compose, ripgrep and the basic build tools. The `.env` file is created
from `.env.example`; change the development database password before starting the stack.

## Security boundary

- Never store names, e-mail addresses, university identifiers, or the local ID-to-name mapping here.
- Never commit `.env`, database dumps, participant mappings, tokens, or measurement exports.
- PostgreSQL must not be exposed directly to the internet.
- Production traffic must terminate over HTTPS at a trusted reverse proxy.
