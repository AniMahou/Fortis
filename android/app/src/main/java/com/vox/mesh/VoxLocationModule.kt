package com.vox.mesh

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * A single GPS fix, for the SOS button and danger reports.
 *
 * Built on the platform LocationManager rather than Google's fused provider on
 * purpose: fused location requires Play Services, and a meaningful share of
 * the people this app is for are on de-Googled or older handsets. It is also
 * one fewer dependency in a build that has to compile the first time.
 *
 * The behaviour that matters here is the fallback. An SOS is pressed by
 * someone who may have seconds, so this never blocks indefinitely waiting for
 * a perfect fix: it asks for a fresh one, and if the timeout expires it
 * returns the last known position tagged `stale` so the UI can say so
 * honestly. Sending help to a slightly old location beats sending none.
 */
class VoxLocationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = NAME

    companion object {
        const val NAME = "VoxLocation"
    }

    private val locationManager: LocationManager? =
        reactContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            reactContext,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED

    private fun resultFrom(location: Location, stale: Boolean) =
        Arguments.createMap().apply {
            putDouble("latitude", location.latitude)
            putDouble("longitude", location.longitude)
            putDouble("accuracy", location.accuracy.toDouble())
            putDouble("timestamp", location.time.toDouble())
            putBoolean("stale", stale)
            putString("provider", location.provider)
        }

    private fun bestLastKnown(): Location? {
        val manager = locationManager ?: return null
        if (!hasLocationPermission()) return null
        return try {
            val providers = manager.getProviders(true)
            providers.mapNotNull { manager.getLastKnownLocation(it) }.maxByOrNull { it.time }
        } catch (e: SecurityException) {
            null
        }
    }

    @ReactMethod
    fun getCurrentPosition(timeoutMs: Int, promise: Promise) {
        if (!hasLocationPermission()) {
            promise.reject("NO_PERMISSION", "Location permission has not been granted")
            return
        }
        val manager = locationManager
        if (manager == null) {
            promise.reject("NO_PROVIDER", "This device has no location service")
            return
        }
        if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER) &&
            !manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        ) {
            // Fall back before giving up: a stale fix is still actionable.
            val last = bestLastKnown()
            if (last != null) {
                promise.resolve(resultFrom(last, stale = true))
            } else {
                promise.reject("LOCATION_OFF", "Location services are switched off")
            }
            return
        }

        val provider =
            if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                LocationManager.GPS_PROVIDER
            } else {
                LocationManager.NETWORK_PROVIDER
            }

        // `settled` guards against the classic double-resolve: the listener
        // firing and the timeout elapsing at nearly the same moment.
        var settled = false
        val handler = Handler(Looper.getMainLooper())

        val listener =
            object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    if (settled) return
                    settled = true
                    try {
                        manager.removeUpdates(this)
                    } catch (e: SecurityException) {
                        // Permission revoked mid-request; nothing to clean up.
                    }
                    handler.removeCallbacksAndMessages(null)
                    promise.resolve(resultFrom(location, stale = false))
                }

                // Required on API < 30, removed from the interface later.
                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(p0: String?, p1: Int, p2: Bundle?) = Unit

                override fun onProviderEnabled(provider: String) = Unit

                override fun onProviderDisabled(provider: String) = Unit
            }

        try {
            manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
        } catch (e: SecurityException) {
            promise.reject("NO_PERMISSION", e.message, e)
            return
        }

        handler.postDelayed(
            {
                if (settled) return@postDelayed
                settled = true
                try {
                    manager.removeUpdates(listener)
                } catch (e: SecurityException) {
                    // Nothing to clean up.
                }
                val last = bestLastKnown()
                if (last != null) {
                    promise.resolve(resultFrom(last, stale = true))
                } else {
                    promise.reject("TIMEOUT", "No GPS fix within ${timeoutMs}ms")
                }
            },
            timeoutMs.toLong(),
        )
    }

    /**
     * Instant, no-wait answer used to pre-warm the SOS screen so the button
     * already has coordinates attached the moment it is pressed.
     */
    @ReactMethod
    fun getLastKnownPosition(promise: Promise) {
        if (!hasLocationPermission()) {
            promise.reject("NO_PERMISSION", "Location permission has not been granted")
            return
        }
        val last = bestLastKnown()
        if (last != null) {
            promise.resolve(resultFrom(last, stale = true))
        } else {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun isLocationEnabled(promise: Promise) {
        val manager = locationManager
        if (manager == null) {
            promise.resolve(false)
            return
        }
        val enabled =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                manager.isLocationEnabled
            } else {
                manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            }
        promise.resolve(enabled)
    }
}
