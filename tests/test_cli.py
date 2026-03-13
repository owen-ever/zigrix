from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV = dict(os.environ)
ENV["PYTHONPATH"] = str(ROOT / "src")


class ZigrixCliTests(unittest.TestCase):
    def run_cli(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", "-m", "zigrix", *args],
            cwd=str(cwd or ROOT),
            env=ENV,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_init_creates_project_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            result = self.run_cli("init", cwd=workdir)
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            self.assertTrue((workdir / ".zigrix").exists())
            self.assertTrue((workdir / ".zigrix" / "index.json").exists())

    def test_task_create_and_status_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            self.run_cli("init", cwd=workdir)
            create = self.run_cli(
                "--json",
                "task",
                "create",
                "--title",
                "Test task",
                "--description",
                "Create from test",
                cwd=workdir,
            )
            self.assertEqual(create.returncode, 0, msg=create.stderr)
            payload = json.loads(create.stdout)
            task_id = payload["taskId"]
            status = self.run_cli("--json", "task", "status", task_id, cwd=workdir)
            self.assertEqual(status.returncode, 0, msg=status.stderr)
            status_payload = json.loads(status.stdout)
            self.assertEqual(status_payload["title"], "Test task")
            self.assertEqual(status_payload["status"], "OPEN")

    def test_doctor_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            result = self.run_cli("--json", "doctor", cwd=workdir)
            payload = json.loads(result.stdout)
            self.assertIn("python", payload)
            self.assertIn("summary", payload)


if __name__ == "__main__":
    unittest.main()
