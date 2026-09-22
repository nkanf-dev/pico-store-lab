package dev.nkanf.picostore

import android.content.SharedPreferences
import dev.nkanf.picostore.sdk.StoreTarget
import org.json.JSONObject

/** Catalog identity only; installed versions are always read from PackageManager. */
internal class TrackedApplications(private val prefs: SharedPreferences) {
    fun remember(target: StoreTarget) {
        check(prefs.edit().putString(target.itemId, JSONObject()
            .put("package", target.packageName).put("name", target.name).toString()).commit())
    }

    fun all(): List<StoreTarget> = prefs.all.mapNotNull { (id, value) ->
        runCatching {
            val data = JSONObject(value as String)
            StoreTarget(id, data.getString("package"), data.getString("name"))
        }.getOrNull()
    }
}
