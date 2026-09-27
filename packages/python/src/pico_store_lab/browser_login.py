"""Embedded official-login capture through the Chrome DevTools Protocol (CDP).

The user runs a login command, a dedicated browser window opens on the official
PICO single-sign-on page, and after a successful sign-in the window closes
automatically. The signed-in session cookies (notably ``sessionid``) are
captured via CDP, verified against the account service, and returned for the
credential store.

Only a locally installed Chromium-based browser (Microsoft Edge or Google
Chrome) is required; an isolated temporary browser profile is used so the
user's normal browsing profile is never touched.
"""

from __future__ import annotations

import contextlib
import json
import re
import shutil
import socket
import subprocess
import tempfile
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import websocket

from pico_store_lab.protocol import PicoAuth, StoreConfig

# Cookies that authorize store/account requests; the three session tokens are
# the same credential under different names.
SESSION_COOKIE_NAMES = ("sessionid", "sessionid_ss", "sid_tt")
# Cookies worth persisting; sid_guard carries the session lifetime.
REQUIRED_COOKIE_NAMES = (*SESSION_COOKIE_NAMES, "sid_guard")


class BrowserLoginError(RuntimeError):
    """Base failure for the embedded login flow."""


class LoginCancelled(BrowserLoginError):
    """Raised when the user closes the login window before signing in."""


class LoginTimeout(BrowserLoginError):
    """Raised when login is not completed within the deadline."""


_BROWSER_CANDIDATES = (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
)


def find_browser() -> Path:
    """Locate an installed Chromium-based browser executable."""
    for name in ("msedge", "microsoft-edge", "chrome", "google-chrome"):
        found = shutil.which(name)
        if found:
            return Path(found)
    for candidate in _BROWSER_CANDIDATES:
        path = Path(candidate)
        if path.exists():
            return path
    raise BrowserLoginError("未找到 Microsoft Edge 或 Google Chrome，请先安装。")


def _free_port() -> int:
    """Return an currently unused loopback TCP port."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def login_start_url(config: StoreConfig) -> str:
    """Build the official SSO URL that returns to the region store after login."""
    service = f"{config.web_store_host.rstrip('/')}/{config.web_region}/"
    return "https://sso.picoxr.com/passport?" + urlencode({"service": service})


def _http_json(url: str, timeout: float = 2.0) -> object:
    """Fetch a JSON document over plain HTTP (the local CDP endpoint)."""
    with urlopen(url, timeout=timeout) as response:  # noqa: S310 - fixed loopback address
        return json.loads(response.read().decode())


def _wait_cdp(port: int, process: subprocess.Popen[bytes], deadline_s: float = 20.0) -> object:
    """Wait until the browser exposes its CDP endpoint or the window closes."""
    deadline = time.time() + deadline_s
    while time.time() < deadline:
        if process.poll() is not None:
            raise LoginCancelled("登录窗口已关闭，未完成登录。")
        try:
            return _http_json(f"http://127.0.0.1:{port}/json/version")
        except (URLError, OSError, ValueError):
            time.sleep(0.2)
    raise BrowserLoginError("无法连接浏览器调试端口。")


def _page_ws_url(port: int, deadline_s: float = 20.0) -> str:
    """Return the WebSocket debugger URL of the visible login page target."""
    deadline = time.time() + deadline_s
    while time.time() < deadline:
        try:
            targets = _http_json(f"http://127.0.0.1:{port}/json")
        except (URLError, OSError, ValueError):
            time.sleep(0.2)
            continue
        if isinstance(targets, list):
            for target in targets:
                if (
                    isinstance(target, dict)
                    and target.get("type") == "page"
                    and target.get("webSocketDebuggerUrl")
                ):
                    return str(target["webSocketDebuggerUrl"])
        time.sleep(0.2)
    raise BrowserLoginError("未找到登录页面目标。")


class _Cdp:
    """Minimal synchronous CDP client over one target WebSocket."""

    def __init__(self, ws: websocket.WebSocket) -> None:
        """Wrap an established WebSocket and enable the needed domains."""
        self.ws = ws
        self._next_id = 0
        ws.settimeout(2.0)
        self.call("Page.enable")
        self.call("Network.enable")

    def call(self, method: str, params: dict[str, object] | None = None) -> dict[str, object]:
        """Send one CDP command and wait for its matching response."""
        self._next_id += 1
        message_id = self._next_id
        self.ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        while True:
            try:
                data = json.loads(self.ws.recv())
            except websocket.WebSocketTimeoutException:
                continue
            if isinstance(data, dict) and data.get("id") == message_id:
                if "error" in data:
                    raise BrowserLoginError(f"CDP {method} 失败：{data['error']}")
                result = data.get("result")
                return result if isinstance(result, dict) else {}

    def cookies(self) -> list[dict[str, object]]:
        """Return every browser cookie, including HttpOnly session cookies."""
        result = self.call("Network.getAllCookies")
        cookies = result.get("cookies")
        return cookies if isinstance(cookies, list) else []

    def close(self) -> None:
        """Close the target WebSocket, ignoring transport errors."""
        with contextlib.suppress(Exception):
            self.ws.close()


@dataclass
class LoginController:
    """Handle to the live login window with self-healing CDP access."""

    process: subprocess.Popen[bytes]
    port: int
    cdp: _Cdp | None = None

    def _ensure_cdp(self) -> _Cdp:
        """Create or recreate the page CDP client after navigation/errors."""
        if self.cdp is None:
            ws = websocket.create_connection(
                _page_ws_url(self.port), timeout=2.0, suppress_origin=True
            )
            self.cdp = _Cdp(ws)
        return self.cdp

    def cookies(self) -> list[dict[str, object]]:
        """Read cookies, reconnecting once if the target WebSocket was lost."""
        try:
            return self._ensure_cdp().cookies()
        except Exception:  # noqa: BLE001 - reconnect once, then surface the error
            if self.cdp is not None:
                self.cdp.close()
            self.cdp = None
            return self._ensure_cdp().cookies()


def _close_browser(port: int, process: subprocess.Popen[bytes]) -> None:
    """Gracefully close the browser via CDP, then force-terminate if needed."""
    with contextlib.suppress(Exception):
        version = _http_json(f"http://127.0.0.1:{port}/json/version")
        if isinstance(version, dict) and version.get("webSocketDebuggerUrl"):
            ws = websocket.create_connection(
                str(version["webSocketDebuggerUrl"]), timeout=2.0, suppress_origin=True
            )
            ws.send(json.dumps({"id": 1, "method": "Browser.close", "params": {}}))
            ws.close()
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=5)
    if process.poll() is None:
        process.kill()


@contextlib.contextmanager
def login_window(config: StoreConfig) -> Iterator[LoginController]:
    """Open the isolated official-login window and guarantee cleanup."""
    port = _free_port()
    profile_dir = tempfile.mkdtemp(prefix="pico-login-")
    args = (
        str(find_browser()),
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        f"--app={login_start_url(config)}",
    )
    process = subprocess.Popen(args)  # noqa: S603 - explicit browser executable
    controller = LoginController(process, port)
    try:
        _wait_cdp(port, process)
        yield controller
    finally:
        if controller.cdp is not None:
            controller.cdp.close()
        _close_browser(port, process)
        shutil.rmtree(profile_dir, ignore_errors=True)


def _domain_ok(domain: str) -> bool:
    """Return whether a cookie domain belongs to an official PICO host."""
    stripped = domain.lstrip(".")
    return stripped.endswith("picoxr.com") or stripped.endswith("picovr.com")


def has_session(cdp_cookies: list[dict[str, object]]) -> bool:
    """Return whether a session cookie is present on an official domain."""
    for cookie in cdp_cookies:
        if (
            cookie.get("name") in SESSION_COOKIE_NAMES
            and _domain_ok(str(cookie.get("domain", "")))
            and cookie.get("value")
        ):
            return True
    return False


def pick_cookies(cdp_cookies: list[dict[str, object]]) -> dict[str, str]:
    """Select the persistable session cookies, preferring the picoxr.com domain."""
    chosen: dict[str, str] = {}
    for cookie in cdp_cookies:
        name = cookie.get("name")
        value = cookie.get("value")
        domain = str(cookie.get("domain", ""))
        if name in REQUIRED_COOKIE_NAMES and _domain_ok(domain) and value:
            if name not in chosen or domain.lstrip(".").endswith("picoxr.com"):
                chosen[name] = str(value)
    return chosen


def fetch_account_info(auth: PicoAuth, config: StoreConfig) -> tuple[str, dict[str, object]]:
    """Verify a session via the account-info endpoint and return ``(uid, data)``."""
    query = urlencode(
        {
            "aid": config.passport_aid,
            "device_platform": config.device_platform,
            "account_sdk_source": "app",
            "passport-sdk-version": "30490",
        }
    )
    url = f"{config.account_host.rstrip('/')}/passport/account/info/v2/?{query}"
    headers: dict[str, str] = {}
    if auth.x_tt_token:
        headers["X-Tt-Token"] = auth.x_tt_token
    if auth.cookies:
        headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in auth.cookies.items())
    request = Request(url, headers=headers, method="GET")
    try:
        with urlopen(request, timeout=25) as response:
            payload = json.loads(response.read().decode())
    except (HTTPError, URLError, ValueError) as error:
        raise BrowserLoginError(f"无法连接账号服务：{error}") from None

    if not isinstance(payload, dict) or payload.get("message") != "success":
        data = payload.get("data") if isinstance(payload, dict) else None
        code = data.get("error_code") if isinstance(data, dict) else "?"
        desc = data.get("description") if isinstance(data, dict) else ""
        raise BrowserLoginError(f"登录态无效（error_code {code}：{desc}）")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise BrowserLoginError("账号服务返回内容异常。")
    uid = data.get("user_id_str") or data.get("user_id")
    if re.fullmatch(r"[1-9][0-9]{0,19}", str(uid)) is None:
        raise BrowserLoginError("账号服务未返回有效用户信息。")
    return str(uid), data


def capture_login(
    config: StoreConfig, *, timeout_s: float = 300.0, poll_s: float = 0.8
) -> PicoAuth:
    """Run the login window until signed in, then close it and return the auth."""
    with login_window(config) as controller:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            if controller.process.poll() is not None:
                raise LoginCancelled("登录窗口已关闭，未完成登录。")
            try:
                cookies = controller.cookies()
            except Exception:  # noqa: BLE001 - transient CDP errors, keep polling
                time.sleep(poll_s)
                continue
            if has_session(cookies):
                chosen = pick_cookies(cookies)
                probe = PicoAuth("0", "", chosen, config.region)
                uid, _ = fetch_account_info(probe, config)
                return PicoAuth(uid, "", chosen, config.region)
            time.sleep(poll_s)
        raise LoginTimeout("登录超时，请重新运行登录命令。")
