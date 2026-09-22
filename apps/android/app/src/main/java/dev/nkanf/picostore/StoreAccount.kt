package dev.nkanf.picostore

import dev.nkanf.picostore.sdk.PicoAuth

internal data class SignedInAccount(val auth: PicoAuth, val email: String)

/** The UI and catalog don't own the authentication protocol or credential format. */
internal interface StoreAccount {
    fun restore(): SignedInAccount?
    fun sendCode(email: String)
    fun login(email: String, code: String): SignedInAccount
    fun logout()
}
