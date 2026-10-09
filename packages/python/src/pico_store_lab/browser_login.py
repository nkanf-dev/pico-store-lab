"""Embedded official-login capture through the Chrome DevTools Protocol (CDP).

The user runs a login command, a dedicated browser window opens on the official
PICO single-sign-on page, and after a successful sign-in the window closes
automatically. The signed-in session cookies (notably ``sessionid``) are
captured via CDP, verified against the account service, and returned for the
credential store.

An installed Chromium-based browser is required. Edge and Chrome are preferred;
platform application registrations provide Chromium-family fallbacks. An
isolated temporary browser profile keeps the user's normal profile untouched.
"""

from __future__ import annotations

import configparser
import contextlib
import json
import os
import plistlib
import re
import shlex
import shutil
import socket
import subprocess
import sys
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


_PREFERRED_BROWSER_COMMANDS = (
    "msedge",
    "microsoft-edge",
    "microsoft-edge-stable",
    "chrome",
    "google-chrome",
    "google-chrome-stable",
)
_CHROMIUM_BROWSER_COMMANDS = (
    "chromium",
    "chromium-browser",
    "ungoogled-chromium",
    "brave",
    "brave-browser",
    "vivaldi",
    "opera",
    "thorium-browser",
    "arc",
)
_PREFERRED_BROWSER_TOKENS = {"chrome", "msedge", "edgemac"}
_CHROMIUM_BROWSER_TOKENS = {
    "chromium",
    "chrome",
    "msedge",
    "edgemac",
    "edge",
    "brave",
    "vivaldi",
    "opera",
    "thorium",
    "ungoogled",
    "arc",
}
_WINDOWS_APP_PATHS = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"


def _browser_family(*values: str) -> str | None:
    """Classify registered app metadata as preferred or Chromium-family."""
    tokens = set(re.findall(r"[a-z0-9]+", " ".join(values).casefold()))
    if tokens & _PREFERRED_BROWSER_TOKENS or {"microsoft", "edge"} <= tokens:
        return "preferred"
    if tokens & _CHROMIUM_BROWSER_TOKENS:
        return "chromium"
    return None


def _launchable(path: Path) -> bool:
    """Return whether a discovered path names a runnable file."""
    return path.is_file() and (sys.platform == "win32" or os.access(path, os.X_OK))


def _path_candidates(names: tuple[str, ...]) -> tuple[tuple[str, ...], ...]:
    """Resolve command names from PATH without guessing installation paths."""
    found: list[tuple[str, ...]] = []
    for name in names:
        executable = shutil.which(name)
        # Keep the resolved command exactly as the host reported it; do not
        # round-trip it through pathlib, which rewrites separators to the host
        # convention and corrupts POSIX paths discovered on another platform.
        if executable and (command := (executable,)) not in found:
            found.append(command)
    return tuple(found)


def _macos_browser_candidates(family: str) -> tuple[tuple[str, ...], ...]:
    """Discover Chromium browser bundles through Spotlight and bundle metadata."""
    app_paths: set[Path] = set()
    mdfind = shutil.which("mdfind")
    if mdfind:
        tokens = _PREFERRED_BROWSER_TOKENS if family == "preferred" else _CHROMIUM_BROWSER_TOKENS
        terms = " || ".join(
            f'(kMDItemDisplayName == "*{name}*"cd || kMDItemCFBundleIdentifier == "*{name}*"cd)'
            for name in sorted(tokens)
        )
        query = f"kMDItemContentType == 'com.apple.application-bundle' && ({terms})"
        try:
            result = subprocess.run(
                [mdfind, query], capture_output=True, check=False, text=True, timeout=3.0
            )
            app_paths.update(Path(line) for line in result.stdout.splitlines() if line)
        except (OSError, subprocess.TimeoutExpired):
            pass

    # Spotlight can be disabled or not yet indexed. Search standard app
    # registration roots and classify each bundle from its own Info.plist.
    roots = (Path("/Applications"), Path.home() / "Applications", Path("/System/Applications"))
    for root in roots:
        try:
            app_paths.update(path.parent.parent for path in root.glob("*.app/Contents/Info.plist"))
        except OSError:
            continue

    candidates: list[tuple[str, ...]] = []
    for app_path in sorted(app_paths):
        try:
            with (app_path / "Contents" / "Info.plist").open("rb") as info_file:
                info = plistlib.load(info_file)
        except (OSError, plistlib.InvalidFileException):
            continue
        if not isinstance(info, dict):
            continue
        app_family = _browser_family(
            str(info.get("CFBundleDisplayName", "")),
            str(info.get("CFBundleName", "")),
            str(info.get("CFBundleIdentifier", "")),
            str(info.get("CFBundleExecutable", "")),
        )
        if app_family != family:
            continue
        executable = info.get("CFBundleExecutable")
        if isinstance(executable, str) and executable:
            path = app_path / "Contents" / "MacOS" / executable
            if _launchable(path):
                candidates.append((str(path),))
    return tuple(candidates)


def _windows_browser_candidates(family: str) -> tuple[tuple[str, ...], ...]:
    """Discover Chromium browsers from registered Windows App Paths entries."""
    try:
        import winreg
    except ImportError:
        return ()

    candidates: list[tuple[str, ...]] = []
    views = (0, winreg.KEY_WOW64_32KEY, winreg.KEY_WOW64_64KEY)
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in views:
            try:
                root = winreg.OpenKey(hive, _WINDOWS_APP_PATHS, 0, winreg.KEY_READ | view)
            except OSError:
                continue
            with root:
                index = 0
                while True:
                    try:
                        executable = winreg.EnumKey(root, index)
                    except OSError:
                        break
                    index += 1
                    if _browser_family(executable) != family:
                        continue
                    key_path = rf"{_WINDOWS_APP_PATHS}\{executable}"
                    try:
                        with winreg.OpenKey(hive, key_path, 0, winreg.KEY_READ | view) as key:
                            value, _ = winreg.QueryValueEx(key, None)
                    except OSError:
                        continue
                    path = Path(os.path.expandvars(str(value).strip('"')))
                    if not _launchable(path):
                        continue
                    command = (str(path),)
                    if command not in candidates:
                        candidates.append(command)
    return tuple(candidates)


def _linux_application_dirs() -> tuple[Path, ...]:
    """Return XDG application registration directories in search order."""
    data_home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    data_dirs = os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share")
    roots = (data_home, *(Path(value) for value in data_dirs.split(os.pathsep) if value))
    return tuple(dict.fromkeys(root / "applications" for root in roots))


def _desktop_command(path: Path) -> tuple[tuple[str, ...], str] | None:
    """Read a safe argv and browser family from an XDG desktop entry."""
    parser = configparser.ConfigParser(interpolation=None, strict=False)
    try:
        parser.read(path, encoding="utf-8")
        entry = parser["Desktop Entry"]
        if entry.get("Type", "Application") != "Application":
            return None
        if entry.getboolean("Hidden", fallback=False) or entry.getboolean(
            "NoDisplay", fallback=False
        ):
            return None
        raw_exec = entry.get("Exec", "")
        parts = shlex.split(raw_exec)
    except (OSError, KeyError, ValueError):
        return None
    if not parts:
        return None
    # Desktop field codes are arguments supplied by a desktop shell. They are
    # irrelevant to login and must not be passed as literal browser arguments.
    argv = tuple(part for part in parts if "%" not in part)
    if not argv:
        return None
    executable = argv[0]
    resolved = shutil.which(executable)
    if resolved is None and Path(executable).is_absolute() and _launchable(Path(executable)):
        resolved = executable
    if resolved is None:
        return None
    try_exec = entry.get("TryExec")
    if try_exec and shutil.which(try_exec) is None:
        try_path = Path(try_exec)
        if not (try_path.is_absolute() and _launchable(try_path)):
            return None
    family = _browser_family(
        path.name,
        entry.get("Name", ""),
        Path(executable).name,
        entry.get("TryExec", ""),
    )
    if family is None:
        return None
    # ``resolved`` already names a runnable executable; return it verbatim so
    # POSIX paths keep their separators regardless of the host operating system.
    return (resolved, *argv[1:]), family


def _linux_browser_candidates(family: str) -> tuple[tuple[str, ...], ...]:
    """Discover registered Chromium browsers from XDG desktop entries."""
    candidates: list[tuple[str, ...]] = []
    for directory in _linux_application_dirs():
        try:
            entries = sorted(directory.glob("*.desktop"))
        except OSError:
            continue
        for entry_path in entries:
            discovered = _desktop_command(entry_path)
            if discovered is None:
                continue
            command, app_family = discovered
            if app_family == family and command not in candidates:
                candidates.append(command)
    return tuple(candidates)


def _registered_browser_candidates(family: str) -> tuple[tuple[str, ...], ...]:
    """Search platform application registrations without fixed browser paths."""
    if sys.platform == "darwin":
        return _macos_browser_candidates(family)
    if sys.platform == "win32":
        return _windows_browser_candidates(family)
    if sys.platform.startswith("linux"):
        return _linux_browser_candidates(family)
    return ()


def find_browser() -> tuple[str, ...]:
    """Find Edge or Chrome quickly, then any registered Chromium browser."""
    preferred = _path_candidates(_PREFERRED_BROWSER_COMMANDS)
    if preferred:
        return preferred[0]

    preferred_registered = _registered_browser_candidates("preferred")
    if preferred_registered:
        return preferred_registered[0]

    chromium = _path_candidates(_CHROMIUM_BROWSER_COMMANDS)
    if chromium:
        return chromium[0]
    chromium_registered = _registered_browser_candidates("chromium")
    if chromium_registered:
        return chromium_registered[0]
    raise BrowserLoginError(
        "No Microsoft Edge, Google Chrome, or other Chromium-based browser was found. "
        "Please install one and try again."
    )


def _browser_command(browser_path: str | Path | None) -> tuple[str, ...]:
    """Resolve an explicit browser path or run automatic discovery."""
    if browser_path is None:
        return find_browser()
    candidate = Path(browser_path).expanduser()
    if _launchable(candidate):
        return (str(candidate),)
    if not candidate.is_absolute() and (resolved := shutil.which(str(browser_path))):
        return (resolved,)
    raise BrowserLoginError(f"The specified browser is not executable: {browser_path}")


def _free_port() -> int:
    """Return an currently unused loopback TCP port."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def login_start_url(config: StoreConfig) -> str:
    """Build the official SSO URL that returns to the region store after login."""
    service = f"{config.web_store_host.rstrip('/')}/{config.web_region}/"
    return f"{config.sso_host.rstrip('/')}/passport?" + urlencode({"service": service})


def _http_json(url: str, timeout: float = 2.0) -> object:
    """Fetch a JSON document over plain HTTP (the local CDP endpoint)."""
    with urlopen(url, timeout=timeout) as response:  # noqa: S310 - fixed loopback address
        return json.loads(response.read().decode())


def _wait_cdp(port: int, process: subprocess.Popen[bytes], deadline_s: float = 20.0) -> object:
    """Wait until the browser exposes its CDP endpoint or the window closes."""
    deadline = time.monotonic() + deadline_s
    while (remaining := deadline - time.monotonic()) > 0:
        if process.poll() is not None:
            raise LoginCancelled("The login window was closed before sign-in completed.")
        try:
            return _http_json(f"http://127.0.0.1:{port}/json/version", timeout=min(2.0, remaining))
        except (URLError, OSError, ValueError):
            time.sleep(0.2)
    raise BrowserLoginError("Could not connect to the browser's remote debugging port.")


def _page_ws_url(port: int, deadline_s: float = 20.0) -> str:
    """Return the WebSocket debugger URL of the visible login page target."""
    deadline = time.monotonic() + deadline_s
    while (remaining := deadline - time.monotonic()) > 0:
        try:
            targets = _http_json(f"http://127.0.0.1:{port}/json", timeout=min(2.0, remaining))
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
    raise LoginTimeout("No login page target was found in the browser.")


class _Cdp:
    """Minimal synchronous CDP client over one target WebSocket."""

    def __init__(self, ws: websocket.WebSocket, *, timeout_s: float = 10.0) -> None:
        """Wrap an established WebSocket and enable the needed domains."""
        self.ws = ws
        self._next_id = 0
        deadline = time.monotonic() + timeout_s
        self.call("Page.enable", timeout_s=deadline - time.monotonic())
        self.call("Network.enable", timeout_s=deadline - time.monotonic())

    def call(
        self,
        method: str,
        params: dict[str, object] | None = None,
        *,
        timeout_s: float = 10.0,
    ) -> dict[str, object]:
        """Send one CDP command and wait for its matching response."""
        if timeout_s <= 0:
            raise LoginTimeout(f"Timed out waiting for the browser response to {method}.")
        self._next_id += 1
        message_id = self._next_id
        deadline = time.monotonic() + timeout_s
        self.ws.settimeout(min(2.0, timeout_s))
        self.ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise LoginTimeout(f"Timed out waiting for the browser response to {method}.")
            self.ws.settimeout(min(2.0, remaining))
            try:
                data = json.loads(self.ws.recv())
            except websocket.WebSocketTimeoutException:
                continue
            if isinstance(data, dict) and data.get("id") == message_id:
                if "error" in data:
                    raise BrowserLoginError(f"CDP {method} failed: {data['error']}")
                result = data.get("result")
                return result if isinstance(result, dict) else {}

    def cookies(self, *, timeout_s: float = 10.0) -> list[dict[str, object]]:
        """Return every browser cookie, including HttpOnly session cookies."""
        result = self.call("Network.getAllCookies", timeout_s=timeout_s)
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

    def _ensure_cdp(self, *, timeout_s: float = 10.0) -> _Cdp:
        """Create or recreate the page CDP client after navigation/errors."""
        if self.cdp is None:
            deadline = time.monotonic() + timeout_s
            if timeout_s <= 0:
                raise LoginTimeout("Timed out connecting to the browser login page.")
            ws_url = _page_ws_url(self.port, deadline_s=timeout_s)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise LoginTimeout("Timed out connecting to the browser login page.")
            ws = websocket.create_connection(
                ws_url,
                timeout=min(2.0, remaining),
                suppress_origin=True,
            )
            self.cdp = _Cdp(ws, timeout_s=deadline - time.monotonic())
        return self.cdp

    def cookies(self, *, timeout_s: float = 10.0) -> list[dict[str, object]]:
        """Read cookies, reconnecting once if the target WebSocket was lost."""
        deadline = time.monotonic() + timeout_s
        if timeout_s <= 0:
            raise LoginTimeout("Timed out reading the browser login state.")
        try:
            cdp = self._ensure_cdp(timeout_s=deadline - time.monotonic())
            return cdp.cookies(timeout_s=deadline - time.monotonic())
        except LoginTimeout:
            raise
        except Exception:  # noqa: BLE001 - reconnect once, then surface the error
            if self.cdp is not None:
                self.cdp.close()
            self.cdp = None
            remaining = deadline - time.monotonic()
            cdp = self._ensure_cdp(timeout_s=remaining)
            return cdp.cookies(timeout_s=deadline - time.monotonic())


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
def login_window(
    config: StoreConfig, *, browser_path: str | Path | None = None
) -> Iterator[LoginController]:
    """Open the isolated official-login window and guarantee cleanup."""
    port = _free_port()
    profile_dir = tempfile.mkdtemp(prefix="pico-login-")
    args = (
        *_browser_command(browser_path),
        f"--remote-debugging-port={port}",
        "--remote-debugging-address=127.0.0.1",
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


def _canonical_cookie_domain(domain: str) -> str:
    """Normalize the optional cookie-domain dot without repairing malformed names."""
    normalized = domain.strip().lower()
    if normalized.startswith("."):
        normalized = normalized[1:]
    if normalized.endswith("."):
        normalized = normalized[:-1]
    return normalized


def _domain_ok(domain: str) -> bool:
    """Return whether a cookie domain belongs to an official PICO host."""
    normalized = _canonical_cookie_domain(domain)
    if normalized.startswith(".") or normalized.endswith("."):
        return False
    return any(
        normalized == root or normalized.endswith(f".{root}")
        for root in ("picoxr.com", "picovr.com")
    )


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
            normalized = _canonical_cookie_domain(domain)
            is_picoxr = normalized == "picoxr.com" or normalized.endswith(".picoxr.com")
            if name not in chosen or is_picoxr:
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
        raise BrowserLoginError(f"Could not reach the account service: {error}") from None

    if not isinstance(payload, dict) or payload.get("message") != "success":
        data = payload.get("data") if isinstance(payload, dict) else None
        code = data.get("error_code") if isinstance(data, dict) else "?"
        desc = data.get("description") if isinstance(data, dict) else ""
        raise BrowserLoginError(f"The sign-in session is invalid (error_code {code}: {desc})")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise BrowserLoginError("The account service returned an unexpected response.")
    uid = data.get("user_id_str") or data.get("user_id")
    if re.fullmatch(r"[1-9][0-9]{0,19}", str(uid)) is None:
        raise BrowserLoginError("The account service did not return a valid account identity.")
    return str(uid), data


def capture_login(
    config: StoreConfig,
    *,
    browser_path: str | Path | None = None,
    timeout_s: float = 300.0,
    poll_s: float = 0.8,
) -> PicoAuth:
    """Run the login window until signed in, then close it and return the auth."""
    with login_window(config, browser_path=browser_path) as controller:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            if controller.process.poll() is not None:
                raise LoginCancelled("The login window was closed before sign-in completed.")
            try:
                cookies = controller.cookies(timeout_s=deadline - time.monotonic())
            except Exception:  # noqa: BLE001 - transient CDP errors, keep polling
                time.sleep(poll_s)
                continue
            if has_session(cookies):
                chosen = pick_cookies(cookies)
                probe = PicoAuth("0", "", chosen, config.region)
                uid, _ = fetch_account_info(probe, config)
                return PicoAuth(uid, "", chosen, config.region)
            time.sleep(poll_s)
        raise LoginTimeout("Sign-in timed out. Run the login command again.")
