"""CLI region selection routes account and download operations consistently."""

import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

from pico_store_lab import PicoAuth
from pico_store_lab.cli import main


class CliTests(unittest.TestCase):
    """Exercise complete commands without a network or native keychain."""

    def test_china_sms_signin_uses_hidden_code(self) -> None:
        """The selected account is saved only after successful sign-in."""
        auth = PicoAuth("123", "secret", region="cn")
        with (
            patch("pico_store_lab.cli.PicoStoreClient") as factory,
            patch("pico_store_lab.cli.getpass.getpass", return_value="123456") as prompt,
            patch("pico_store_lab.cli.credentials.save") as save,
            redirect_stdout(io.StringIO()) as out,
        ):
            factory.return_value.login_mobile.return_value = auth
            self.assertEqual(main(["--region", "cn", "login", "--mobile", "19900000000"]), 0)
            factory.return_value.login_mobile.assert_called_once_with(
                "19900000000", "123456", country_code="86"
            )
            self.assertEqual(factory.call_args.kwargs["config"].region, "cn")
            save.assert_called_once_with(auth)
            prompt.assert_called_once()
            self.assertNotIn("123456", out.getvalue())
            self.assertNotIn("secret", out.getvalue())

    def test_china_download_and_logout_use_china_slot(self) -> None:
        """Both commands use the same region without deleting the other one."""
        with (
            patch("pico_store_lab.cli.PicoStoreClient") as factory,
            patch("pico_store_lab.cli.credentials.load") as load,
            patch("pico_store_lab.cli.credentials.clear") as clear,
            redirect_stdout(io.StringIO()),
        ):
            args = ["--region", "cn", "--device", "B3110"]
            self.assertEqual(
                main(
                    args
                    + [
                        "download",
                        "--item-id",
                        "7680447105202274345",
                        "--package",
                        "com.aeripane.pico",
                        "--output",
                        "sample.apk",
                    ]
                ),
                0,
            )
            load.assert_called_once_with("cn")
            self.assertEqual(factory.return_value.download.call_args.args[2], Path("sample.apk"))
            self.assertEqual(main(args + ["logout"]), 0)
            clear.assert_called_once_with("cn")

    def test_wrong_channel_fails_before_code_prompt_or_transport(self) -> None:
        """A mistyped region must not cause a request to a different account service."""
        for args in (
            ["--region", "cn", "login", "--email", "test@example.com"],
            ["send-code", "--mobile", "19900000000"],
        ):
            with (
                self.subTest(args=args),
                patch("pico_store_lab.cli.PicoStoreClient") as factory,
                patch("pico_store_lab.cli.getpass.getpass") as prompt,
                redirect_stderr(io.StringIO()),
                self.assertRaises(SystemExit) as caught,
            ):
                main(args)
            self.assertEqual(caught.exception.code, 2)
            factory.assert_not_called()
            prompt.assert_not_called()

    def test_search_prints_utf8_chinese_without_unicode_escapes(self) -> None:
        r"""Non-ASCII names are printed literally instead of \uXXXX escapes."""
        fake_item = Mock(item_id="1", package_name="com.example", version_code=1)
        fake_item.name = "互联"
        with (
            patch("pico_store_lab.cli.PicoStoreClient") as factory,
            redirect_stdout(io.StringIO()) as out,
        ):
            factory.return_value.search.return_value.items = [fake_item]
            self.assertEqual(main(["--region", "cn", "search", "互联"]), 0)
        rendered = out.getvalue()
        self.assertIn("互联", rendered)
        self.assertNotIn("\\u4e92", rendered)

    def test_failed_login_preserves_existing_session(self) -> None:
        """Never replace a good saved session after a rejected verification code."""
        with (
            patch("pico_store_lab.cli.PicoStoreClient") as factory,
            patch("pico_store_lab.cli.getpass.getpass", return_value="123456"),
            patch("pico_store_lab.cli.credentials.save") as save,
            redirect_stderr(io.StringIO()),
        ):
            factory.return_value.login_mobile.side_effect = RuntimeError(
                "PICO account request rejected"
            )
            self.assertEqual(main(["--region", "cn", "login", "--mobile", "19900000000"]), 1)
            save.assert_not_called()


if __name__ == "__main__":
    unittest.main()
