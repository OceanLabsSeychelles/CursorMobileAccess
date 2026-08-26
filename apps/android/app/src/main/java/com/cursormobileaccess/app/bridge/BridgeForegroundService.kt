package com.cursormobileaccess.app.bridge

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.cursormobileaccess.app.notify.AgentNotifier

/** Keeps the bridge connection alive while connected (foreground process). */
class BridgeForegroundService : Service() {
    override fun onCreate() {
        super.onCreate()
        BridgeHub.init(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = AgentNotifier.buildForegroundNotification(
            this,
            title = "CursorMobileAccess",
            body = "Connecting to bridge…",
        )
        startForeground(AgentNotifier.FOREGROUND_ID, notification)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    companion object {
        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, BridgeForegroundService::class.java),
            )
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, BridgeForegroundService::class.java))
        }
    }
}
