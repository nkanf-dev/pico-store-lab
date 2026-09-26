"""Native credential storage must never mix China and international sessions."""

import json
import unittest
from unittest.mock import Mock, patch

from pico_store_lab import PicoAuth, credentials


class CredentialTests(unittest.TestCase):
    """Exercise persistence with an in-memory native-backend substitute."""

    def setUp(self) -> None:
        """Replace only the OS keychain, preserving the real serialization path."""
        self.values: dict[tuple[str, str], str] = {}
        self.backend = Mock()
        self.backend.get_password.side_effect = lambda service, account: self.values.get(
            (service, account)
        )
        self.backend.set_password.side_effect = lambda service, account, value: (
            self.values.__setitem__((service, account), value)
        )
        self.backend.delete_password.side_effect = lambda service, account: self.values.pop(
            (service, account)
        )
        self.patch = patch.object(credentials, "_backend", return_value=self.backend)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_save_load_logout_are_isolated(self) -> None:
        """Signing in/out of China leaves the global session unchanged."""
        global_auth = PicoAuth("123", "global-secret")
        cn_auth = PicoAuth("456", "cn-secret", region="cn")
        credentials.save(global_auth)
        before = self.values[(credentials.SERVICE, "current")]
        credentials.save(cn_auth)
        self.assertEqual(credentials.load(), global_auth)
        self.assertEqual(credentials.load("cn"), cn_auth)
        credentials.clear("cn")
        credentials.clear("cn")
        self.assertEqual(self.values[(credentials.SERVICE, "current")], before)
        with self.assertRaisesRegex(ValueError, "--region cn login"):
            credentials.load("cn")

    def test_legacy_entries_are_global_only(self) -> None:
        """Old installations retain sign-in and cannot supply a China session."""
        legacy = json.dumps({"uid": "123", "x_tt_token": "legacy-secret", "cookies": {}})
        self.values[(credentials.SERVICE, "current")] = legacy
        self.assertEqual(credentials.load().region, "global")
        self.values[(credentials.SERVICE, "cn")] = legacy
        with self.assertRaises(ValueError):
            credentials.load("cn")

    def test_invalid_or_mislabeled_entries_fail_closed(self) -> None:
        """No malformed value is coerced into an authenticated session."""
        for value in (
            "secret",
            json.dumps({"region": "global", "uid": "123", "x_tt_token": "secret"}),
            json.dumps({"region": "cn", "uid": "123", "x_tt_token": {"secret": 1}}),
            json.dumps({"region": "cn", "uid": "123", "cookies": {"sessionid": None}}),
            json.dumps({"region": "cn", "uid": "123", "cookies": {}}),
        ):
            self.values[(credentials.SERVICE, "cn")] = value
            with self.subTest(value=value), self.assertRaises(ValueError) as caught:
                credentials.load("cn")
            self.assertNotIn("secret", str(caught.exception))
        with self.assertRaises(ValueError):
            credentials.load("unexpected")

    def test_native_backend_failure_has_no_plaintext_fallback(self) -> None:
        """Storage errors neither expose secret text nor create alternative files."""
        self.backend.set_password.side_effect = RuntimeError("secret")
        with self.assertRaises(RuntimeError) as caught:
            credentials.save(PicoAuth("123", "secret", region="cn"))
        self.assertNotIn("secret", str(caught.exception))
        self.assertEqual(self.values, {})


if __name__ == "__main__":
    unittest.main()
