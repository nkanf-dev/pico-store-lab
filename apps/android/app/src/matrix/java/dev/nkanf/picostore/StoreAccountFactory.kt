package dev.nkanf.picostore

import android.content.Context
import dev.nkanf.picostore.sdk.PicoAuth
import org.json.JSONObject
import org.picomatrix.bridge.account.MatrixAccount

internal object StoreAccountFactory {
    fun create(context: Context): StoreAccount = object : StoreAccount {
        private val account = MatrixAccount(context.applicationContext)
        private val legacy = AccountStore(context.applicationContext)
        private val migration = context.getSharedPreferences("matrix_account_migration", Context.MODE_PRIVATE)
        private fun markMigrated() { check(migration.edit().putBoolean("completed", true).commit()) }
        private fun project(data: JSONObject): SignedInAccount {
            val cookies = data.getJSONObject("cookies")
            return SignedInAccount(PicoAuth(data.getString("uid"), data.optString("x_tt_token"),
                cookies.keys().asSequence().associateWith { cookies.getString(it) }), data.optString("email"))
        }
        override fun restore(): SignedInAccount? {
            var session = account.passportSession()
            if (session != null) {
                markMigrated()
                // Failure to remove the old encrypted record cannot reactivate it.
                runCatching { legacy.clear() }
            } else if (!migration.getBoolean("completed", false)) {
                val old = legacy.load()?.let(::JSONObject)
                if (old != null) {
                    account.importPassportSession(JSONObject().put("uid", old.getString("uid"))
                        .put("x_tt_token", old.optString("token")).put("cookies", old.getJSONObject("cookies"))
                        .put("email", old.optString("email")))
                    session = account.passportSession()
                    check(session != null)
                }
                markMigrated()
                runCatching { legacy.clear() }
            }
            return session?.let(::project)
        }
        override fun sendCode(email: String) = account.sendCode(email)
        override fun login(email: String, code: String): SignedInAccount {
            account.login(email, code)
            markMigrated()
            runCatching { legacy.clear() }
            return project(checkNotNull(account.passportSession()))
        }
        override fun logout() {
            // Mark before clearing so a crash cannot resurrect the old Store session.
            markMigrated()
            account.logout()
            runCatching { legacy.clear() }
        }
    }
}
