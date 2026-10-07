# Security dashboard operations

The **Security and data** menu combines the overview, data-subject requests,
published consent and retention policy, backup reports and an audit of sensitive
actions. Admins can read the policy and handle requests. Only superadmins can
publish policy revisions. Existing account and client tools remain accessible
from this dashboard.

## Deployment

This update adds migration `0019_security_dashboard`. For the HTTPS deployment,
run from the repository after `git pull`:

```sh
docker compose -f docker-compose.yml -f docker-compose.https.yml build
docker compose -f docker-compose.yml -f docker-compose.https.yml run --rm backend alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

Bootstrap consent texts and controller settings come from the existing `.env`.
After the first publication, the latest database policy is authoritative. Editing
`.env` subsequently does not replace a published policy. The editor contains both
SK and EN versions, controller/DPO contacts, purposes/legal bases, recipients,
and retention statements for accounts, profiles, measurements, consents/requests
and backup copies. Define the start event as well as the duration of each rule.
Publishing creates an immutable application revision. There is no policy-delete
API. Old consent snapshots keep their original text and version. Registration
rejects a stale presented version and stores the server's current document.
Publishing does not request renewed consent from existing users or start deletion
jobs. Study operators must assess those steps separately.

## Backups

Run this script on the host during a maintenance window:

```sh
sudo python3 ops/backup.py --backup-dir /srv/thrust-backups \
  --compose-file docker-compose.yml --compose-file docker-compose.https.yml
```

It locks concurrent runs, stops the backend while making a consistent pair,
creates a PostgreSQL custom-format dump with the database container's `pg_dump`,
archives the entire measurement volume (including uploaded images), checks the
dump index, validates the gzip stream and checks SHA-256 digests. The backend is
restarted in a `finally` block even after a failed backup. A completed backup has:

- `database.dump`
- `measurement-data.tar.gz`
- `manifest.json` with file checksums

Archives are under a host directory with mode `0700`; files are `0600`. These
archives are **not encrypted** and are **not copied offsite** by this script.
Configure scheduling, encryption, offsite storage and pruning in the host backup
system according to the study's policy. No old archives are removed automatically.
Do not choose an archive directory inside the app-readable status directory.

Only non-secret metadata is published to `backup-status/status.json`, mounted
read-only in the backend. The app never mounts the archives or the Docker socket.
The dashboard distinguishes missing/invalid reports, failures and stale complete
backups. `BACKUP_MAX_AGE_HOURS` (default 168) controls the warning threshold; it
does not schedule a backup. A successful archive check is not a restore test.
External backup tooling can produce the same validated report schema in
`backend/app/schemas/security.py`, including externally verified encryption,
offsite-copy and restore-test information.

## Recovery and erasure

Test recovery into an isolated database and file volume. Check manifest digests
before restoring, use `pg_restore` for the database and restore the file archive
to its matching measurement volume. Verify login, consent snapshots, a raw-log
download and the correspondence between DB paths and files. Do not expose the
restored instance to participants during this test.

Before a production recovery, preserve deletion/withdrawal decisions made since
the snapshot outside the volumes being restored. Reapply those decisions before
opening the recovered service. A restored older DB can otherwise revive deleted
data or withdrawn consent. There is no automatic replay of those decisions in
this update. The backup retention rule must also account for old archive copies.

## Audit scope

Audit records begin with this deployment; historical actions are not reconstructed.
Publication, request creation/status updates, consent withdrawal, request exports,
admin profile/contact edits, role changes, password resets, anonymization,
permanent erasure and client disconnection are logged. Mutations and their events
use the same DB transaction. Events contain operational metadata and technical
IDs, not e-mail addresses, passwords, tokens, response notes or raw data. APIs
offer read access to admins and no update/delete operation for audit events.
The database operator can still alter database rows: this is an application audit,
not a tamper-proof external logging service. Define its retention separately.

The overview reports application configuration. It does not remotely measure the
TLS certificate, UFW/TUKE perimeter, live Nginx throttling, OS patch status or
offsite-backup success. Check those in the server's monitoring system. Future
extensions can add monitored infrastructure reports, incident tracking, review
deadlines, re-consent campaigns and retention jobs with explicit review before
destructive actions.
