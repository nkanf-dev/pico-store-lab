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

LOCALES = ("en", "zh-CN")

# Every user-facing CLI string lives here so that ``--locale`` translates the
# whole interface (help, prompts, validation errors and result messages), not
# just a handful of status lines. Command names and option names are never
# translated; only their descriptions are.
STRINGS = {
    "en": {
        "description": "PICO Store Lab Python CLI",
        "heading_positional": "positional arguments",
        "heading_options": "options",
        "help_action_help": "show this help message and exit",
        "locale_help": "Language for CLI help and messages (default: en)",
        "region_help": "Store and account region (default: global)",
        "device_help": "PICO device model for app availability",
        "search_help": "Search official PICO apps",
        "word_help": "Search keyword",
        "price_help": "Filter results to free or paid apps",
        "status_help": "Show an official PICO item",
        "item_id_help": "Official PICO item id",
        "package_help": "Android package name",
        "send_code_help": "Send a PICO email or SMS verification code",
        "login_help": "Sign in to your PICO account",
        "email_help": "International account email",
        "mobile_help": "China account phone number, without country code",
        "country_code_help": "Phone country code (default: 86)",
        "login_window_help": "Open the official login window, then save the session automatically",
        "browser_help": "Browser executable to use instead of discovery",
        "logout_help": "Sign out",
        "download_help": "Download an app",
        "output_help": "Output APK path (must not already exist)",
        "prompt_sms": "PICO SMS code: ",
        "prompt_email": "PICO email code: ",
        "err_cn_requires_mobile": "--region cn requires --mobile",
        "err_global_requires_email": "--region global requires --email",
        "sent": "PICO verification email sent.",
        "sms_sent": "PICO SMS verification code sent.",
        "saved": "Signed in.",
        "downloaded": "Downloaded: {path}",
        "signed_out": "Signed out.",
        "error": "Error: {message}",
    },
    "zh-CN": {
        "description": "PICO 商店实验室 Python 命令行工具",
        "heading_positional": "位置参数",
        "heading_options": "选项",
        "help_action_help": "显示此帮助信息并退出",
        "locale_help": "CLI 帮助与提示的语言（默认 en）",
        "region_help": "商店与账号区域（默认 global 国际区）",
        "device_help": "用于判断应用可用性的 PICO 设备型号",
        "search_help": "搜索 PICO 官方商店应用",
        "word_help": "搜索关键词",
        "price_help": "只显示免费（free）或需要付费（paid）的应用",
        "status_help": "查看 PICO 官方商店中的某个应用",
        "item_id_help": "PICO 官方应用 ID",
        "package_help": "Android 包名",
        "send_code_help": "发送 PICO 邮箱或短信验证码",
        "login_help": "登录你的 PICO 账号",
        "email_help": "国际区账号邮箱",
        "mobile_help": "国区账号手机号（不含国家码）",
        "country_code_help": "手机国家码（默认 86）",
        "login_window_help": "打开官方登录窗口，完成后自动保存会话",
        "browser_help": "指定浏览器可执行文件路径，跳过自动发现",
        "logout_help": "退出登录",
        "download_help": "下载应用",
        "output_help": "输出 APK 路径（文件必须尚不存在）",
        "prompt_sms": "PICO 短信验证码：",
        "prompt_email": "PICO 邮箱验证码：",
        "err_cn_requires_mobile": "国区（--region cn）必须使用 --mobile 手机号登录",
        "err_global_requires_email": "国际区（--region global）必须使用 --email 邮箱登录",
        "sent": "PICO 验证码邮件已发送。",
        "sms_sent": "PICO 短信验证码已发送。",
        "saved": "已登录。",
        "downloaded": "已下载：{path}",
        "signed_out": "已退出登录。",
        "error": "错误：{message}",
    },
}


def _text(locale: str, key: str, **values: str) -> str:
    """Return one localized string, optionally formatting named placeholders."""
    return STRINGS[locale][key].format(**values)


def _preview_locale(argv: list[str] | None) -> str:
    """Read ``--locale`` before building help, so ``--help`` is localized too."""
    preview = argparse.ArgumentParser(add_help=False)
    preview.add_argument("--locale", choices=LOCALES, default="en")
    selected, _ = preview.parse_known_args(argv)
    return selected.locale


def _localize_parser_surface(parser: argparse.ArgumentParser, texts: dict[str, str]) -> None:
    """Translate argparse's fixed group titles and the automatic -h/--help line."""
    parser._positionals.title = texts["heading_positional"]
    parser._optionals.title = texts["heading_options"]
    for action in parser._actions:
        if action.__class__.__name__ == "_HelpAction":
            action.help = texts["help_action_help"]


def build_parser(locale: str = "en") -> argparse.ArgumentParser:
    """Create the stable CLI argument parser in the requested locale."""
    texts = STRINGS[locale]
    parser = argparse.ArgumentParser(prog="pico-store-py", description=texts["description"])
    parser.add_argument("--locale", choices=LOCALES, default="en", help=texts["locale_help"])
    parser.add_argument(
        "--region",
        choices=("global", "cn"),
        default="global",
        help=texts["region_help"],
    )
    parser.add_argument("--device", help=texts["device_help"])
    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help=texts["search_help"])
    search.add_argument("word", help=texts["word_help"])
    search.add_argument(
        "--price",
        choices=("free", "paid"),
        help=texts["price_help"],
    )

    status = sub.add_parser("status", help=texts["status_help"])
    status.add_argument("--item-id", required=True, help=texts["item_id_help"])
    status.add_argument("--package", required=True, help=texts["package_help"])

    send = sub.add_parser("send-code", help=texts["send_code_help"])
    login = sub.add_parser("login", help=texts["login_help"])
    for account in (send, login):
        identity = account.add_mutually_exclusive_group(required=True)
        identity.add_argument("--email", help=texts["email_help"])
        identity.add_argument("--mobile", help=texts["mobile_help"])
        account.add_argument("--country-code", default="86", help=texts["country_code_help"])

    login_window = sub.add_parser(
        "login-window",
        aliases=["login-gui"],
        help=texts["login_window_help"],
    )
    login_window.add_argument(
        "--browser",
        type=Path,
        metavar="PATH",
        help=texts["browser_help"],
    )

    logout = sub.add_parser("logout", help=texts["logout_help"])

    download = sub.add_parser("download", help=texts["download_help"])
    download.add_argument("--output", required=True, type=Path, help=texts["output_help"])
    download.add_argument("--item-id", required=True, help=texts["item_id_help"])
    download.add_argument("--package", required=True, help=texts["package_help"])

    for child in (search, status, send, login, login_window, logout, download):
        _localize_parser_surface(child, texts)
    _localize_parser_surface(parser, texts)
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run one command; return a process exit status without leaking credentials."""
    locale = _preview_locale(argv)
    texts = STRINGS[locale]
    parser = build_parser(locale)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001 - best-effort console encoding
            pass
    if args.command in ("send-code", "login"):
        if args.region == "cn" and not args.mobile:
            parser.error(texts["err_cn_requires_mobile"])
        if args.region == "global" and not args.email:
            parser.error(texts["err_global_requires_email"])
    try:
        config = StoreConfig.for_region(args.region)
        if args.device:
            config = replace(config, device_name=args.device)
        client = PicoStoreClient(config=config)
        if args.command == "search":
            result = client.search(args.word, price=args.price)
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
                    ensure_ascii=False,
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
                    ensure_ascii=False,
                )
            )
        elif args.command == "send-code":
            if args.region == "cn":
                client.send_mobile_code(args.mobile, country_code=args.country_code)
                print(texts["sms_sent"])
            else:
                client.send_code(args.email)
                print(texts["sent"])
        elif args.command == "login":
            if args.region == "cn":
                code = getpass.getpass(texts["prompt_sms"])
                auth = client.login_mobile(args.mobile, code, country_code=args.country_code)
            else:
                code = getpass.getpass(texts["prompt_email"])
                auth = client.login(args.email, code)
            credentials.save(auth)
            print(texts["saved"])
        elif args.command in ("login-window", "login-gui"):
            from pico_store_lab.browser_login import capture_login

            auth = capture_login(config, browser_path=args.browser)
            credentials.save(auth)
            print(texts["saved"])
        elif args.command == "logout":
            credentials.clear(args.region)
            print(texts["signed_out"])
        elif args.command == "download":
            target = StoreTarget(args.item_id, args.package)
            client.download(target, credentials.load(args.region), args.output)
            print(_text(locale, "downloaded", path=str(args.output)))
    except (OSError, ValueError, RuntimeError) as error:
        print(_text(locale, "error", message=str(error)), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
