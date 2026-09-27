"""Headless tests for the embedded browser-login flow.

The real browser is never launched: pure cookie/URL helpers are tested
directly, and ``capture_login`` is driven with a fake login window.
"""

from __future__ import annotations

import unittest
import unittest.mock

from pico_store_lab.browser_login import (
    REQUIRED_COOKIE_NAMES,
    LoginCancelled,
    LoginController,
    capture_login,
    has_session,
    login_start_url,
    pick_cookies,
)
from pico_store_lab.protocol import PicoAuth, StoreConfig


def cookie(name: str, value: str, domain: str) -> dict[str, object]:
    """Build a CDP-shaped cookie object."""
    return {"name": name, "value": value, "domain": domain, "path": "/"}


CN = StoreConfig.for_region("cn")


class LoginUrlTests(unittest.TestCase):
    """Check the official SSO start URL."""

    def test_cn_url_targets_sso_and_store_service(self) -> None:
        """The China start URL points at SSO with the CN store as the service."""
        url = login_start_url(CN)
        self.assertTrue(url.startswith("https://sso.picoxr.com/passport?"))
        self.assertIn("service=https%3A%2F%2Fstore.picoxr.com%2Fcn%2F", url)


class CookieSelectionTests(unittest.TestCase):
    """Validate session detection and cookie filtering."""

    def test_has_session_requires_official_domain(self) -> None:
        """A session cookie counts only on an official PICO domain."""
        self.assertFalse(has_session([cookie("sessionid", "x", ".example.com")]))
        self.assertTrue(has_session([cookie("sessionid", "x", ".picoxr.com")]))
        self.assertTrue(has_session([cookie("sid_tt", "x", "appstore-cn.picovr.com")]))

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

        def cookies(self) -> list[dict[str, object]]:
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
            "pico_store_lab.browser_login.login_window", lambda config: window
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
            unittest.mock.patch("pico_store_lab.browser_login.login_window", lambda config: window),
            unittest.mock.patch("pico_store_lab.browser_login.fetch_account_info", fake_info),
        ):
            auth = capture_login(CN, poll_s=0.01)

        self.assertTrue(window.closed, "登录成功后窗口必须自动关闭")
        self.assertEqual(auth.uid, "838279091207683")
        self.assertEqual(auth.region, "cn")
        self.assertEqual(auth.cookies["sessionid"], "sess")
        self.assertEqual(auth.cookies["sid_guard"], "guard")


if __name__ == "__main__":
    unittest.main()
