# THRUST-webdb

THRUST-webdb is the web application and central data store for **THRUST** (Testing Hub for Research in UAV Simulation and Training), a research system developed at the Faculty of Aeronautics, Technical University of Košice. It works with [THRUST-measure](https://github.com/szokezoltan95/THRUST-measure), the desktop application that runs the measurement tasks.

## Why THRUST exists

Research on UAV control needs repeatable tasks, consistent records, and a way to compare measurements made under similar conditions. A study team defines test versions in WebDB, uses THRUST-measure to collect SCoPE or SimPLE measurements, and reviews the resulting data in one place.

These results describe performance in the selected tasks and conditions. They are not, by themselves, a certificate of real-world piloting ability or a universal score of pilot competence.

## What WebDB provides

- **Participants** can register, record the required consents and background information, see their own results, and compare them with eligible group statistics.
- **Researchers** can prepare test versions, inspect measurements, compare participants or saved groups over time, and download results and raw logs for further analysis.
- **Administrators** manage participant records and accounts. Superadmins can also assign roles and access the full pseudonymous data archive. Access to functions depends on the signed-in role.
- **Visitors** can see the published welcome page and public aggregate figures. Published content can be maintained in Slovak and English.

The desktop application is needed to perform a measurement. WebDB does not read a joystick or run SCoPE and SimPLE tasks in the browser. A study organizer supplies the correct WebDB address, participant access, controller instructions, and measurement procedure.

## How the system works

1. A researcher creates a versioned test definition in WebDB. It contains the task configuration and analysis profile used by the measurement client. Drafts can be edited; a finalized version is kept for reproducible measurements. Deactivated versions stop appearing for new measurements while existing results remain associated with them.
2. THRUST-measure signs in through the WebDB API, obtains the participant and selected test configuration, and runs the task locally with a compatible controller.
3. After a session, THRUST-measure produces a compressed raw log and a separate analysis result. It calculates the individual measurement metrics before upload.
4. WebDB validates the submitted result against the test version and checks the raw file's SHA-256 hash, size, type, and name against the analysis record. It stores the result and raw log; it does not recalculate the individual metrics.
5. WebDB displays individual results and calculates group statistics and historical comparisons. Authorized researchers can download the underlying artifacts for independent analysis.

Different test versions, controller setups, and procedures can affect comparisons. Researchers should compare like conditions and interpret the measured tasks within their study protocol.

### Technical architecture and stored data

The browser interface uses React, TypeScript, and Vite. A FastAPI backend supplies the API and enforces access rules. PostgreSQL stores accounts, participant details, consent records, test definitions, measurement metadata, and analysis JSON. Alembic manages database schema changes. Compressed raw measurement files are stored separately in a persistent Docker volume. The frontend is served by Nginx; the optional HTTPS configuration terminates TLS there. THRUST-measure talks to the API, never directly to PostgreSQL.

WebDB stores personal information for registered accounts, including e-mail address, optional student nickname, researcher names, password hash, and consent history. Participant profiles can include birth year, biological sex, handedness, and controller/UAV experience. Measurements are linked to generated participant codes, but those codes are **pseudonyms, not anonymity**: the service also holds the account-to-participant link. Public and student group views apply a configurable minimum group size. Study operators are responsible for the applicable consent text, access, retention, and backups.

Two Docker volumes matter for recovery: `postgres_data` for PostgreSQL and `measurement_data` for raw logs and uploaded welcome-page images. Back up and test restoring both together; a database backup alone cannot restore the raw files.

## Running your own instance

The project is intended for a study team that can operate a server, set up participant information and consent, and provide access to THRUST-measure. You need Docker Compose and a configured `.env` file. These steps start a local development instance:

1. Copy `.env.example` to `.env`. Set a strong `POSTGRES_PASSWORD` and put the same password in `DATABASE_URL`. Fill in the data-controller and retention fields before inviting participants.
2. Start the services with `docker compose up -d --build`.
3. Apply the database schema with `docker compose exec backend alembic upgrade head`.
4. Create an initial administrator with `docker compose exec backend python -m app.create_admin admin`.
5. Open `http://localhost`.

The default Compose setup uses HTTP for local development. For a server reachable by participants, use a trusted TLS certificate and set `COOKIE_SECURE=true` and `ALLOWED_HOSTS` to the actual host name. Put the certificate chain in `certs/fullchain.pem` and private key in `certs/privkey.pem`, then start with:

```console
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.https.yml exec backend alembic upgrade head
```

The HTTPS configuration serves port 443 and redirects port 80. Keep the private key and `.env` out of Git. On later updates, use **the same pair of Compose files** for both the build and migration commands. See `.env.example` for the remaining settings, including the public minimum group size, raw upload limit, and optional researcher registration key.

## Development and data handling

The **Security and data** admin dashboard combines data requests, SK/EN consent
texts, versioned privacy/retention settings, backup reports and sensitive-action
audit history. Policy publication is restricted to superadmins; old consent
snapshots remain intact. Student privacy information uses the published policy.
Deploy migration `0019_security_dashboard` with this update. The host backup
script covers both the PostgreSQL database and measurement volume; the web app
reads its status without access to Docker or backup archives. See
[security dashboard operations](ops/SECURITY.md) for deployment, backups,
recovery, audit scope and operational limitations.

From `frontend/`, run `npm ci && npm run build` to type-check and build the interface. From `backend/`, install its test dependencies and run `pytest`; integration tests require PostgreSQL. Schema changes need an Alembic migration so existing installations can update without discarding their data.

Do not commit `.env`, certificates, database dumps, participant mappings, access tokens, or measurement exports. Do not expose PostgreSQL directly to the internet. Researchers can export raw logs, saved analysis, and tables; handle those exports under the same study access rules as the server data.

## License

Copyright © 2026 Zoltán Szőke. Source code is licensed under the [MIT License](LICENSE). Third-party assets and dependencies retain their own applicable terms.
