package com.cursormobileaccess.app.notify

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.cursormobileaccess.app.MainActivity
import com.cursormobileaccess.app.R

class AgentNotifier(private val context: Context) {
    private val manager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    init {
        val status = NotificationChannel(
            CHANNEL_STATUS,
            context.getString(R.string.notification_channel_status_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.notification_channel_status_desc)
            setShowBadge(false)
        }
        val alerts = NotificationChannel(
            CHANNEL_ALERTS,
            context.getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_channel_desc)
        }
        manager.createNotificationChannel(status)
        manager.createNotificationChannel(alerts)
    }

    fun updateStatus(
        phase: String,
        activityText: String?,
        projectName: String?,
        hasActions: Boolean,
    ) {
        val (title, body) = statusCopy(phase, activityText, projectName, hasActions)
        val priority = when (phase) {
            "awaiting_input" -> NotificationCompat.PRIORITY_HIGH
            "thinking", "tool" -> NotificationCompat.PRIORITY_DEFAULT
            else -> NotificationCompat.PRIORITY_LOW
        }
        val notification = NotificationCompat.Builder(context, CHANNEL_STATUS)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(phase != "awaiting_input")
            .setPriority(priority)
            .setContentIntent(launchIntent())
            .build()
        manager.notify(FOREGROUND_ID, notification)
    }

    fun alert(title: String, body: String) {
        val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(launchIntent())
            .build()
        manager.notify(ALERT_ID, notification)
    }

    fun clear() {
        manager.cancel(FOREGROUND_ID)
        manager.cancel(ALERT_ID)
    }

    private fun launchIntent(): PendingIntent =
        PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun statusCopy(
        phase: String,
        activityText: String?,
        projectName: String?,
        hasActions: Boolean,
    ): Pair<String, String> {
        val title = when (phase) {
            "thinking" -> "Cursor is thinking"
            "tool" -> "Cursor is working"
            "awaiting_input" -> "Cursor needs you"
            "idle" -> "Cursor is ready"
            "disconnected" -> "Cursor disconnected"
            "error" -> "Cursor error"
            else -> "CursorMobileAccess"
        }
        val body = when {
            phase == "awaiting_input" && !activityText.isNullOrBlank() -> activityText
            phase == "awaiting_input" && hasActions -> "Action required"
            !activityText.isNullOrBlank() -> activityText
            !projectName.isNullOrBlank() -> projectName
            phase == "thinking" -> "Generating a response…"
            phase == "tool" -> "Running a tool…"
            phase == "idle" -> "Agent is idle"
            else -> "Connected to bridge"
        }
        return title to body
    }

    companion object {
        const val FOREGROUND_ID = 1
        private const val ALERT_ID = 42
        private const val CHANNEL_STATUS = "cma_status"
        private const val CHANNEL_ALERTS = "cma_attention"

        fun buildForegroundNotification(
            context: Context,
            title: String,
            body: String,
        ): Notification {
            val manager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_STATUS,
                    context.getString(R.string.notification_channel_status_name),
                    NotificationManager.IMPORTANCE_LOW,
                )
                manager.createNotificationChannel(channel)
            }
            val launch = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(context, CHANNEL_STATUS)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(title)
                .setContentText(body)
                .setOngoing(true)
                .setContentIntent(launch)
                .build()
        }
    }
}
