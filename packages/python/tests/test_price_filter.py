"""Price classification and free/paid search filtering."""

from __future__ import annotations

import unittest
from email.message import Message

from pico_store_lab import PicoStoreClient, SearchItem, StoreResponse
from pico_store_lab.protocol import (
    filter_search_items,
    is_free_price,
    is_paid_price,
    validate_price_filter,
)


def make_item(item_id: str, price: str, name: str = "App") -> SearchItem:
    """Build a normalized search item with the given official price."""
    return SearchItem(item_id, f"com.example.{item_id}", name, 1, price)


FREE_ITEMS = [
    make_item("1", "0"),
    make_item("2", "0.0"),
    make_item("3", "0.00"),
    make_item("4", " 0 "),
]
PAID_ITEMS = [
    make_item("5", "1"),
    make_item("6", "68.00"),
    make_item("7", "0.5"),
]
UNKNOWN_ITEMS = [
    make_item("8", ""),
    make_item("9", "abc"),
]


class PriceFilterTests(unittest.TestCase):
    """Classify official price strings and filter one normalized search page."""

    def test_free_price_detection(self) -> None:
        """Only zero amounts count as free."""
        for item in FREE_ITEMS:
            with self.subTest(price=item.price):
                self.assertTrue(is_free_price(item.price))
        for item in [*PAID_ITEMS, *UNKNOWN_ITEMS]:
            with self.subTest(price=item.price):
                self.assertFalse(is_free_price(item.price))

    def test_paid_price_detection(self) -> None:
        """Only positive numeric amounts count as paid."""
        for item in PAID_ITEMS:
            with self.subTest(price=item.price):
                self.assertTrue(is_paid_price(item.price))
        for item in [*FREE_ITEMS, *UNKNOWN_ITEMS]:
            with self.subTest(price=item.price):
                self.assertFalse(is_paid_price(item.price))

    def test_validate_price_filter(self) -> None:
        """Reject anything other than free/paid before filtering."""
        self.assertEqual(validate_price_filter("free"), "free")
        self.assertEqual(validate_price_filter("paid"), "paid")
        for value in ("", "all", "FREE", "premium"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_price_filter(value)

    def test_filter_keeps_only_selected_price(self) -> None:
        """Unknown prices are excluded from both free and paid results."""
        items = FREE_ITEMS + PAID_ITEMS + UNKNOWN_ITEMS
        self.assertEqual(filter_search_items(items, "free"), FREE_ITEMS)
        self.assertEqual(filter_search_items(items, "paid"), PAID_ITEMS)

    def test_client_search_applies_price_filter(self) -> None:
        """The client filters normalized items while keeping the page cursor."""
        raw_items = [
            {"item_id": 1, "package_name": "com.example.one", "name": "Free App", "price": "0"},
            {"item_id": 2, "package_name": "com.example.two", "name": "Paid App", "price": "30"},
        ]

        def transport(spec: object, retries: int) -> StoreResponse:
            return StoreResponse(
                {
                    "code": 0,
                    "data": {
                        "search_list": [
                            {
                                "items": raw_items,
                                "has_more": True,
                                "next_id": 2,
                            }
                        ]
                    },
                },
                Message(),
            )

        client = PicoStoreClient(transport)
        free = client.search("app", price="free")
        self.assertEqual([item.name for item in free.items], ["Free App"])
        self.assertEqual(free.next_id, 2)
        paid = client.search("app", price="paid")
        self.assertEqual([item.name for item in paid.items], ["Paid App"])
        self.assertEqual(len(client.search("app").items), 2)


if __name__ == "__main__":
    unittest.main()
