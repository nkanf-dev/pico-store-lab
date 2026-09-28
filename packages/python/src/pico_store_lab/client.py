"""Composable network client for the complete PICO store acquisition flow."""

from __future__ import annotations

import hashlib
import os
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from email.message import Message
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pico_store_lab.protocol import (
    DEFAULT_CONFIG,
    DownloadInfo,
    PicoAuth,
    PublicItem,
    RequestSpec,
    SearchResults,
    StoreConfig,
    StoreTarget,
    filter_search_items,
    make_account_item_request,
    make_account_request,
    make_download_info_request,
    make_free_acquisition_request,
    make_mobile_account_request,
    make_public_item_request,
    make_search_request,
    parse_download_info,
    parse_free_acquisition,
    parse_official_json,
    parse_public_item,
    parse_search_results,
)


@dataclass(frozen=True, slots=True)
class StoreResponse:
    """Decoded API payload and raw response headers."""

    data: object
    headers: Message


Transport = Callable[[RequestSpec, int], StoreResponse]


def send_request(spec: RequestSpec, retries: int = 3) -> StoreResponse:
    """Send a protocol request with bounded retries for transient failures."""
    if retries < 1:
        raise ValueError("at least one request attempt required")
    last_error: Exception | None = None
    for attempt in range(retries):
        request = Request(
            spec.url, data=spec.body.encode("utf-8"), headers=spec.headers, method=spec.method
        )
        try:
            with urlopen(request, timeout=25) as response:  # noqa: S310 - SDK selects official URLs
                body = response.read(4 * 1024 * 1024 + 1)
                if len(body) > 4 * 1024 * 1024:
                    raise RuntimeError("PICO response exceeds 4 MiB")
                return StoreResponse(parse_official_json(body.decode()), response.headers)
        except HTTPError as error:
            if error.code < 500 and error.code != 429:
                raise RuntimeError(f"PICO HTTP {error.code}") from error
            last_error = error
        except URLError as error:
            last_error = error
        if attempt + 1 < retries:
            time.sleep(min(attempt + 1, 5))
    raise RuntimeError(f"PICO request failed: {last_error}")


def _account_data(response: StoreResponse) -> dict[str, object]:
    data = response.data
    if not isinstance(data, dict) or data.get("message") != "success":
        body = data.get("data") if isinstance(data, dict) else None
        code = body.get("error_code") if isinstance(body, dict) else None
        if type(code) is int:
            if code == 7:
                raise RuntimeError("PICO rate limit reached. Wait before requesting another code.")
            if code in (1104, 1105):
                raise RuntimeError(
                    "PICO requires additional verification. Complete it on PICO's sign-in page."
                )
            raise RuntimeError(f"PICO account request rejected (code {code})")
        raise RuntimeError("PICO account request rejected")
    body = data.get("data")
    return body if isinstance(body, dict) else {}


def download_verified_apk(info: DownloadInfo, output: Path, retries: int = 8) -> Path:
    """Download official APK bytes and verify the provided MD5 before publishing a file."""
    if retries < 1:
        raise ValueError("at least one download attempt required")
    if output.suffix.lower() != ".apk" or output.exists():
        raise ValueError("new .apk output path required")
    temporary = output.with_name(f"{output.stem}.part.apk")
    last_error: Exception | None = None
    for attempt in range(retries):
        digest = hashlib.md5()  # noqa: S324 - official APK metadata supplies MD5
        try:
            with urlopen(info.url, timeout=60) as response:  # noqa: S310 - validated HTTPS URL
                with temporary.open("wb") as stream:
                    while chunk := response.read(65536):
                        digest.update(chunk)
                        stream.write(chunk)
            if digest.hexdigest() != info.md5:
                temporary.unlink(missing_ok=True)
                raise ValueError("APK digest mismatch")
            os.link(temporary, output)
            temporary.unlink()
            return output
        except (OSError, URLError) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(min(attempt + 1, 5))
    raise RuntimeError(f"APK download failed: {last_error}")


class PicoStoreClient:
    """High-level SDK interface; callers may replace transport at any point."""

    def __init__(
        self, transport: Transport = send_request, config: StoreConfig = DEFAULT_CONFIG
    ) -> None:
        """Use the standard HTTP transport unless one is injected."""
        self.transport = transport
        self.config = config

    def search(self, word: str, next_id: int = 1, price: str | None = None) -> SearchResults:
        """Search the official public app catalog, optionally filtering by price."""
        response = self.transport(
            make_search_request(
                word, next_id=next_id, language=self.config.language, config=self.config
            ),
            3,
        )
        results = parse_search_results(response.data)
        if price is not None:
            return SearchResults(filter_search_items(results.items, price), results.next_id)
        return results

    def item(self, target: StoreTarget, auth: PicoAuth | None = None) -> PublicItem:
        """Read and validate public metadata for the selected app."""
        request = (
            make_account_item_request(auth, target, self.config)
            if auth
            else make_public_item_request(
                target=target,
                language=self.config.language,
                zone=self.config.zone,
                config=self.config,
            )
        )
        response = self.transport(request, 3)
        return parse_public_item(response.data, target, self.config)

    def acquire_free(self, item: PublicItem, auth: PicoAuth) -> str:
        """Request a free app for the signed-in account."""
        return parse_free_acquisition(
            self.transport(make_free_acquisition_request(auth, item, self.config), 1).data
        )

    def ensure_entitlement(self, target: StoreTarget, auth: PicoAuth) -> PublicItem:
        """Confirm ownership or acquire a free offer before downloading."""
        current = self.item(target, auth)
        if current.entitlement_status == 1:
            return current
        if current.offer_exists is not True:
            raise RuntimeError("PICO has no offer for this account region")
        if not re.fullmatch(r"0(?:\.0+)?", current.price):
            raise RuntimeError("PICO app is not free or already owned")
        acquisition_error: Exception | None = None
        try:
            self.acquire_free(current, auth)
        except Exception as error:
            acquisition_error = error
        for attempt in range(3):
            try:
                updated = self.item(target, auth)
            except Exception as error:
                if attempt == 2:
                    if acquisition_error is not None:
                        raise acquisition_error from error
                    raise
                time.sleep(0.4)
                continue
            if updated.entitlement_status == 1:
                return updated
            if attempt < 2:
                time.sleep(0.4)
        if acquisition_error is not None:
            raise acquisition_error
        raise RuntimeError("PICO entitlement was not confirmed after free acquisition")

    def send_code(self, email: str) -> None:
        """Send one PICO email verification code."""
        _account_data(
            self.transport(make_account_request("send-code", email, config=self.config), 1)
        )

    def login(self, email: str, code: str) -> PicoAuth:
        """Exchange the email code for the caller's PICO account session."""
        response = self.transport(make_account_request("login", email, code, self.config), 1)
        return self._login_session(response)

    def send_mobile_code(self, mobile: str, *, country_code: str = "86") -> None:
        """Send one SMS code to an existing China-region account."""
        request = make_mobile_account_request(
            "send-code", mobile, country_code=country_code, config=self.config
        )
        _account_data(self.transport(request, 1))

    def login_mobile(self, mobile: str, code: str, *, country_code: str = "86") -> PicoAuth:
        """Exchange a China SMS code without registering a new account."""
        request = make_mobile_account_request(
            "login", mobile, code, country_code=country_code, config=self.config
        )
        return self._login_session(self.transport(request, 1))

    def _login_session(self, response: StoreResponse) -> PicoAuth:
        data = _account_data(response)
        if self.config.region == "cn" and data.get("sms_code_key"):
            raise RuntimeError("Register your account on PICO's website, then sign in again.")
        user_id = data.get("user_id_str") or data.get("user_id")
        if isinstance(user_id, bool) or re.fullmatch(r"[1-9][0-9]{0,19}", str(user_id)) is None:
            raise RuntimeError("PICO login returned no valid account identity")
        cookies: dict[str, str] = {}
        for line in response.headers.get_all("Set-Cookie", []):
            key, separator, value = line.split(";", 1)[0].partition("=")
            if separator:
                cookies[key] = value
        auth = PicoAuth(
            str(user_id),
            str(response.headers.get("x-tt-token", "")),
            cookies,
            self.config.region,
        )
        if not auth.x_tt_token and not any(
            auth.cookies.get(name) for name in ("sessionid", "sessionid_ss", "sid_tt")
        ):
            raise RuntimeError("PICO login returned no usable session")
        return auth

    def download_info(self, target: StoreTarget, auth: PicoAuth) -> DownloadInfo:
        """Read download metadata authorized for the caller's own account."""
        response = self.transport(
            make_download_info_request(
                auth,
                target=target,
                language=self.config.language,
                zone=self.config.zone,
                config=self.config,
            ),
            3,
        )
        return parse_download_info(response.data, target)

    def download(self, target: StoreTarget, auth: PicoAuth, output: Path) -> Path:
        """Get and verify an official APK in one call."""
        self.ensure_entitlement(target, auth)
        return download_verified_apk(self.download_info(target, auth), output)
