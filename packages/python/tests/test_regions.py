"""Region boundaries and China SMS request contracts."""

import json
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit

from pico_store_lab import PicoAuth, PicoStoreClient, StoreConfig, StoreResponse, StoreTarget
from pico_store_lab.protocol import (
    make_account_item_request,
    make_account_request,
    make_download_info_request,
    make_free_acquisition_request,
    make_mobile_account_request,
    make_public_item_request,
    make_search_request,
    parse_public_item,
)

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/v1/fixtures.json").read_text()
)["china"]


class RegionTests(unittest.TestCase):
    """Keep endpoints, identities and sessions within the selected region."""

    def setUp(self) -> None:
        """Use a synthetic account and the public China listing."""
        self.config = StoreConfig.for_region("cn")
        self.target = StoreTarget(FIXTURE["itemId"], FIXTURE["packageName"])

    def test_region_profiles(self) -> None:
        """The legacy profile stays unchanged; China gets its own identity."""
        self.assertEqual(StoreConfig.for_region("global"), StoreConfig())
        spec = make_public_item_request(config=self.config, target=self.target, timestamp=1)
        self.assertEqual(urlsplit(spec.url).hostname, "appstore-cn.picoxr.com")
        query = parse_qs(urlsplit(spec.url).query)
        self.assertEqual(query["app_id"], [FIXTURE["storeAppId"]])
        self.assertEqual(query["device_name"], ["B3110"])
        self.assertEqual(query["app_language"], ["zh"])
        self.assertIn(
            "appstore-cn.picoxr.com", make_search_request("AeriPane", config=self.config).url
        )
        item = parse_public_item(FIXTURE["publicResponse"], self.target, self.config)
        self.assertEqual(
            item.official_url, f"https://store.picoxr.com/cn/detail/1/{self.target.item_id}"
        )
        with self.assertRaises(ValueError):
            StoreConfig.for_region("unknown")
        with self.assertRaisesRegex(ValueError, "endpoint"):
            StoreConfig(store_host="https://appstore-cn.picoxr.com")

    def test_mobile_requests_match_contract(self) -> None:
        """Phone/type/code are XOR-5 fields, not query-string credentials."""
        for kind in ("send-code", "login"):
            spec = make_mobile_account_request(kind, "19900000000", "123456", config=self.config)
            self.assertEqual(urlsplit(spec.url).hostname, "matrix-cn.picovr.com")
            self.assertEqual(parse_qs(urlsplit(spec.url).query)["aid"], [FIXTURE["passportAid"]])
            self.assertEqual(urlsplit(spec.url).path, FIXTURE["sms"][kind]["path"])
            self.assertEqual(
                parse_qs(spec.body), {k: [v] for k, v in FIXTURE["sms"][kind]["fields"].items()}
            )
            self.assertNotIn("19900000000", spec.url)
        self.assertIn("code_login", make_account_request("login", "test@example.com", "ABC234").url)

    def test_reject_invalid_account_inputs(self) -> None:
        """Reject wrong channels and malformed identifiers before any request."""
        with self.assertRaises(ValueError):
            make_mobile_account_request("send-code", "19900000000")
        with self.assertRaises(ValueError):
            make_account_request("send-code", "test@example.com", config=self.config)
        for mobile in ("", "19900\n000000", "+8619900000000", "phone", "1990000000"):
            with self.subTest(mobile=mobile), self.assertRaises(ValueError):
                make_mobile_account_request("send-code", mobile, config=self.config)
        for code in (None, "", "12345", "1234567", "ABCDEF", "１２３４５６"):
            with self.subTest(code=code), self.assertRaises(ValueError):
                make_mobile_account_request("login", "19900000000", code, config=self.config)
        with self.assertRaises(ValueError):
            make_mobile_account_request(
                "send-code", "19900000000", country_code="+86", config=self.config
            )

    def test_cross_region_auth_is_rejected_before_transport(self) -> None:
        """No authenticated operation may silently reuse the other region."""
        calls = []

        def transport(spec: object, retries: int) -> StoreResponse:
            calls.append(spec)
            raise AssertionError("must not send a cross-region request")

        client = PicoStoreClient(transport, self.config)
        auth = PicoAuth("123", "global-secret")
        item = parse_public_item(FIXTURE["publicResponse"], self.target, self.config)
        for operation in (
            lambda: client.item(self.target, auth),
            lambda: client.acquire_free(item, auth),
            lambda: client.download_info(self.target, auth),
        ):
            with self.assertRaisesRegex(ValueError, "region"):
                operation()
        self.assertEqual(calls, [])
        cn_auth = PicoAuth("123", "cn-secret", region="cn")
        with self.assertRaisesRegex(ValueError, "region"):
            make_download_info_request(cn_auth)
        for spec in (
            make_account_item_request(cn_auth, self.target, self.config),
            make_free_acquisition_request(cn_auth, item, self.config),
            make_download_info_request(cn_auth, target=self.target, config=self.config),
        ):
            self.assertEqual(spec.headers["X-Tt-Token"], "cn-secret")
            self.assertEqual(urlsplit(spec.url).hostname, "appstore-cn.picoxr.com")
        self.assertNotIn("cn-secret", repr(cn_auth))

    def test_sms_client_returns_region_and_does_not_retry(self) -> None:
        """Session creation accepts a real login response and retains its region."""
        calls = []

        def transport(spec: object, retries: int) -> StoreResponse:
            calls.append(retries)
            headers = Message()
            headers.add_header("Set-Cookie", "sessionid=synthetic; Secure; HttpOnly")
            return StoreResponse({"message": "success", "data": {"user_id_str": "123"}}, headers)

        client = PicoStoreClient(transport, self.config)
        client.send_mobile_code("19900000000")
        auth = client.login_mobile("19900000000", "123456")
        self.assertEqual(auth.region, "cn")
        self.assertEqual(auth.uid, "123")
        self.assertEqual(auth.cookies["sessionid"], "synthetic")
        self.assertEqual(calls, [1, 1])

    def test_registration_challenge_and_incomplete_login_are_not_sessions(self) -> None:
        """Never save a registration ticket, challenge, or anonymous response."""
        for data in (
            {"message": "error", "data": {"error_code": 1105, "description": "secret"}},
            {"message": "success", "data": {"new_user": 1, "sms_code_key": "secret"}},
            {"message": "success", "data": {"user_id": 0}},
            {"message": "success", "data": {"user_id_str": "123"}},
        ):
            headers = Message()
            headers.add_header("Set-Cookie", "passport_csrf_token=secret; Path=/")
            transport = Mock(return_value=StoreResponse(data, headers))
            client = PicoStoreClient(transport, self.config)
            with self.subTest(data=data), self.assertRaises(RuntimeError) as caught:
                client.login_mobile("19900000000", "123456")
            self.assertNotIn("secret", str(caught.exception))
            self.assertEqual(transport.call_count, 1)
            self.assertEqual(transport.call_args.args[1], 1)

    def test_sms_rate_limit_is_reported_without_retry(self) -> None:
        """PICO code 7 is a cooldown, not permission to resend automatically."""
        transport = Mock(
            return_value=StoreResponse(
                {
                    "message": "error",
                    "data": {"error_code": 7, "description": "private upstream payload"},
                },
                Message(),
            )
        )
        client = PicoStoreClient(transport, self.config)
        with self.assertRaisesRegex(RuntimeError, "rate limit") as caught:
            client.send_mobile_code("19900000000")
        self.assertNotIn("private", str(caught.exception))
        self.assertEqual(transport.call_count, 1)
        self.assertEqual(transport.call_args.args[1], 1)

    def test_global_login_preserves_valid_first_signin_response(self) -> None:
        """A completed international login is not a China registration continuation."""
        headers = Message()
        headers.add_header("x-tt-token", "synthetic-global-session")
        transport = Mock(
            return_value=StoreResponse(
                {"message": "success", "data": {"user_id_str": "123", "is_new_user": 1}}, headers
            )
        )
        auth = PicoStoreClient(transport).login("test@example.com", "ABC234")
        self.assertEqual(auth.region, "global")
        self.assertEqual(auth.uid, "123")

    def test_china_free_acquisition_and_metadata(self) -> None:
        """China CNY acquisition is confirmed before requesting package metadata."""
        calls = []
        owned = False

        def transport(spec: object, retries: int) -> StoreResponse:
            nonlocal owned
            path = urlsplit(spec.url).path
            calls.append(path)
            self.assertEqual(urlsplit(spec.url).hostname, "appstore-cn.picoxr.com")
            self.assertEqual(spec.headers["Cookie"], "sessionid=synthetic")
            if path.endswith("item/info"):
                data = {
                    **FIXTURE["publicResponse"]["data"],
                    "entitlement_status": 1 if owned else 2,
                }
                return StoreResponse({"code": 0, "data": data}, Message())
            if path.endswith("item/price"):
                self.assertEqual(retries, 1)
                self.assertEqual(json.loads(spec.body)["currency"], "CNY")
                owned = True
                return StoreResponse({"code": 0, "data": {"free": True, "order_id": 42}}, Message())
            return StoreResponse(
                {
                    "code": 0,
                    "data": {
                        "item_id": self.target.item_id,
                        "package": {
                            "package_name": self.target.package_name,
                            "version_code": 26,
                            "version": "1.1.6",
                            "size": 42,
                            "md5": "a" * 32,
                            "path": "https://cdn.example.test/cn.apk",
                        },
                    },
                },
                Message(),
            )

        client = PicoStoreClient(transport, self.config)
        auth = PicoAuth("123", cookies={"sessionid": "synthetic"}, region="cn")
        self.assertEqual(client.ensure_entitlement(self.target, auth).entitlement_status, 1)
        self.assertEqual(client.download_info(self.target, auth).version_code, 26)
        self.assertEqual([p.rsplit("/", 1)[-1] for p in calls], ["info", "price", "info", "info"])


if __name__ == "__main__":
    unittest.main()
