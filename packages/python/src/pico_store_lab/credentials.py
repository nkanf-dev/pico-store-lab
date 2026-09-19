"""Account persistence through the platform credential store."""

from __future__ import annotations

import json
import sys

from keyring.backend import KeyringBackend

from pico_store_lab.protocol import PicoAuth

SERVICE = "dev.nkanf.picostore.python"
ACCOUNT = "current"


def _backend() -> KeyringBackend:
    # Select native stores directly: never load a configured plaintext/null backend.
    if sys.platform == "darwin":
        from keyring.backends.macOS import Keyring

        return Keyring()
    if sys.platform == "win32":
        from keyring.backends.Windows import WinVaultKeyring

        return WinVaultKeyring()
    if sys.platform.startswith("linux"):
        from keyring.backends.SecretService import Keyring

        return Keyring()
    raise RuntimeError("Sign-in requires Windows, macOS, or Linux.")


def save(auth: PicoAuth) -> None:
    """Save a usable account session."""
    if not auth.x_tt_token and not auth.cookies:
        raise ValueError("Sign-in returned no usable session. Please sign in again.")
    value = json.dumps({"uid": auth.uid, "x_tt_token": auth.x_tt_token, "cookies": auth.cookies})
    try:
        _backend().set_password(SERVICE, ACCOUNT, value)
    except Exception:
        raise RuntimeError(
            "Unable to save sign-in. Unlock the system credential store and try again."
        ) from None


def load() -> PicoAuth:
    """Read the current account session."""
    try:
        raw = _backend().get_password(SERVICE, ACCOUNT)
    except Exception:
        raise RuntimeError(
            "Unable to read sign-in. Unlock the system credential store and try again."
        ) from None
    if raw is None:
        raise ValueError("Please run pico-store-py login first.")
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or not isinstance(data.get("cookies", {}), dict):
            raise ValueError
        auth = PicoAuth(
            str(data.get("uid", "0")),
            str(data.get("x_tt_token", "")),
            {str(key): str(value) for key, value in data.get("cookies", {}).items()},
        )
        if not auth.x_tt_token and not auth.cookies:
            raise ValueError
    except (ValueError, TypeError):
        raise ValueError("Sign-in could not be read. Please sign in again.") from None
    return auth


def clear() -> None:
    """Remove the current account session."""
    try:
        backend = _backend()
        if backend.get_password(SERVICE, ACCOUNT) is not None:
            backend.delete_password(SERVICE, ACCOUNT)
    except Exception:
        raise RuntimeError(
            "Could not sign out. Unlock the system credential store and try again."
        ) from None
