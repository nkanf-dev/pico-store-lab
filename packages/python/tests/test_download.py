"""APK publication verifies isolated bytes without contacting a live CDN."""

import hashlib
import io
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from pico_store_lab import DownloadInfo, download_verified_apk
from pico_store_lab import client as client_module


def info_for(body: bytes, size: int | None = None) -> DownloadInfo:
    """Describe synthetic download bytes."""
    return DownloadInfo(
        "1",
        "dev.example.synthetic",
        1,
        "1",
        len(body) if size is None else size,
        hashlib.md5(body).hexdigest(),
        "https://cdn.example.invalid/synthetic.apk",  # noqa: S324
    )


class InterruptedResponse(io.BytesIO):
    """Fail after writing a prefix to exercise terminal cleanup."""

    def read(self, size: int = -1) -> bytes:
        """Return a prefix once, then report a synthetic network failure."""
        if self.tell():
            raise OSError("synthetic interruption")
        return super().read(min(size, 2))


class DownloadTests(unittest.TestCase):
    """A failed or competing download cannot publish unverified bytes."""

    def test_success_preserves_unowned_legacy_partial(self) -> None:
        """An old predictable partial path is not reused or overwritten."""
        body = b"synthetic APK"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "sample.apk"
            legacy = output.with_name("sample.part.apk")
            legacy.write_bytes(b"unowned file")
            with patch.object(client_module, "urlopen", return_value=io.BytesIO(body)):
                self.assertEqual(download_verified_apk(info_for(body), output), output)
            self.assertEqual(output.read_bytes(), body)
            self.assertEqual(legacy.read_bytes(), b"unowned file")
            self.assertEqual(set(Path(directory).iterdir()), {output, legacy})

    def test_metadata_size_difference_does_not_block_verified_content(self) -> None:
        """Metadata size differences keep the existing MD5-based result policy."""
        body = b"synthetic APK"
        for size in (len(body) - 1, len(body) + 1):
            with self.subTest(size=size), tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "sample.apk"
                with patch.object(client_module, "urlopen", return_value=io.BytesIO(body)):
                    self.assertEqual(download_verified_apk(info_for(body, size), output), output)
                self.assertEqual(output.read_bytes(), body)
                self.assertEqual(list(Path(directory).iterdir()), [output])

    def test_digest_mismatch_preserves_existing_failure_behavior(self) -> None:
        """The pre-existing digest validation still rejects incorrect bytes."""
        body = b"synthetic APK"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "sample.apk"
            with patch.object(client_module, "urlopen", return_value=io.BytesIO(b"wrong content")):
                with self.assertRaisesRegex(ValueError, "APK digest mismatch"):
                    download_verified_apk(info_for(body), output)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_terminal_network_failure_removes_partial(self) -> None:
        """Exhausted retries leave neither a partial nor a completed output."""
        body = b"synthetic APK"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "sample.apk"
            with (
                patch.object(
                    client_module,
                    "urlopen",
                    side_effect=lambda *_a, **_k: InterruptedResponse(body),
                ) as request,
                patch.object(client_module.time, "sleep"),
            ):
                with self.assertRaisesRegex(RuntimeError, "APK download failed"):
                    download_verified_apk(info_for(body), output, retries=2)
            self.assertEqual(request.call_count, 2)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_existing_output_is_preserved(self) -> None:
        """Reject an existing result before making any network request."""
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "sample.apk"
            output.write_bytes(b"last known good")
            with patch.object(client_module, "urlopen") as request:
                with self.assertRaises(ValueError):
                    download_verified_apk(info_for(b"replacement"), output)
            request.assert_not_called()
            self.assertEqual(output.read_bytes(), b"last known good")

    def test_concurrent_output_publishes_the_winners_verified_bytes(self) -> None:
        """Another writer cannot alter a winner between hashing and publication."""
        first_finished = threading.Event()
        first_published = threading.Event()
        both_verified = threading.Barrier(2, timeout=5)
        real_link = client_module.os.link
        results: dict[str, Path | Exception] = {}
        bodies = {"first": b"first APK bytes", "second": b"other APK bytes"}

        class Response(io.BytesIO):
            def read(self, size: int = -1) -> bytes:
                if threading.current_thread().name == "second":
                    self_test.assertTrue(first_finished.wait(5))
                return super().read(size)

            def __exit__(self, *_args: object) -> None:
                if threading.current_thread().name == "first":
                    first_finished.set()
                self.close()

        def publish(source: Path, destination: Path) -> None:
            both_verified.wait()
            if threading.current_thread().name == "second":
                self_test.assertTrue(first_published.wait(5))
            real_link(source, destination)
            first_published.set()

        def run(name: str, output: Path) -> None:
            try:
                results[name] = download_verified_apk(info_for(bodies[name]), output, retries=1)
            except Exception as error:  # test records the competing publication error
                results[name] = error

        self_test = self
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "sample.apk"
            with (
                patch.object(
                    client_module,
                    "urlopen",
                    side_effect=lambda *_a, **_k: Response(bodies[threading.current_thread().name]),
                ),
                patch.object(client_module.os, "link", side_effect=publish),
            ):
                threads = [
                    threading.Thread(target=run, args=(name, output), name=name) for name in bodies
                ]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join(10)
                    self.assertFalse(thread.is_alive())
            self.assertEqual(results["first"], output)
            self.assertEqual(output.read_bytes(), bodies["first"])
            self.assertIsInstance(results["second"], FileExistsError)
            self.assertEqual(list(Path(directory).iterdir()), [output])
