"""Small bilingual command-line client built on the Python SDK."""

from __future__ import annotations

import argparse
import getpass
import json
import sys
from pathlib import Path

from pico_store_lab import credentials
from pico_store_lab.client import PicoStoreClient
from pico_store_lab.protocol import StoreTarget

MESSAGES = {
    "en": {
        "sent": "PICO verification email sent.",
        "saved": "Signed in.",
        "downloaded": "Downloaded: {path}",
        "signed_out": "Signed out.",
        "error": "Error: {message}",
    },
    "zh-CN": {
        "sent": "PICO 验证码邮件已发送。",
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
    sub = parser.add_subparsers(dest="command", required=True)
    search = sub.add_parser("search", help="Search official PICO apps")
    search.add_argument("word")
    status = sub.add_parser("status", help="Show an official PICO item")
    status.add_argument("--item-id", required=True)
    status.add_argument("--package", required=True)
    send = sub.add_parser("send-code", help="Send a PICO email code")
    send.add_argument("--email", required=True)
    login = sub.add_parser("login", help="Sign in to your PICO international account")
    login.add_argument("--email", required=True)
    sub.add_parser("logout", help="Sign out")
    download = sub.add_parser("download", help="Download an app")
    download.add_argument("--output", required=True, type=Path)
    download.add_argument("--item-id", required=True)
    download.add_argument("--package", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run one command; return a process exit status without leaking credentials."""
    args = build_parser().parse_args(argv)
    client = PicoStoreClient()
    try:
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
            client.send_code(args.email)
            print(_message(args.locale, "sent"))
        elif args.command == "login":
            code = getpass.getpass("PICO email code: ")
            auth = client.login(args.email, code)
            credentials.save(auth)
            print(_message(args.locale, "saved"))
        elif args.command == "logout":
            credentials.clear()
            print(_message(args.locale, "signed_out"))
        elif args.command == "download":
            target = StoreTarget(args.item_id, args.package)
            client.download(target, credentials.load(), args.output)
            print(_message(args.locale, "downloaded", path=str(args.output)))
    except (OSError, ValueError, RuntimeError) as error:
        print(_message(args.locale, "error", message=str(error)), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
