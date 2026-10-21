package com.cursormobileaccess.app.bridge

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import com.cursormobileaccess.app.notify.AgentNotifier

/**
 * Keeps the process alive while connected to the bridge.
 *
 * Uses [ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE] — `dataSync` has a
 * short Android 14/15 quota and was crash-looping this app after timeout.
 */
class BridgeForegroundService : Service() {
    override fun onCreate() {
        super.onCreate()
        BridgeHub.init(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = AgentNotifier.buildForegroundNotification(
            this,
            title = "CursorMobileAccess",
            body = "Connected to bridge",
        )
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    AgentNotifier.FOREGROUND_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(AgentNotifier.FOREGROUND_ID, notification)
            }
        } catch (e: IllegalStateException) {
            // Includes ForegroundServiceStartNotAllowedException on API 31+.
            Log.w(TAG, "startForeground not allowed — stopping service", e)
            stopSelf()
            return START_NOT_STICKY
        }
        // Do not auto-restart after a system kill (that was crash-looping when
        // the old dataSync quota was exhausted). User/auto-connect will reopen.
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "CmaFgs"

        fun start(context: Context) {
            try {
                ContextCompat.startForegroundService(
                    context,
                    Intent(context, BridgeForegroundService::class.java),
                )
            } catch (e: IllegalStateException) {
                Log.w(TAG, "Cannot start FGS from this app state", e)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, BridgeForegroundService::class.java))
        }
    }
}
