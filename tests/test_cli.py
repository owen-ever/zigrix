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
PYTHON = os.environ.get("ZIGRIX_TEST_PYTHON", "python3")


class ZigrixCliTests(unittest.TestCase):
    def run_cli(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [PYTHON, "-m", "zigrix", *args],
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

    def test_worker_evidence_report_and_stale_flow(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            self.run_cli("init", cwd=workdir)
            create = self.run_cli(
                "--json",
                "task",
                "create",
                "--title",
                "Worker task",
                "--description",
                "Test worker and evidence",
                "--required-agent",
                "pro-zig",
                "--required-agent",
                "qa-zig",
                cwd=workdir,
            )
            task_id = json.loads(create.stdout)["taskId"]

            progress = self.run_cli(
                "--json",
                "task",
                "progress",
                "--task-id",
                task_id,
                "--actor",
                "pro-zig",
                "--message",
                "Started coordination",
                cwd=workdir,
            )
            progress_payload = json.loads(progress.stdout)
            self.assertEqual(progress_payload["event"], "progress_report")

            prepare = self.run_cli(
                "--json",
                "worker",
                "prepare",
                "--task-id",
                task_id,
                "--agent-id",
                "qa-zig",
                "--description",
                "Run QA checks",
                cwd=workdir,
            )
            prepare_payload = json.loads(prepare.stdout)
            self.assertTrue(Path(prepare_payload["promptPath"]).exists())

            register = self.run_cli(
                "--json",
                "worker",
                "register",
                "--task-id",
                task_id,
                "--agent-id",
                "qa-zig",
                "--session-key",
                "agent:test:qa",
                "--run-id",
                "run-001",
                cwd=workdir,
            )
            register_payload = json.loads(register.stdout)
            self.assertEqual(register_payload["status"], "dispatched")

            transcript = workdir / "qa.jsonl"
            transcript.write_text(
                "\n".join(
                    [
                        json.dumps({"role": "assistant", "content": "QA summary"}, ensure_ascii=False),
                        json.dumps({"role": "toolResult", "content": "pytest ok"}, ensure_ascii=False),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            collect = self.run_cli(
                "--json",
                "evidence",
                "collect",
                "--task-id",
                task_id,
                "--agent-id",
                "qa-zig",
                "--run-id",
                "run-001",
                "--transcript",
                str(transcript),
                cwd=workdir,
            )
            collect_payload = json.loads(collect.stdout)
            self.assertTrue(Path(collect_payload["evidencePath"]).exists())

            complete = self.run_cli(
                "--json",
                "worker",
                "complete",
                "--task-id",
                task_id,
                "--agent-id",
                "qa-zig",
                "--session-key",
                "agent:test:qa",
                "--run-id",
                "run-001",
                cwd=workdir,
            )
            complete_payload = json.loads(complete.stdout)
            self.assertIn("pro-zig", complete_payload["missingEvidenceAgents"])

            collect_pro = self.run_cli(
                "--json",
                "evidence",
                "collect",
                "--task-id",
                task_id,
                "--agent-id",
                "pro-zig",
                "--summary",
                "Orchestrator summary",
                cwd=workdir,
            )
            self.assertEqual(collect_pro.returncode, 0, msg=collect_pro.stderr)

            merge = self.run_cli(
                "--json",
                "evidence",
                "merge",
                "--task-id",
                task_id,
                "--require-qa",
                cwd=workdir,
            )
            merge_payload = json.loads(merge.stdout)
            self.assertTrue(merge_payload["complete"])

            report = self.run_cli(
                "--json",
                "report",
                "render",
                "--task-id",
                task_id,
                "--record-events",
                cwd=workdir,
            )
            report_payload = json.loads(report.stdout)
            self.assertTrue(report_payload["complete"])
            self.assertIn("진행 요약", report_payload["report"])

            events = self.run_cli("--json", "task", "events", task_id, cwd=workdir)
            events_payload = json.loads(events.stdout)
            event_names = [event["event"] for event in events_payload]
            self.assertIn("worker_prepared", event_names)
            self.assertIn("evidence_merged", event_names)
            self.assertIn("feedback_requested", event_names)

            stale_create = self.run_cli(
                "--json",
                "task",
                "create",
                "--title",
                "Stale task",
                "--description",
                "Should become blocked",
                cwd=workdir,
            )
            stale_task_id = json.loads(stale_create.stdout)["taskId"]
            self.run_cli("task", "start", stale_task_id, cwd=workdir)
            stale_path = workdir / ".zigrix" / "tasks" / f"{stale_task_id}.json"
            task_payload = json.loads(stale_path.read_text(encoding="utf-8"))
            task_payload["updatedAt"] = "2000-01-01T00:00:00+00:00"
            stale_path.write_text(json.dumps(task_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

            stale = self.run_cli("--json", "task", "stale", "--hours", "1", cwd=workdir)
            stale_payload = json.loads(stale.stdout)
            self.assertEqual(stale_payload["count"], 1)

            apply_stale = self.run_cli("--json", "task", "stale", "--hours", "1", "--apply", cwd=workdir)
            apply_payload = json.loads(apply_stale.stdout)
            self.assertEqual(apply_payload["count"], 1)
            blocked_status = self.run_cli("--json", "task", "status", stale_task_id, cwd=workdir)
            blocked_payload = json.loads(blocked_status.stdout)
            self.assertEqual(blocked_payload["status"], "BLOCKED")


    def test_pipeline_run_end_to_end(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            self.run_cli("init", cwd=workdir)
            result = self.run_cli(
                "--json",
                "pipeline",
                "run",
                "--title",
                "Pipeline task",
                "--description",
                "E2E pipeline",
                "--scale",
                "simple",
                "--required-agent",
                "pro-zig",
                "--required-agent",
                "qa-zig",
                "--evidence-summary",
                "pro-zig=orch done",
                "--evidence-summary",
                "qa-zig=qa pass",
                "--require-qa",
                "--auto-report",
                "--record-feedback",
                cwd=workdir,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["complete"])
            self.assertEqual(len(payload["missingAgents"]), 0)
            step_names = [s["step"] for s in payload["steps"]]
            self.assertIn("task_create", step_names)
            self.assertIn("evidence_merge", step_names)
            self.assertIn("report_render", step_names)
            self.assertIn("task_report", step_names)


if __name__ == "__main__":
    unittest.main()
