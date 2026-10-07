import gzip
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize("fail_dump", [False, True])
def test_backup_always_restarts_backend_and_only_reports_complete_pairs(tmp_path, monkeypatch, fail_dump):
    spec = importlib.util.spec_from_file_location("backup_operator", Path(__file__).resolve().parents[2] / "ops" / "backup.py")
    backup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backup)
    project, archives, status = (tmp_path / name for name in ("project", "archives", "status"))
    project.mkdir()
    monkeypatch.setattr(sys, "argv", ["backup.py", "--project-dir", str(project), "--backup-dir", str(archives), "--status-dir", str(status)])
    calls = []
    monkeypatch.setattr(backup.subprocess, "check_output", lambda *args, **kwargs: "db\nbackend\nfrontend\n")

    def run(command, **kwargs):
        calls.append(command)
        if "pg_dump" in " ".join(command):
            if fail_dump:
                raise subprocess.CalledProcessError(1, command)
            kwargs["stdout"].write(b"test database archive")
        if "run" in command:
            kwargs["stdout"].write(gzip.compress(b"\0" * 1024))

    monkeypatch.setattr(backup.subprocess, "run", run)
    assert backup.main() == int(fail_dump)
    assert calls[0][-2:] == ["stop", "backend"]
    assert calls[-1][-2:] == ["start", "backend"]
    report = json.loads((status / "status.json").read_text())
    assert report["last_attempt_status"] == ("failed" if fail_dump else "success")
    assert len(report["backups"]) == (0 if fail_dump else 1)
    assert report["last_restore_test_at"] is None
    assert report["encrypted"] is False
    assert report["offsite_copy"] is False
    assert archives.stat().st_mode & 0o777 == 0o700
