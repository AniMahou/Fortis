package com.vox.mesh

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Hardware-backed key wrapping — what turns panic wipe from "we deleted the
 * rows" into something that survives forensic recovery.
 *
 * The problem it solves: VOX encrypts its local store with a master key, and
 * panic wipe destroys that key. But deleting a key from flash does not
 * reliably erase it. Wear levelling means the bytes can persist in unmapped
 * pages long after the filesystem says they are gone, and that is precisely
 * the kind of recovery a state actor seizing a phone can perform.
 *
 * So the master key is never written to flash in the clear. It is wrapped with
 * an AES key generated inside the Android Keystore, which on essentially every
 * modern handset lives in a TEE or secure element and is not extractable by
 * design. Panic wipe deletes that Keystore alias. After that the wrapped
 * master key is a permanently undecryptable blob, no matter how much of the
 * flash is recovered.
 *
 * Availability is not assumed — `isAvailable()` reports the truth, and
 * src/storage/masterKey.ts falls back to storing the key directly with a
 * weaker, clearly-documented guarantee. See src/storage/TESTING.md.
 */
class VoxKeystoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = NAME

    companion object {
        const val NAME = "VoxKeystore"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val ALIAS = "vox.master.wrap.v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_BITS = 128
        private const val GCM_IV_BYTES = 12
    }

    private fun keyStore(): KeyStore =
        KeyStore.getInstance(KEYSTORE).apply { load(null) }

    private fun existingKey(): SecretKey? =
        (keyStore().getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey

    private fun createKey(): SecretKey {
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                // Deliberately NOT setUserAuthenticationRequired(true).
                // Requiring a fingerprint or PIN to decrypt would mean VOX
                // cannot start until the user authenticates — and the moments
                // this app exists for are exactly the moments when someone is
                // running, injured, or has a phone they cannot unlock quickly.
                .build(),
        )
        return generator.generateKey()
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(
            try {
                keyStore()
                true
            } catch (e: Exception) {
                false
            },
        )
    }

    /**
     * Wraps a raw master key. Returns base64(iv || ciphertext) — the IV is
     * prefixed rather than stored separately so the caller only has one opaque
     * blob to persist and, more importantly, only one thing to lose.
     */
    @ReactMethod
    fun wrapKey(keyBase64: String, promise: Promise) {
        try {
            val raw = Base64.decode(keyBase64, Base64.NO_WRAP)
            val key = existingKey() ?: createKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val ciphertext = cipher.doFinal(raw)
            val blob = ByteArray(iv.size + ciphertext.size)
            iv.copyInto(blob, 0)
            ciphertext.copyInto(blob, iv.size)
            promise.resolve(Base64.encodeToString(blob, Base64.NO_WRAP))
        } catch (e: Exception) {
            promise.reject("WRAP_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun unwrapKey(blobBase64: String, promise: Promise) {
        try {
            val blob = Base64.decode(blobBase64, Base64.NO_WRAP)
            if (blob.size <= GCM_IV_BYTES) {
                promise.reject("BAD_BLOB", "Wrapped key is too short to contain an IV")
                return
            }
            val key = existingKey()
            if (key == null) {
                // The normal path after a panic wipe. Distinguished from a
                // generic failure so the app can tell "this device was wiped"
                // apart from "something went wrong", and start fresh instead
                // of showing an error to someone who is mid-emergency.
                promise.reject("KEY_DESTROYED", "The wrapping key no longer exists")
                return
            }
            val iv = blob.copyOfRange(0, GCM_IV_BYTES)
            val ciphertext = blob.copyOfRange(GCM_IV_BYTES, blob.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
            promise.resolve(Base64.encodeToString(cipher.doFinal(ciphertext), Base64.NO_WRAP))
        } catch (e: Exception) {
            promise.reject("UNWRAP_FAILED", e.message, e)
        }
    }

    /**
     * Panic wipe's final act. Once this returns, every blob ever produced by
     * wrapKey is undecryptable — on this device or any other, permanently.
     */
    @ReactMethod
    fun destroyWrappingKey(promise: Promise) {
        try {
            val store = keyStore()
            if (store.containsAlias(ALIAS)) {
                store.deleteEntry(ALIAS)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DESTROY_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun hasWrappingKey(promise: Promise) {
        promise.resolve(
            try {
                keyStore().containsAlias(ALIAS)
            } catch (e: Exception) {
                false
            },
        )
    }
}
