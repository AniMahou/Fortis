package com.vox.mesh

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * VOX's BLE broadcast mesh, talking to the Android platform APIs directly.
 *
 * Why this exists rather than a library: every React Native BLE *advertising*
 * package was last published in 2022 (verified against npm — see
 * docs/DECISIONS.md D1), which predates the New Architecture this app is built
 * on. The platform APIs underneath those wrappers have been stable since API
 * 21 and are not the risky part. Depending on the platform instead of an
 * abandoned wrapper is the lower-risk option, not the more adventurous one.
 *
 * The design constraint that shapes everything here is payload size
 * (CONTEXT.md risk #2). A legacy BLE advertisement is 31 bytes total, and the
 * mandatory flags and manufacturer-data headers eat 7 of them. So:
 *
 *   - On hardware with LE extended advertising (Android 8+ and a capable
 *     radio) a whole VOX packet fits in a single frame, and the service UUID
 *     is advertised alongside it because there is room to spare.
 *   - Otherwise we fall back to legacy frames, advertise *no* service UUID,
 *     and let the JS chunking layer split packets across ~24-byte frames.
 *
 * Either way `getCapabilities()` reports the real usable byte count and JS
 * sizes its chunks from that. Nothing here guesses.
 *
 * Advertising data is updated in place via AdvertisingSet.setAdvertisingData
 * rather than by stopping and restarting the advertiser. That matters: Android
 * rate-limits advertiser restarts, and a mesh that rotates through chunk
 * frames several times a second would hit that limit immediately.
 */
class VoxMeshModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = NAME

    companion object {
        const val NAME = "VoxMesh"

        /**
         * First byte of every VOX manufacturer-data payload. Doubles as a
         * protocol version and as the scan filter's discriminator, so a phone
         * ignores unrelated manufacturer traffic in hardware rather than
         * waking JS for every advertisement in a crowded room.
         */
        private const val VOX_MAGIC: Byte = 0xB1.toByte()

        /** Total bytes in a legacy BLE advertisement. */
        private const val LEGACY_ADV_BUDGET = 31

        /** Flags AD structure: length + type + value. */
        private const val FLAGS_OVERHEAD = 3

        /** Manufacturer-data AD: length + type + 2-byte company id. */
        private const val MANUFACTURER_OVERHEAD = 4

        /** 128-bit service UUID AD: length + type + 16-byte UUID. */
        private const val SERVICE_UUID_OVERHEAD = 18

        private const val EVENT_FRAME = "VoxMeshFrame"
        private const val EVENT_STATE = "VoxMeshState"
    }

    private val bluetoothManager: BluetoothManager? =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager

    private val adapter: BluetoothAdapter?
        get() = bluetoothManager?.adapter

    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null

    private var advertisingSet: AdvertisingSet? = null
    private var advertisingSetCallback: AdvertisingSetCallback? = null
    private var legacyAdvertiseCallback: AdvertiseCallback? = null
    private var scanCallback: ScanCallback? = null

    private var manufacturerId: Int = 0xFFFF
    private var serviceUuid: ParcelUuid? = null
    private var useExtended: Boolean = false

    // ---------------------------------------------------------------- events

    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
        // Required by NativeEventEmitter. Subscription bookkeeping lives on
        // the JS side; nothing to do here.
    }

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
        // See addListener.
    }

    private fun emit(event: String, payload: WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, payload)
    }

    private fun emitState(state: String, detail: String?) {
        val map = Arguments.createMap()
        map.putString("state", state)
        map.putString("detail", detail)
        emit(EVENT_STATE, map)
    }

    // ---------------------------------------------------------- capabilities

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(reactContext, permission) ==
            PackageManager.PERMISSION_GRANTED

    private fun missingPermissions(): List<String> {
        val required = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            required += Manifest.permission.BLUETOOTH_ADVERTISE
            required += Manifest.permission.BLUETOOTH_SCAN
        }
        // Android will not return scan results without location permission
        // unless the scan permission is declared neverForLocation, which VOX
        // does not do — it needs a real fix for SOS anyway.
        required += Manifest.permission.ACCESS_FINE_LOCATION
        return required.filterNot { hasPermission(it) }
    }

    /**
     * Everything JS needs to decide how to behave, in one call. Deliberately
     * reports real numbers read off the adapter rather than assumed ones — the
     * usable payload size differs enough between devices that guessing it is
     * how you end up with a mesh that works on one phone and silently drops
     * every packet on another.
     */
    @ReactMethod
    fun getCapabilities(promise: Promise) {
        val result = Arguments.createMap()
        val adapter = this.adapter

        if (adapter == null) {
            result.putBoolean("bluetoothSupported", false)
            result.putBoolean("bluetoothEnabled", false)
            result.putBoolean("advertisingSupported", false)
            result.putBoolean("extendedAdvertisingSupported", false)
            result.putInt("maxPayloadBytes", 0)
            result.putArray("missingPermissions", Arguments.createArray())
            promise.resolve(result)
            return
        }

        val extendedSupported =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                adapter.isLeExtendedAdvertisingSupported

        val advertisingSupported = adapter.isMultipleAdvertisementSupported

        val maxPayload =
            if (extendedSupported) {
                // Extended advertising reports its own ceiling, commonly 251
                // and up to 1650 bytes. There is room for the service UUID
                // here, so it is included and charged against the budget.
                val hardwareMax = adapter.leMaximumAdvertisingDataLength
                (hardwareMax - SERVICE_UUID_OVERHEAD - MANUFACTURER_OVERHEAD)
                    .coerceAtLeast(0)
            } else {
                // Legacy: 31 bytes total. Flags are mandatory, so the honest
                // budget is 31 - 3 - 4 = 24 bytes and no service UUID at all.
                // Filtering falls back to company id + VOX_MAGIC.
                LEGACY_ADV_BUDGET - FLAGS_OVERHEAD - MANUFACTURER_OVERHEAD
            }

        result.putBoolean("bluetoothSupported", true)
        result.putBoolean("bluetoothEnabled", adapter.isEnabled)
        result.putBoolean("advertisingSupported", advertisingSupported)
        result.putBoolean("extendedAdvertisingSupported", extendedSupported)
        // One byte of the payload is the magic/version prefix, which is
        // protocol overhead rather than usable space.
        result.putInt("maxPayloadBytes", (maxPayload - 1).coerceAtLeast(0))

        val missing = Arguments.createArray()
        missingPermissions().forEach { missing.pushString(it) }
        result.putArray("missingPermissions", missing)

        promise.resolve(result)
    }

    // ----------------------------------------------------------- advertising

    @ReactMethod
    fun startAdvertising(manufacturerId: Int, serviceUuidString: String, promise: Promise) {
        val adapter = this.adapter
        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BT_OFF", "Bluetooth is off or unavailable")
            return
        }
        val missing = missingPermissions()
        if (missing.isNotEmpty()) {
            promise.reject("NO_PERMISSION", "Missing permissions: ${missing.joinToString()}")
            return
        }

        this.manufacturerId = manufacturerId
        this.serviceUuid =
            try {
                ParcelUuid.fromString(serviceUuidString)
            } catch (e: IllegalArgumentException) {
                promise.reject("BAD_UUID", "Invalid service UUID: $serviceUuidString")
                return
            }

        advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            promise.reject("NO_ADVERTISER", "This device cannot advertise over BLE")
            return
        }

        useExtended =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                adapter.isLeExtendedAdvertisingSupported

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startAdvertisingSetApi26(promise)
            } else {
                // API 24-25: no AdvertisingSet, so every payload change is a
                // stop/start cycle. Resolve now; frames start flowing when JS
                // calls setPayload.
                promise.resolve(true)
            }
        } catch (e: SecurityException) {
            promise.reject("NO_PERMISSION", e.message, e)
        }
    }

    private fun startAdvertisingSetApi26(promise: Promise) {
        val parameters =
            AdvertisingSetParameters.Builder()
                .setLegacyMode(!useExtended)
                // Nobody connects to a VOX node. Broadcast only — which is
                // also what frees up the connectable-advertising overhead.
                .setConnectable(false)
                .setScannable(false)
                .setInterval(AdvertisingSetParameters.INTERVAL_LOW)
                .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_HIGH)
                .apply {
                    if (useExtended) {
                        setPrimaryPhy(android.bluetooth.BluetoothDevice.PHY_LE_1M)
                        setSecondaryPhy(android.bluetooth.BluetoothDevice.PHY_LE_2M)
                    }
                }
                .build()

        val callback =
            object : AdvertisingSetCallback() {
                override fun onAdvertisingSetStarted(
                    set: AdvertisingSet?,
                    txPower: Int,
                    status: Int,
                ) {
                    if (status == ADVERTISE_SUCCESS) {
                        advertisingSet = set
                        emitState("advertising", "txPower=$txPower extended=$useExtended")
                    } else {
                        emitState("advertise_error", advertiseStatusName(status))
                    }
                }

                override fun onAdvertisingSetStopped(set: AdvertisingSet?) {
                    advertisingSet = null
                    emitState("advertise_stopped", null)
                }

                override fun onAdvertisingDataSet(set: AdvertisingSet?, status: Int) {
                    if (status != ADVERTISE_SUCCESS) {
                        emitState("advertise_data_error", advertiseStatusName(status))
                    }
                }
            }
        advertisingSetCallback = callback

        advertiser?.startAdvertisingSet(parameters, buildAdvertiseData(null), null, null, null, callback)
        promise.resolve(true)
    }

    /**
     * Pushes one frame of payload onto the air. JS calls this repeatedly as it
     * rotates through the chunks of a packet.
     */
    @ReactMethod
    fun setPayload(payloadBase64: String, promise: Promise) {
        val raw =
            try {
                Base64.decode(payloadBase64, Base64.NO_WRAP)
            } catch (e: IllegalArgumentException) {
                promise.reject("BAD_PAYLOAD", "Payload is not valid base64", e)
                return
            }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val set = advertisingSet
                if (set == null) {
                    promise.reject("NOT_ADVERTISING", "startAdvertising has not completed yet")
                    return
                }
                set.setAdvertisingData(buildAdvertiseData(raw))
            } else {
                restartLegacyAdvertising(raw)
            }
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("NO_PERMISSION", e.message, e)
        } catch (e: IllegalArgumentException) {
            // Thrown when the data exceeds the advertisement budget. This is
            // the failure the chunking layer exists to prevent, so surface it
            // loudly rather than letting frames vanish silently.
            promise.reject("PAYLOAD_TOO_LARGE", e.message, e)
        }
    }

    private fun buildAdvertiseData(payload: ByteArray?): AdvertiseData {
        val builder =
            AdvertiseData.Builder()
                // The device name is a persistent, user-set identifier and
                // would completely undo this app's anonymity claim if it went
                // out with every broadcast.
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)

        // Only advertise the service UUID when extended advertising gives us
        // the 18 bytes to spend on it. In legacy mode those bytes are needed
        // for actual message content.
        if (useExtended) {
            serviceUuid?.let { builder.addServiceUuid(it) }
        }

        val framed =
            if (payload == null) {
                byteArrayOf(VOX_MAGIC)
            } else {
                ByteArray(payload.size + 1).also {
                    it[0] = VOX_MAGIC
                    payload.copyInto(it, 1)
                }
            }
        builder.addManufacturerData(manufacturerId, framed)
        return builder.build()
    }

    @Suppress("DEPRECATION")
    private fun restartLegacyAdvertising(payload: ByteArray) {
        val advertiser = this.advertiser ?: return
        legacyAdvertiseCallback?.let { advertiser.stopAdvertising(it) }

        val settings =
            AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(false)
                .build()

        val callback =
            object : AdvertiseCallback() {
                override fun onStartFailure(errorCode: Int) {
                    emitState("advertise_error", legacyErrorName(errorCode))
                }
            }
        legacyAdvertiseCallback = callback
        advertiser.startAdvertising(settings, buildAdvertiseData(payload), callback)
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                advertisingSetCallback?.let { advertiser?.stopAdvertisingSet(it) }
            } else {
                @Suppress("DEPRECATION")
                legacyAdvertiseCallback?.let { advertiser?.stopAdvertising(it) }
            }
        } catch (e: SecurityException) {
            // Permission revoked mid-flight. Nothing left to stop.
        }
        advertisingSet = null
        advertisingSetCallback = null
        legacyAdvertiseCallback = null
        promise.resolve(true)
    }

    // -------------------------------------------------------------- scanning

    @ReactMethod
    fun startScanning(manufacturerId: Int, promise: Promise) {
        val adapter = this.adapter
        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BT_OFF", "Bluetooth is off or unavailable")
            return
        }
        val missing = missingPermissions()
        if (missing.isNotEmpty()) {
            promise.reject("NO_PERMISSION", "Missing permissions: ${missing.joinToString()}")
            return
        }

        scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
            promise.reject("NO_SCANNER", "This device cannot scan for BLE advertisements")
            return
        }

        // Match on company id plus the magic byte, so unrelated manufacturer
        // traffic is discarded by the Bluetooth stack instead of waking JS for
        // every advertisement in the area. In a crowded protest that is the
        // difference between a usable app and a dead battery.
        val filter =
            ScanFilter.Builder()
                .setManufacturerData(
                    manufacturerId,
                    byteArrayOf(VOX_MAGIC),
                    byteArrayOf(0xFF.toByte()),
                )
                .build()

        val settingsBuilder =
            ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
                // Report every advertisement, not just the first sighting of
                // each device. A mesh peer re-advertises constantly with new
                // chunk data; suppressing repeats would drop the payload.
                .setReportDelay(0)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Without setLegacy(false) Android delivers legacy advertisements
            // only, and every extended-advertising peer becomes invisible.
            settingsBuilder.setLegacy(false)
            settingsBuilder.setPhy(ScanSettings.PHY_LE_ALL_SUPPORTED)
        }

        val callback =
            object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult?) {
                    handleScanResult(result)
                }

                override fun onBatchScanResults(results: MutableList<ScanResult>?) {
                    results?.forEach { handleScanResult(it) }
                }

                override fun onScanFailed(errorCode: Int) {
                    emitState("scan_error", scanErrorName(errorCode))
                }
            }
        scanCallback = callback

        try {
            scanner?.startScan(listOf(filter), settingsBuilder.build(), callback)
            emitState("scanning", null)
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("NO_PERMISSION", e.message, e)
        }
    }

    private fun handleScanResult(result: ScanResult?) {
        val record = result?.scanRecord ?: return
        val data = record.getManufacturerSpecificData(manufacturerId) ?: return
        // Strip the magic byte the filter matched on; JS only ever sees the
        // chunk payload itself.
        if (data.isEmpty() || data[0] != VOX_MAGIC) return
        val payload = data.copyOfRange(1, data.size)
        if (payload.isEmpty()) return

        val map = Arguments.createMap()
        map.putString("payload", Base64.encodeToString(payload, Base64.NO_WRAP))
        map.putInt("rssi", result.rssi)
        map.putDouble("timestamp", System.currentTimeMillis().toDouble())
        emit(EVENT_FRAME, map)
    }

    @ReactMethod
    fun stopScanning(promise: Promise) {
        try {
            scanCallback?.let { scanner?.stopScan(it) }
        } catch (e: SecurityException) {
            // Permission revoked mid-flight; the scan is already dead.
        }
        scanCallback = null
        promise.resolve(true)
    }

    override fun invalidate() {
        // The app is going away. Leaving a BLE advertiser running would keep
        // broadcasting this device's presence after the user thinks they have
        // closed the app — which for this threat model is a real problem, not
        // just a leak.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                advertisingSetCallback?.let { advertiser?.stopAdvertisingSet(it) }
            } else {
                @Suppress("DEPRECATION")
                legacyAdvertiseCallback?.let { advertiser?.stopAdvertising(it) }
            }
            scanCallback?.let { scanner?.stopScan(it) }
        } catch (e: SecurityException) {
            // Nothing useful to do during teardown.
        }
        super.invalidate()
    }

    // --------------------------------------------------------- error naming

    private fun advertiseStatusName(status: Int): String =
        when (status) {
            AdvertisingSetCallback.ADVERTISE_FAILED_DATA_TOO_LARGE ->
                "DATA_TOO_LARGE"
            AdvertisingSetCallback.ADVERTISE_FAILED_TOO_MANY_ADVERTISERS ->
                "TOO_MANY_ADVERTISERS"
            AdvertisingSetCallback.ADVERTISE_FAILED_ALREADY_STARTED ->
                "ALREADY_STARTED"
            AdvertisingSetCallback.ADVERTISE_FAILED_INTERNAL_ERROR ->
                "INTERNAL_ERROR"
            AdvertisingSetCallback.ADVERTISE_FAILED_FEATURE_UNSUPPORTED ->
                "FEATURE_UNSUPPORTED"
            else -> "UNKNOWN_$status"
        }

    @Suppress("DEPRECATION")
    private fun legacyErrorName(errorCode: Int): String =
        when (errorCode) {
            AdvertiseCallback.ADVERTISE_FAILED_DATA_TOO_LARGE -> "DATA_TOO_LARGE"
            AdvertiseCallback.ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "TOO_MANY_ADVERTISERS"
            AdvertiseCallback.ADVERTISE_FAILED_ALREADY_STARTED -> "ALREADY_STARTED"
            AdvertiseCallback.ADVERTISE_FAILED_INTERNAL_ERROR -> "INTERNAL_ERROR"
            AdvertiseCallback.ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "FEATURE_UNSUPPORTED"
            else -> "UNKNOWN_$errorCode"
        }

    private fun scanErrorName(errorCode: Int): String =
        when (errorCode) {
            ScanCallback.SCAN_FAILED_ALREADY_STARTED -> "ALREADY_STARTED"
            ScanCallback.SCAN_FAILED_APPLICATION_REGISTRATION_FAILED -> "REGISTRATION_FAILED"
            ScanCallback.SCAN_FAILED_FEATURE_UNSUPPORTED -> "FEATURE_UNSUPPORTED"
            ScanCallback.SCAN_FAILED_INTERNAL_ERROR -> "INTERNAL_ERROR"
            else -> "UNKNOWN_$errorCode"
        }
}
