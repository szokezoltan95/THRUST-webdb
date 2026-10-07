#!/usr/bin/env python3
"""Host-side backup of the WebDB database and measurement volume.

Run during a maintenance window: backend is stopped for a consistent DB/file pair.
The application reads a separate, non-secret status report; it never receives
Docker access or read access to backup archives.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def atomic_json(path, value, mode):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, indent=2), encoding="utf-8")
    temp.chmod(mode)
    temp.replace(path)


def inventory(root):
    entries = []
    for folder in sorted(root.iterdir(), reverse=True):
        if not folder.is_dir() or not re.fullmatch(r"\d{8}T\d{6}Z", folder.name):
            continue
        try:
            manifest = json.loads((folder / "manifest.json").read_text())
            if manifest.get("complete") and all((folder / name).is_file() for name in ("database.dump", "measurement-data.tar.gz")):
                entries.append({"name": folder.name, "created_at": manifest["created_at"],
                                "size_bytes": manifest["size_bytes"], "database": True, "files": True,
                                "checksums_verified": manifest["checksums_verified"]})
        except (OSError, ValueError, KeyError):
            continue
    return entries[:200]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--backup-dir", type=Path, required=True, help="Private host directory outside the repository")
    parser.add_argument("--status-dir", type=Path, help="Defaults to PROJECT/backup-status")
    parser.add_argument("--compose-file", action="append", help="Repeat to include docker-compose.https.yml")
    args = parser.parse_args()
    project = args.project_dir.resolve()
    root = args.backup_dir.resolve()
    status_dir = (args.status_dir or project / "backup-status").resolve()
    if root == project or root in project.parents or project in root.parents:
        parser.error("Use a dedicated backup directory outside the repository and its parent directories.")
    if root == status_dir or root in status_dir.parents or status_dir in root.parents:
        parser.error("Backup archives and the app-readable status directory must be separate.")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    status_dir.mkdir(mode=0o755, parents=True, exist_ok=True)
    status_dir.chmod(0o755)
    # Prevent concurrent runs from restarting backend while another backup is active.
    import fcntl
    with (root / ".backup.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error("Another backup is running.")
        compose = ["docker", "compose", "--project-directory", str(project)]
        for filename in args.compose_file or ["docker-compose.yml"]:
            compose += ["-f", str(project / filename)]
        started_at = utcnow()
        stopped = False
        succeeded = False
        try:
            running = subprocess.check_output(compose + ["ps", "--status", "running", "--services"], text=True).splitlines()
            if "db" not in running:
                raise RuntimeError("PostgreSQL service must already be running.")
            name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            folder = root / name
            folder.mkdir(mode=0o700)
            if "backend" in running:
                stopped = True  # Also restart if stop partially succeeds and reports an error.
                subprocess.run(compose + ["stop", "backend"], check=True)
            with (folder / "database.dump").open("wb") as output:
                subprocess.run(compose + ["exec", "-T", "db", "sh", "-c", 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], stdout=output, check=True)
            with (folder / "database.dump").open("rb") as data:
                subprocess.run(compose + ["exec", "-T", "db", "pg_restore", "--list"], stdin=data, stdout=subprocess.DEVNULL, check=True)
            archive_code = "import os,sys,tarfile; from pathlib import Path; root=Path(os.environ['MEASUREMENT_STORAGE_PATH']); archive=tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz'); archive.add(root,arcname='measurement_data'); archive.close()"
            with (folder / "measurement-data.tar.gz").open("wb") as output:
                subprocess.run(compose + ["run", "--rm", "--no-deps", "-T", "--entrypoint", "python", "backend", "-c", archive_code], stdout=output, check=True)
            with gzip.open(folder / "measurement-data.tar.gz", "rb") as archive:
                for _ in iter(lambda: archive.read(1024 * 1024), b""):
                    pass  # Validate the compressed stream through EOF, including its CRC.
            paths = [folder / "database.dump", folder / "measurement-data.tar.gz"]
            hashes = {path.name: digest(path) for path in paths}
            if any(digest(path) != hashes[path.name] for path in paths):
                raise RuntimeError("Backup checksum verification failed.")
            for path in paths:
                path.chmod(0o600)
            atomic_json(folder / "manifest.json", {"created_at": started_at, "complete": True,
                        "size_bytes": sum(path.stat().st_size for path in paths), "checksums": hashes,
                        "checksums_verified": True}, 0o600)
            succeeded = True
        except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
            print(f"Backup failed: {exc}", file=sys.stderr)
        finally:
            if stopped:
                try:
                    subprocess.run(compose + ["start", "backend"], check=True)
                except (OSError, subprocess.CalledProcessError) as exc:
                    succeeded = False
                    print(f"Backend restart failed: {exc}", file=sys.stderr)
            atomic_json(status_dir / "status.json", {"generated_at": utcnow(), "last_attempt_at": started_at,
                        "last_attempt_status": "success" if succeeded else "failed", "backups": inventory(root),
                        "encrypted": False, "offsite_copy": False, "last_restore_test_at": None}, 0o644)
        return 0 if succeeded else 1


if __name__ == "__main__":
    raise SystemExit(main())
