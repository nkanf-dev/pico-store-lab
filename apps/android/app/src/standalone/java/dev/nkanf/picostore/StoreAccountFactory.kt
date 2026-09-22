package dev.nkanf.picostore

import android.content.Context
import dev.nkanf.picostore.sdk.PicoAuth
import dev.nkanf.picostore.sdk.PicoStoreClient
import org.json.JSONObject

internal object StoreAccountFactory {
    fun create(context: Context): StoreAccount = object : StoreAccount {
        private val storage = AccountStore(context)
        private val client = PicoStoreClient()
        override fun restore(): SignedInAccount? {
            val data = storage.load()?.let(::JSONObject) ?: return null
            val cookies = data.getJSONObject("cookies")
            val auth = PicoAuth(data.getString("uid"), data.getString("token"),
                cookies.keys().asSequence().associateWith { cookies.getString(it) })
            require(auth.token.isNotEmpty() || auth.cookies.isNotEmpty())
            return SignedInAccount(auth, data.optString("email"))
        }
        override fun sendCode(email: String) = client.sendCode(email)
        override fun login(email: String, code: String): SignedInAccount {
            val auth = client.login(email, code)
            storage.save(JSONObject().put("uid", auth.uid).put("token", auth.token)
                .put("cookies", JSONObject(auth.cookies)).put("email", email).toString())
            return SignedInAccount(auth, email)
        }
        override fun logout() = storage.clear()
    }
}
