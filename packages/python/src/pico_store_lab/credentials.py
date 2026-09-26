"""Account persistence through the platform credential store."""

from __future__ import annotations

import json
import sys

from keyring.backend import KeyringBackend

from pico_store_lab.protocol import PicoAuth, StoreRegion, validate_region

SERVICE = "dev.nkanf.picostore.python"
ACCOUNT = "current"


def _account(region: str) -> str:
    return ACCOUNT if validate_region(region) == "global" else "cn"


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
    account = _account(auth.region)
    value = json.dumps(
        {
            "uid": auth.uid,
            "x_tt_token": auth.x_tt_token,
            "cookies": auth.cookies,
            "region": auth.region,
        }
    )
    try:
        _backend().set_password(SERVICE, account, value)
    except Exception:
        raise RuntimeError(
            "Unable to save sign-in. Unlock the system credential store and try again."
        ) from None


def load(region: StoreRegion = "global") -> PicoAuth:
    """Read only the requested region; legacy entries belong to global."""
    account = _account(region)
    try:
        raw = _backend().get_password(SERVICE, account)
    except Exception:
        raise RuntimeError(
            "Unable to read sign-in. Unlock the system credential store and try again."
        ) from None
    if raw is None:
        raise ValueError(f"Please run pico-store-py --region {region} login first.")
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or not isinstance(data.get("cookies", {}), dict):
            raise ValueError
        stored_region = data.get("region", "global")
        if stored_region != region:
            raise ValueError
        if not isinstance(data.get("uid", "0"), str) or not isinstance(
            data.get("x_tt_token", ""), str
        ):
            raise ValueError
        if not all(
            isinstance(k, str) and isinstance(v, str) for k, v in data.get("cookies", {}).items()
        ):
            raise ValueError
        auth = PicoAuth(
            data.get("uid", "0"),
            data.get("x_tt_token", ""),
            data.get("cookies", {}),
            validate_region(stored_region),
        )
        if not auth.x_tt_token and not auth.cookies:
            raise ValueError
    except (ValueError, TypeError):
        raise ValueError("Sign-in could not be read. Please sign in again.") from None
    return auth


def clear(region: StoreRegion = "global") -> None:
    """Remove only the selected region's account session."""
    account = _account(region)
    try:
        backend = _backend()
        if backend.get_password(SERVICE, account) is not None:
            backend.delete_password(SERVICE, account)
    except Exception:
        raise RuntimeError(
            "Could not sign out. Unlock the system credential store and try again."
        ) from None
