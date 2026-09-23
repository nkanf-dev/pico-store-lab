package dev.nkanf.picostore

import org.json.JSONArray

internal class NoAdaptationPolicy private constructor(private val rules: Map<String, Reason>) {
    internal data class Reason(val zh: String, val en: String) {
        fun forLanguage(language: String): String = if (language == "zh") zh else en
    }

    fun reason(packageName: String): Reason? = rules[packageName]
    fun installationChoice(packageName: String, requested: InstallVariant?): InstallVariant? =
        if (reason(packageName) != null) InstallVariant.ORIGINAL else requested

    companion object {
        fun parse(json: String): NoAdaptationPolicy {
            val entries = JSONArray(json)
            val rules = mutableMapOf<String, Reason>()
            for (index in 0 until entries.length()) {
                val entry = entries.getJSONObject(index)
                val packageName = entry.getString("packageName")
                require(Regex("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+").matches(packageName))
                val copy = entry.getJSONObject("reason")
                val reason = Reason(copy.getString("zh"), copy.getString("en"))
                require(reason.zh.isNotBlank() && reason.en.isNotBlank())
                require(rules.putIfAbsent(packageName, reason) == null) { "Duplicate no-adaptation rule" }
            }
            return NoAdaptationPolicy(rules)
        }
    }
}
