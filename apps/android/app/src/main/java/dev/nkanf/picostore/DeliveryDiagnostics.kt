package dev.nkanf.picostore

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Bounded, local support report. Only named non-secret fields are admitted. */
internal class DeliveryDiagnostics(private val version: String, private val model: String, private val sdk: Int) {
    private var id = UUID.randomUUID().toString()
    private var stage = "idle"
    private var application = JSONObject()
    private var events = JSONArray()
    private var failure: JSONObject? = null
    @Synchronized fun begin(packageName: String?, itemId: String?, appVersion: Long?) {
        id = UUID.randomUUID().toString(); stage = "starting"; events = JSONArray(); failure = null
        application = JSONObject().put("package", packageName ?: "").put("itemId", itemId ?: "").put("versionCode", appVersion ?: 0)
    }
    @Synchronized fun event(code: String, fields: Map<String, String> = emptyMap()) {
        stage = code
        val safe = JSONObject()
        for ((key, value) in fields) if (key in allowedFields) safe.put(key, value.take(128))
        if (events.length() == 32) events.remove(0)
        events.put(JSONObject().put("stage", code).put("time", System.currentTimeMillis()).put("details", safe))
    }
    @Synchronized fun fail(error: Throwable) {
        val causes = JSONArray()
        var current: Throwable? = error
        repeat(5) {
            val value = current ?: return@repeat
            val cause = JSONObject().put("type", value.javaClass.simpleName)
                .put("code", (value as? ApkDownloadException)?.code ?: "")
                .put("frames", JSONArray(value.stackTrace.take(8).map { "${it.className}.${it.methodName}:${it.lineNumber}" }))
            // Only parse the SDK's exact numeric HTTP error format, never raw text.
            httpError.matchEntire(value.message.orEmpty())?.groupValues?.get(1)?.let { cause.put("httpStatus", it.toInt()) }
            upstreamError.matchEntire(value.message.orEmpty())?.groupValues?.get(2)?.toIntOrNull()?.let { cause.put("upstreamCode", it) }
            causes.put(cause)
            current = value.cause
        }
        failure = JSONObject().put("causes", causes)
    }
    @Synchronized fun snapshot(): String = JSONObject().put("schema", 1).put("reportId", id)
        .put("labVersion", version).put("device", JSONObject().put("model", model).put("androidApi", sdk))
        .put("stage", stage).put("application", application).put("events", events).put("failure", failure).toString(2)
    private companion object {
        val httpError = Regex("(?:PICO request failed: )?(?:PICO|APK) HTTP ([1-5][0-9]{2})")
        val upstreamError = Regex("PICO (search|item lookup|download info|free acquisition) failed: (-?[0-9]{1,10})")
        val allowedFields = setOf("attempt", "reason", "httpStatus", "status", "legacyStatus", "expectedSize", "actualSize",
            "expectedMd5", "actualMd5", "expectedPackage", "actualPackage", "expectedVersion", "actualVersion", "variant")
    }
}
