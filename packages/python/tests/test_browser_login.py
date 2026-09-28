"""Headless tests for the embedded browser-login flow.

The real browser is never launched: pure cookie/URL helpers are tested
directly, and ``capture_login`` is driven with a fake login window.
"""

from __future__ import annotations

import os
import plistlib
import subprocess
import tempfile
import unittest
import unittest.mock
from pathlib import Path
from types import SimpleNamespace

import websocket

from pico_store_lab.browser_login import (
    REQUIRED_COOKIE_NAMES,
    LoginCancelled,
    LoginController,
    LoginTimeout,
    _browser_command,
    _Cdp,
    _domain_ok,
    _windows_browser_candidates,
    capture_login,
    find_browser,
    has_session,
    login_start_url,
    pick_cookies,
)
from pico_store_lab.protocol import PicoAuth, StoreConfig


def cookie(name: str, value: str, domain: str) -> dict[str, object]:
    """Build a CDP-shaped cookie object."""
    return {"name": name, "value": value, "domain": domain, "path": "/"}


CN = StoreConfig.for_region("cn")
GLOBAL = StoreConfig.for_region("global")


class BrowserDiscoveryTests(unittest.TestCase):
    """Check heuristic discovery from OS registration, not fixed app paths."""

    def test_macos_discovers_bundle_from_spotlight_metadata(self) -> None:
        """Resolve a browser in a nonstandard directory using its app metadata."""
        with tempfile.TemporaryDirectory() as temp_dir:
            app = Path(temp_dir) / "custom" / "Browser.app"
            executable = app / "Contents" / "MacOS" / "BrowserBinary"
            executable.parent.mkdir(parents=True)
            executable.touch()
            executable.chmod(0o755)
            info = app / "Contents" / "Info.plist"
            info.write_bytes(
                plistlib.dumps(
                    {
                        "CFBundleIdentifier": "com.google.Chrome",
                        "CFBundleExecutable": "BrowserBinary",
                    }
                )
            )
            with (
                unittest.mock.patch("pico_store_lab.browser_login.sys.platform", "darwin"),
                unittest.mock.patch(
                    "pico_store_lab.browser_login.shutil.which",
                    side_effect=lambda name: "/mock/mdfind" if name == "mdfind" else None,
                ),
                unittest.mock.patch(
                    "pico_store_lab.browser_login.subprocess.run",
                    return_value=subprocess.CompletedProcess(
                        args=["mdfind"], returncode=0, stdout=f"{app}\n"
                    ),
                ),
                unittest.mock.patch(
                    "pico_store_lab.browser_login.Path.glob", return_value=iter(())
                ),
            ):
                self.assertEqual(find_browser(), (str(executable),))

    def test_linux_discovers_preferred_browser_from_xdg_registration(self) -> None:
        """Resolve a nonstandard Linux browser executable from its desktop entry."""
        with tempfile.TemporaryDirectory() as temp_dir:
            data_home = Path(temp_dir) / "data"
            app_dir = data_home / "applications"
            app_dir.mkdir(parents=True)
            executable = Path(temp_dir) / "custom-browser"
            executable.touch()
            executable.chmod(0o755)
            (app_dir / "custom-browser.desktop").write_text(
                "[Desktop Entry]\n"
                "Type=Application\n"
                "Name=Google Chrome\n"
                f"Exec={executable} --new-window %U\n"
                f"TryExec={executable}\n",
                encoding="utf-8",
            )
            with (
                unittest.mock.patch("pico_store_lab.browser_login.sys.platform", "linux"),
                unittest.mock.patch.dict(
                    os.environ,
                    {"XDG_DATA_HOME": str(data_home), "XDG_DATA_DIRS": ""},
                ),
                unittest.mock.patch(
                    "pico_store_lab.browser_login.shutil.which",
                    side_effect=lambda name: (
                        name if Path(name).is_absolute() and Path(name).exists() else None
                    ),
                ),
            ):
                self.assertEqual(find_browser(), (str(executable), "--new-window"))

    def test_linux_falls_back_to_chromium_family_desktop_launcher(self) -> None:
        """Use a registered Flatpak Chromium browser after preferred options."""
        with tempfile.TemporaryDirectory() as temp_dir:
            data_home = Path(temp_dir) / "data"
            app_dir = data_home / "applications"
            app_dir.mkdir(parents=True)
            (app_dir / "com.brave.Browser.desktop").write_text(
                "[Desktop Entry]\n"
                "Type=Application\n"
                "Name=Brave Browser\n"
                "Exec=flatpak run com.brave.Browser --new-window %U\n"
                "TryExec=flatpak\n",
                encoding="utf-8",
            )

            def which(name: str) -> str | None:
                return "/usr/bin/flatpak" if name == "flatpak" else None

            with (
                unittest.mock.patch("pico_store_lab.browser_login.sys.platform", "linux"),
                unittest.mock.patch.dict(
                    os.environ,
                    {"XDG_DATA_HOME": str(data_home), "XDG_DATA_DIRS": ""},
                ),
                unittest.mock.patch("pico_store_lab.browser_login.shutil.which", side_effect=which),
            ):
                self.assertEqual(
                    find_browser(),
                    ("/usr/bin/flatpak", "run", "com.brave.Browser", "--new-window"),
                )

    def test_path_browser_is_selected_before_registered_apps(self) -> None:
        """Keep direct command discovery as the fast first stage."""
        with (
            unittest.mock.patch("pico_store_lab.browser_login.sys.platform", "linux"),
            unittest.mock.patch(
                "pico_store_lab.browser_login.shutil.which",
                side_effect=lambda name: "/bin/msedge" if name == "msedge" else None,
            ),
            unittest.mock.patch(
                "pico_store_lab.browser_login._registered_browser_candidates",
                side_effect=AssertionError("registration scan should not run"),
            ),
        ):
            self.assertEqual(find_browser(), ("/bin/msedge",))

    def test_browser_family_detection_does_not_match_substrings(self) -> None:
        """Avoid choosing an unrelated app whose name merely contains edge."""
        from pico_store_lab.browser_login import _browser_family

        self.assertIsNone(_browser_family("Knowledge Base"))
        self.assertEqual(_browser_family("org.chromium.Chromium"), "chromium")
        self.assertEqual(_browser_family("Microsoft Edge"), "preferred")

    def test_explicit_browser_path_takes_precedence(self) -> None:
        """Accept a user-supplied executable path without running discovery."""
        with tempfile.TemporaryDirectory() as temp_dir:
            executable = Path(temp_dir) / "Browser With Spaces"
            executable.touch()
            executable.chmod(0o755)
            with unittest.mock.patch(
                "pico_store_lab.browser_login.find_browser",
                side_effect=AssertionError("manual path should bypass discovery"),
            ):
                self.assertEqual(_browser_command(executable), (str(executable),))

    def test_windows_discovers_browsers_from_app_paths(self) -> None:
        """Resolve preferred and fallback browsers from Windows registration."""

        class _Key:
            def __init__(self, value: str = "") -> None:
                self.value = value
                self.index = 0

            def __enter__(self) -> _Key:
                return self

            def __exit__(self, *exc: object) -> None:
                return None

        registered = {
            "chrome.exe": r"E:\Portable\Chrome\chrome.exe",
            "brave.exe": r"D:\Apps\Brave\brave.exe",
        }
        root_key = _Key()

        def open_key(hive: int, key_path: str, reserved: int, access: int) -> _Key:
            executable = key_path.rsplit("\\", 1)[-1]
            if key_path.endswith("App Paths"):
                return root_key
            if executable in registered:
                return _Key(registered[executable])
            raise OSError("not registered")

        def enum_key(key: _Key, index: int) -> str:
            if index >= len(registered):
                raise OSError("no more keys")
            return tuple(registered)[index]

        winreg = SimpleNamespace(
            HKEY_CURRENT_USER=1,
            HKEY_LOCAL_MACHINE=2,
            KEY_READ=1,
            KEY_WOW64_32KEY=0x200,
            KEY_WOW64_64KEY=0x100,
            OpenKey=open_key,
            QueryValueEx=lambda key, name: (key.value, 1),
            EnumKey=enum_key,
        )
        with (
            unittest.mock.patch.dict("sys.modules", {"winreg": winreg}),
            unittest.mock.patch("pico_store_lab.browser_login.sys.platform", "win32"),
            unittest.mock.patch("pico_store_lab.browser_login._launchable", return_value=True),
        ):
            preferred = _windows_browser_candidates("preferred")
            fallback = _windows_browser_candidates("chromium")
        self.assertEqual(preferred, ((registered["chrome.exe"],),))
        self.assertEqual(fallback, ((registered["brave.exe"],),))


class LoginUrlTests(unittest.TestCase):
    """Check the official SSO start URL."""

    def test_cn_url_targets_sso_and_store_service(self) -> None:
        """The China start URL points at SSO with the CN store as the service."""
        url = login_start_url(CN)
        self.assertTrue(url.startswith("https://sso.picoxr.com/passport?"))
        self.assertIn("service=https%3A%2F%2Fstore.picoxr.com%2Fcn%2F", url)

    def test_global_url_targets_global_sso_and_store_service(self) -> None:
        """The default international region uses its matching SSO host."""
        url = login_start_url(GLOBAL)
        self.assertTrue(url.startswith("https://sso-global.picoxr.com/passport?"))
        self.assertIn("service=https%3A%2F%2Fstore-global.picoxr.com%2Fglobal%2F", url)


class CookieSelectionTests(unittest.TestCase):
    """Validate session detection and cookie filtering."""

    def test_has_session_requires_official_domain(self) -> None:
        """A session cookie counts only on an official PICO domain."""
        self.assertFalse(has_session([cookie("sessionid", "x", ".example.com")]))
        self.assertTrue(has_session([cookie("sessionid", "x", ".picoxr.com")]))
        self.assertTrue(has_session([cookie("sid_tt", "x", "appstore-cn.picovr.com")]))
        self.assertFalse(has_session([cookie("sessionid", "x", "evilpicoxr.com")]))
        self.assertFalse(has_session([cookie("sessionid", "x", "evilpicovr.com")]))

    def test_domain_allowlist_matches_dns_label_boundaries(self) -> None:
        """Official suffixes require a dot boundary and are case-insensitive."""
        self.assertTrue(_domain_ok(".auth.picoxr.com"))
        self.assertTrue(_domain_ok("PICOXR.COM."))
        self.assertTrue(_domain_ok("app.picovr.com"))
        self.assertFalse(_domain_ok("evilpicoxr.com"))
        self.assertFalse(_domain_ok("picovr.com.attacker.test"))
        self.assertFalse(_domain_ok("..picoxr.com"))
        self.assertFalse(_domain_ok("picoxr.com.."))

    def test_pick_cookies_prefers_picoxr_and_drops_others(self) -> None:
        """The picoxr.com value wins and unrelated cookies are discarded."""
        cookies = [
            cookie("sessionid", "from-picovr", ".picovr.com"),
            cookie("sessionid", "from-picoxr", ".picoxr.com"),
            cookie("sid_guard", "guard", ".picoxr.com"),
            cookie("sessionid", "foreign", ".example.com"),
            cookie("unrelated", "y", ".picoxr.com"),
        ]
        chosen = pick_cookies(cookies)
        self.assertEqual(chosen["sessionid"], "from-picoxr")
        self.assertEqual(chosen["sid_guard"], "guard")
        self.assertNotIn("unrelated", chosen)
        for key in chosen:
            self.assertIn(key, REQUIRED_COOKIE_NAMES)


class _FakeProcess:
    """Stand-in for the browser process."""

    def __init__(self, return_code: int | None = None) -> None:
        self._return_code = return_code

    def poll(self) -> int | None:
        """Return the fixed process state."""
        return self._return_code


class _FakeWindow:
    """Context manager that records whether it was closed."""

    def __init__(self, controller: LoginController) -> None:
        self.controller = controller
        self.closed = False

    def __enter__(self) -> LoginController:
        """Return the fake controller."""
        return self.controller

    def __exit__(self, *exc: object) -> None:
        """Mark the window as closed (auto-close assertion)."""
        self.closed = True


def _controller(cookie_pages: list[list[dict[str, object]]], code: int | None = None) -> object:
    """Build a LoginController-like fake with scripted cookie responses."""

    class _C:
        def __init__(self) -> None:
            self.process = _FakeProcess(code)
            self._pages = cookie_pages
            self.index = 0

        def cookies(self, *, timeout_s: float = 10.0) -> list[dict[str, object]]:
            page = self._pages[min(self.index, len(self._pages) - 1)]
            self.index += 1
            return page

    return _C()


class CaptureLoginTests(unittest.TestCase):
    """Exercise the capture state machine with fakes."""

    def test_closed_window_is_cancelled_and_window_shuts(self) -> None:
        """An already-closed process cancels login and still runs cleanup."""
        controller = _controller([], code=0)
        window = _FakeWindow(controller)
        with unittest.mock.patch(
            "pico_store_lab.browser_login.login_window", lambda config, **kwargs: window
        ):
            with self.assertRaises(LoginCancelled):
                capture_login(CN, poll_s=0.01)
        self.assertTrue(window.closed)

    def test_successful_login_returns_auth_and_closes_window(self) -> None:
        """A detected, verified session returns auth and closes the window."""
        logged = [
            cookie("sessionid", "sess", ".picoxr.com"),
            cookie("sid_tt", "sess", ".picoxr.com"),
            cookie("sid_guard", "guard", ".picoxr.com"),
        ]
        controller = _controller([[], logged])
        window = _FakeWindow(controller)

        def fake_info(auth: PicoAuth, config: StoreConfig) -> tuple[str, dict[str, object]]:
            self.assertEqual(auth.region, "cn")
            return "838279091207683", {"name": "青檸"}

        with (
            unittest.mock.patch(
                "pico_store_lab.browser_login.login_window", lambda config, **kwargs: window
            ),
            unittest.mock.patch("pico_store_lab.browser_login.fetch_account_info", fake_info),
        ):
            auth = capture_login(CN, poll_s=0.01)

        self.assertTrue(window.closed, "登录成功后窗口必须自动关闭")
        self.assertEqual(auth.uid, "838279091207683")
        self.assertEqual(auth.region, "cn")
        self.assertEqual(auth.cookies["sessionid"], "sess")
        self.assertEqual(auth.cookies["sid_guard"], "guard")


class CdpTimeoutTests(unittest.TestCase):
    """Ensure a CDP command cannot wait forever on an unresponsive socket."""

    def test_call_has_a_deadline_when_socket_keeps_timing_out(self) -> None:
        """Repeated receive timeouts eventually surface as a login timeout."""

        class _TimeoutSocket:
            def __init__(self) -> None:
                self.receive_count = 0
                self.timeouts: list[float] = []

            def send(self, message: str) -> None:
                pass

            def settimeout(self, timeout: float) -> None:
                self.timeouts.append(timeout)

            def recv(self) -> str:
                self.receive_count += 1
                raise websocket.WebSocketTimeoutException("no response")

        cdp = object.__new__(_Cdp)
        cdp.ws = _TimeoutSocket()
        cdp._next_id = 0
        ticks = iter((0.0, 0.0, 0.5, 1.1))
        with unittest.mock.patch(
            "pico_store_lab.browser_login.time.monotonic", side_effect=lambda: next(ticks)
        ):
            with self.assertRaises(LoginTimeout):
                cdp.call("Network.getAllCookies", timeout_s=1.0)
        self.assertEqual(cdp.ws.receive_count, 2)


if __name__ == "__main__":
    unittest.main()
