"""Small bilingual command-line client built on the Python SDK."""

from __future__ import annotations

import argparse
import getpass
import json
import sys
from dataclasses import replace
from pathlib import Path

from pico_store_lab import credentials
from pico_store_lab.client import PicoStoreClient
from pico_store_lab.protocol import StoreConfig, StoreTarget

MESSAGES = {
    "en": {
        "sent": "PICO verification email sent.",
        "sms_sent": "PICO SMS verification code sent.",
        "saved": "Signed in.",
        "downloaded": "Downloaded: {path}",
        "signed_out": "Signed out.",
        "error": "Error: {message}",
    },
    "zh-CN": {
        "sent": "PICO 验证码邮件已发送。",
        "sms_sent": "PICO 短信验证码已发送。",
        "saved": "已登录。",
        "downloaded": "已下载：{path}",
        "signed_out": "已退出登录。",
        "error": "错误：{message}",
    },
}


def _message(locale: str, key: str, **values: str) -> str:
    return MESSAGES[locale][key].format(**values)


def build_parser() -> argparse.ArgumentParser:
    """Create the stable CLI argument parser."""
    parser = argparse.ArgumentParser(prog="pico-store-py", description="PICO Store Lab Python CLI")
    parser.add_argument("--locale", choices=("en", "zh-CN"), default="en")
    parser.add_argument(
        "--region",
        choices=("global", "cn"),
        default="global",
        help="Store and account region (default: global)",
    )
    parser.add_argument("--device", help="PICO device model for app availability")
    sub = parser.add_subparsers(dest="command", required=True)
    search = sub.add_parser("search", help="Search official PICO apps")
    search.add_argument("word")
    status = sub.add_parser("status", help="Show an official PICO item")
    status.add_argument("--item-id", required=True)
    status.add_argument("--package", required=True)
    send = sub.add_parser("send-code", help="Send a PICO email or SMS code")
    login = sub.add_parser("login", help="Sign in to your PICO account")
    for account in (send, login):
        identity = account.add_mutually_exclusive_group(required=True)
        identity.add_argument("--email", help="International account email")
        identity.add_argument("--mobile", help="China account phone number, without country code")
        account.add_argument(
            "--country-code", default="86", help="Phone country code (default: 86)"
        )
    sub.add_parser(
        "login-window",
        aliases=["login-gui"],
        help="Open the official login window, then save the session automatically",
    )
    sub.add_parser("logout", help="Sign out")
    download = sub.add_parser("download", help="Download an app")
    download.add_argument("--output", required=True, type=Path)
    download.add_argument("--item-id", required=True)
    download.add_argument("--package", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run one command; return a process exit status without leaking credentials."""
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command in ("send-code", "login"):
        if args.region == "cn" and not args.mobile:
            parser.error("--region cn requires --mobile")
        if args.region == "global" and not args.email:
            parser.error("--region global requires --email")
    try:
        config = StoreConfig.for_region(args.region)
        if args.device:
            config = replace(config, device_name=args.device)
        client = PicoStoreClient(config=config)
        if args.command == "search":
            result = client.search(args.word)
            print(
                json.dumps(
                    [
                        {
                            "name": item.name,
                            "itemId": item.item_id,
                            "packageName": item.package_name,
                            "versionCode": item.version_code,
                        }
                        for item in result.items
                    ],
                    indent=2,
                )
            )
        elif args.command == "status":
            target = StoreTarget(args.item_id, args.package)
            item = client.item(target)
            print(
                json.dumps(
                    {
                        "name": item.name,
                        "versionCode": item.version_code,
                        "price": item.price,
                        "officialUrl": item.official_url,
                    },
                    indent=2,
                )
            )
        elif args.command == "send-code":
            if args.region == "cn":
                client.send_mobile_code(args.mobile, country_code=args.country_code)
                print(_message(args.locale, "sms_sent"))
            else:
                client.send_code(args.email)
                print(_message(args.locale, "sent"))
        elif args.command == "login":
            if args.region == "cn":
                code = getpass.getpass("PICO SMS code: ")
                auth = client.login_mobile(args.mobile, code, country_code=args.country_code)
            else:
                code = getpass.getpass("PICO email code: ")
                auth = client.login(args.email, code)
            credentials.save(auth)
            print(_message(args.locale, "saved"))
        elif args.command in ("login-window", "login-gui"):
            from pico_store_lab.browser_login import capture_login

            auth = capture_login(config)
            credentials.save(auth)
            print(_message(args.locale, "saved"))
        elif args.command == "logout":
            credentials.clear(args.region)
            print(_message(args.locale, "signed_out"))
        elif args.command == "download":
            target = StoreTarget(args.item_id, args.package)
            client.download(target, credentials.load(args.region), args.output)
            print(_message(args.locale, "downloaded", path=str(args.output)))
    except (OSError, ValueError, RuntimeError) as error:
        print(_message(args.locale, "error", message=str(error)), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
