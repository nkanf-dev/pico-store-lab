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

    def test_search_price_filter_routes_to_client(self) -> None:
        """--price free/paid is forwarded; without it the filter stays None."""
        with (
            patch("pico_store_lab.cli.PicoStoreClient") as factory,
            redirect_stdout(io.StringIO()),
        ):
            factory.return_value.search.return_value.items = []
            self.assertEqual(main(["--region", "cn", "search", "x", "--price", "free"]), 0)
            factory.return_value.search.assert_called_once_with("x", price="free")
        with (
            patch("pico_store_lab.cli.PicoStoreClient") as factory,
            redirect_stdout(io.StringIO()),
        ):
            factory.return_value.search.return_value.items = []
            self.assertEqual(main(["--region", "cn", "search", "x"]), 0)
            factory.return_value.search.assert_called_once_with("x", price=None)

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

    def test_login_window_accepts_explicit_browser_path(self) -> None:
        """Pass a path with spaces through argparse to the login window."""
        auth = PicoAuth("123", "", region="global")
        browser = Path("/opt/Custom Browser/chrome")
        with (
            patch("pico_store_lab.cli.PicoStoreClient"),
            patch("pico_store_lab.browser_login.capture_login", return_value=auth) as capture,
            patch("pico_store_lab.cli.credentials.save") as save,
            redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(main(["login-window", "--browser", str(browser)]), 0)
        capture.assert_called_once()
        self.assertEqual(capture.call_args.kwargs["browser_path"], browser)
        save.assert_called_once_with(auth)

    def test_help_is_english_by_default(self) -> None:
        """Without --locale the built-in and descriptive help stays English."""
        with (
            redirect_stdout(io.StringIO()) as out,
            self.assertRaises(SystemExit) as caught,
        ):
            main(["--help"])
        self.assertEqual(caught.exception.code, 0)
        rendered = out.getvalue()
        self.assertIn("PICO Store Lab Python CLI", rendered)
        self.assertIn("positional arguments", rendered)
        self.assertIn("options", rendered)
        self.assertIn("Search official PICO apps", rendered)

    def test_zh_cn_localizes_top_and_subcommand_help(self) -> None:
        """--locale zh-CN translates descriptions, headings and option help."""
        with (
            redirect_stdout(io.StringIO()) as out,
            self.assertRaises(SystemExit) as caught,
        ):
            main(["--locale", "zh-CN", "--help"])
        self.assertEqual(caught.exception.code, 0)
        top = out.getvalue()
        self.assertIn("PICO 商店实验室 Python 命令行工具", top)
        self.assertIn("位置参数", top)
        self.assertIn("选项", top)
        self.assertIn("搜索 PICO 官方商店应用", top)
        self.assertNotIn("positional arguments", top)

        with (
            redirect_stdout(io.StringIO()) as out,
            self.assertRaises(SystemExit) as caught,
        ):
            main(["--locale", "zh-CN", "search", "--help"])
        self.assertEqual(caught.exception.code, 0)
        self.assertIn("搜索关键词", out.getvalue())
        self.assertIn("免费", out.getvalue())

    def test_zh_cn_localizes_sms_prompt(self) -> None:
        """The hidden verification-code prompt is shown in the selected language."""
        auth = PicoAuth("123", "secret", region="cn")
        with (
            patch("pico_store_lab.cli.PicoStoreClient") as factory,
            patch("pico_store_lab.cli.getpass.getpass", return_value="123456") as prompt,
            patch("pico_store_lab.cli.credentials.save"),
            redirect_stdout(io.StringIO()),
        ):
            factory.return_value.login_mobile.return_value = auth
            self.assertEqual(
                main(["--locale", "zh-CN", "--region", "cn", "login", "--mobile", "19900000000"]),
                0,
            )
        prompt.assert_called_once_with("PICO 短信验证码：")

    def test_zh_cn_localizes_validation_error(self) -> None:
        """Region/channel mistakes are reported in the selected language."""
        with (
            redirect_stderr(io.StringIO()) as err,
            self.assertRaises(SystemExit) as caught,
        ):
            main(["--locale", "zh-CN", "--region", "cn", "login", "--email", "t@example.com"])
        self.assertEqual(caught.exception.code, 2)
        self.assertIn("国区", err.getvalue())
        self.assertIn("--mobile", err.getvalue())

    def test_locale_switches_result_messages(self) -> None:
        """Result lines follow --locale for both Chinese and English."""
        with (
            patch("pico_store_lab.cli.PicoStoreClient"),
            patch("pico_store_lab.cli.credentials.clear"),
            redirect_stdout(io.StringIO()) as out,
        ):
            self.assertEqual(main(["--locale", "zh-CN", "--region", "cn", "logout"]), 0)
            self.assertIn("已退出登录。", out.getvalue())

        with (
            patch("pico_store_lab.cli.PicoStoreClient"),
            patch("pico_store_lab.cli.credentials.clear"),
            redirect_stdout(io.StringIO()) as out,
        ):
            self.assertEqual(main(["logout"]), 0)
            self.assertIn("Signed out.", out.getvalue())


if __name__ == "__main__":
    unittest.main()
