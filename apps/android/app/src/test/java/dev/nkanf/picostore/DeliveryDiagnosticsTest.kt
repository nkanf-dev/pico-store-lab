package dev.nkanf.picostore

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject

class DeliveryDiagnosticsTest {
    @Test fun reportIncludesRecoveryAndSystemFailureWithoutAccountOrLinks() {
        val report = DeliveryDiagnostics("0.2.1", "PICO", 29)
        report.begin("org.picolab.fixture", "123", 42)
        report.event("cdn_response", mapOf("httpStatus" to "503", "url" to "https://private.invalid?token=secret", "cookie" to "private"))
        report.fail(IllegalStateException("email@example.invalid token=private", ApkDownloadException("apk_network")))
        val text = report.snapshot()
        assertFalse(text.contains("private"))
        assertFalse(text.contains("email@"))
        assertFalse(text.contains("https:"))
        assertTrue(text.contains("apk_network"))
        assertTrue(text.contains("503"))
        assertEquals("org.picolab.fixture", JSONObject(text).getJSONObject("application").getString("package"))
    }
    @Test fun reportsAreBoundedAndNewOperationsClearOldFailure() {
        val report = DeliveryDiagnostics("0.2.1", "PICO", 29)
        repeat(40) { report.event("attempt", mapOf("attempt" to "$it")) }
        assertEquals(32, JSONObject(report.snapshot()).getJSONArray("events").length())
        report.fail(ApkDownloadException("apk_network"))
        report.begin("org.picolab.next", "456", 43)
        assertFalse(report.snapshot().contains("apk_network"))
        assertEquals(0, JSONObject(report.snapshot()).getJSONArray("events").length())
    }
    @Test fun numericHttpFailuresRemainActionableWithoutCopyingArbitraryExceptionText() {
        val report = DeliveryDiagnostics("0.2.1", "PICO", 29)
        report.fail(IllegalStateException("PICO request failed: PICO HTTP 503", java.io.IOException("PICO HTTP 503")))
        val causes = JSONObject(report.snapshot()).getJSONObject("failure").getJSONArray("causes")
        assertEquals(503, causes.getJSONObject(0).getInt("httpStatus"))
        assertEquals(503, causes.getJSONObject(1).getInt("httpStatus"))
        report.fail(IllegalStateException("PICO HTTP 503 token=private"))
        assertFalse(report.snapshot().contains("private"))
        assertFalse(report.snapshot().contains("httpStatus"))
    }
}
