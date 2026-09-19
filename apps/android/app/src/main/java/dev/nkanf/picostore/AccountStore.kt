package dev.nkanf.picostore

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class AccountStore(context: Context) {
    private val legacy = context.getSharedPreferences("pico_account", Context.MODE_PRIVATE)
    private val file = AtomicFile(File(context.noBackupFilesDir, "pico-session"))
    private val alias = "dev.nkanf.picostore.session.v1"

    private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun key(): SecretKey {
        val existing = keyStore().getKey(alias, null)
        if (existing is SecretKey) return existing
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build())
            generateKey()
        }
    }

    private fun hasSession() = file.baseFile.exists() || File(file.baseFile.path + ".bak").exists()

    @Synchronized
    fun save(session: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = byteArrayOf(1) + cipher.iv + cipher.doFinal(session.toByteArray(Charsets.UTF_8))
        val stream = file.startWrite()
        try {
            stream.write(sealed)
            file.finishWrite(stream)
        } catch (error: Exception) {
            file.failWrite(stream)
            throw error
        }
    }

    @Synchronized
    fun load(): String? {
        // A failed migration must never fall back to using the old plaintext session.
        val previous = legacy.getString("session", null)
        if (previous != null) {
            try {
                if (!hasSession()) save(previous)
            } finally {
                check(legacy.edit().remove("session").commit())
            }
        }
        if (!hasSession()) return null
        val sealed = file.readFully()
        require(sealed.size >= 29 && sealed[0] == 1.toByte())
        val secret = keyStore().getKey(alias, null) as? SecretKey
            ?: error("Session key unavailable")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secret, GCMParameterSpec(128, sealed.copyOfRange(1, 13)))
        return cipher.doFinal(sealed.copyOfRange(13, sealed.size)).toString(Charsets.UTF_8)
    }

    @Synchronized
    fun clear() {
        check(legacy.edit().remove("session").commit())
        file.delete()
        check(!hasSession())
        keyStore().deleteEntry(alias)
    }
}
