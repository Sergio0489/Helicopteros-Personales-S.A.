"""No network, credentials, or real mail are used in these tests."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("setup_mail", Path(__file__).resolve().parents[1] / "scripts/configure-prospect-email.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.config = {"host": "smtp.example.test", "port": 465, "user": "office@example.test", "password": "synthetic-only", "from": "office@example.test", "recipients": ["office@example.test", "school@example.test"]}

    def test_verify_uses_stdin_not_arguments_and_does_not_send(self):
        with patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "SMTP_OK", "")) as run:
            module.verify(self.config)
        call = run.call_args
        self.assertNotIn("synthetic-only", str(call.args))
        self.assertEqual(json.loads(call.kwargs["input"]), self.config)
        self.assertNotIn("sendMail", module.VERIFY)
        self.assertIn("transport.verify()", module.VERIFY)

    def test_verify_never_exposes_server_error_details(self):
        for output in ["EAUTH", "ETLS", "unrecognized"]:
            with patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, output, "synthetic-secret-error")):
                with self.assertRaises(RuntimeError) as result:
                    module.verify(self.config)
                self.assertNotIn("synthetic-secret-error", str(result.exception))

    def test_secret_and_cli_logs_are_private_and_removed_after_success_or_failure(self):
        for exit_code in [0, 1]:
            paths = []
            def runner(args, **kwargs):
                path = Path(args[args.index("--data-file") + 1])
                paths.append(path)
                self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
                self.assertEqual(json.loads(path.read_text()), self.config)
                self.assertNotIn("synthetic-only", str(args))
                self.assertEqual(args[args.index("--project") + 1], module.PROJECT)
                self.assertEqual(Path(kwargs["cwd"]), path.parent)
                (path.parent / "firebase-debug.log").write_text("synthetic-only")
                return subprocess.CompletedProcess(args, exit_code, "", "synthetic-only")
            with patch.object(module.subprocess, "run", side_effect=runner):
                if exit_code:
                    with self.assertRaises(RuntimeError) as result:
                        module.save_secret(self.config)
                    self.assertNotIn("synthetic-only", str(result.exception))
                else:
                    module.save_secret(self.config)
            self.assertEqual(len(paths), 1)
            self.assertFalse(paths[0].parent.exists())


if __name__ == "__main__":
    unittest.main()
