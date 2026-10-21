package com.cursormobileaccess.app.bridge

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.cursormobileaccess.app.data.BridgeClient
import com.cursormobileaccess.app.data.CommandPayload
import com.cursormobileaccess.app.data.ConnState
import com.cursormobileaccess.app.data.Prefs
import com.cursormobileaccess.app.data.ServerMessage
import com.cursormobileaccess.app.data.SessionSnapshot
import com.cursormobileaccess.app.data.normalizeWsUrl
import com.cursormobileaccess.app.notify.AgentNotifier
import java.util.concurrent.CopyOnWriteArrayList

data class BridgeConnectionState(
    val conn: ConnState = ConnState.Idle,
    val snapshot: SessionSnapshot = SessionSnapshot(),
    val error: String? = null,
    val attention: String? = null,
)

/** Process-wide bridge connection — survives Activity/ViewModel lifecycle. */
object BridgeHub {
    private val main = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArrayList<(BridgeConnectionState) -> Unit>()
    private var appContext: Context? = null
    private var prefs: Prefs? = null
    private var notifier: AgentNotifier? = null
    private var client: BridgeClient? = null
    private var userDisconnected = false
    private var reconnectRunnable: Runnable? = null
    private var reconnectDelayMs = 1_000L
    private var state = BridgeConnectionState()

    fun init(context: Context) {
        if (prefs != null) return
        val app = context.applicationContext
        appContext = app
        prefs = Prefs(app)
        notifier = AgentNotifier(app)
    }

    fun currentState(): BridgeConnectionState = state

    fun addListener(listener: (BridgeConnectionState) -> Unit) {
        listeners.add(listener)
        listener(state)
    }

    fun removeListener(listener: (BridgeConnectionState) -> Unit) {
        listeners.remove(listener)
    }

    fun connect(context: Context, host: String, token: String, fromAuto: Boolean = false) {
        init(context)
        val h = host.trim()
        if (h.isEmpty() || token.isBlank()) {
            publish(
                state.copy(
                    conn = ConnState.Error,
                    error = if (h.isEmpty()) {
                        "Enter the bridge host (Tailscale IP or MagicDNS + port)"
                    } else {
                        "Enter the auth token"
                    },
                ),
            )
            return
        }
        userDisconnected = false
        cancelReconnect()
        prefs?.host = h
        prefs?.token = token
        BridgeForegroundService.start(context.applicationContext)
        client?.disconnect()
        publish(
            state.copy(
                conn = ConnState.Connecting,
                error = null,
                attention = null,
                snapshot = SessionSnapshot(),
            ),
        )
        try {
            val bridge = BridgeClient(
                onOpen = {},
                onMessage = { msg -> onMain { handleMessage(msg) } },
                onClosed = { onMain { handleConnectionLost() } },
                onFailure = { err -> onMain { handleConnectionLost(err) } },
            )
            client = bridge
            bridge.connect(normalizeWsUrl(h), token)
        } catch (e: Exception) {
            handleConnectionLost(e.message, fromAuto)
        }
    }

    fun disconnect(context: Context) {
        userDisconnected = true
        cancelReconnect()
        client?.disconnect()
        client = null
        publish(state.copy(conn = ConnState.Idle, error = null, attention = null))
        notifier?.clear()
        BridgeForegroundService.stop(context.applicationContext)
    }

    fun send(payload: CommandPayload) {
        if (state.conn != ConnState.Live) return
        client?.send(payload)
    }

    private fun handleMessage(msg: ServerMessage) {
        when (msg) {
            ServerMessage.AuthOk -> {
                reconnectDelayMs = 1_000L
                cancelReconnect()
                publish(state.copy(conn = ConnState.Live, error = null))
                notifier?.updateStatus("idle", "Connected to bridge", null, false)
            }
            is ServerMessage.AuthError -> {
                client?.disconnect()
                client = null
                publish(
                    state.copy(
                        conn = ConnState.Error,
                        error = msg.message,
                    ),
                )
            }
            is ServerMessage.Snapshot -> {
                publish(state.copy(snapshot = msg.state))
                updateAgentNotification(msg.state)
            }
            is ServerMessage.Patch -> {
                val next = msg.patch(state.snapshot)
                publish(state.copy(snapshot = next))
                updateAgentNotification(next)
            }
            is ServerMessage.CommandResult -> {
                if (!msg.ok) {
                    publish(state.copy(error = msg.error ?: "Command failed"))
                } else if (state.error != null) {
                    publish(state.copy(error = null))
                }
            }
            is ServerMessage.Attention -> {
                publish(state.copy(attention = "${msg.title}: ${msg.body}"))
                // Only buzz for things that need the user. Errors / disconnects /
                // idle are shown in-app (and on the quiet status notification).
                if (msg.reason == "awaiting_input") {
                    notifier?.alert(msg.title, msg.body)
                }
            }
        }
    }

    private fun updateAgentNotification(snapshot: SessionSnapshot) {
        if (state.conn != ConnState.Live) return
        notifier?.updateStatus(
            phase = snapshot.phase,
            activityText = snapshot.activityText,
            projectName = snapshot.projectName,
            hasActions = snapshot.actions.isNotEmpty(),
        )
    }

    private fun handleConnectionLost(rawError: String? = null, fromAuto: Boolean = false) {
        val p = prefs
        if (p != null && p.autoConnect && p.hasCredentials() && !userDisconnected) {
            scheduleReconnect()
            return
        }
        client = null
        publish(
            state.copy(
                conn = ConnState.Error,
                error = friendlyWsError(rawError),
            ),
        )
        notifier?.clear()
    }

    private fun scheduleReconnect() {
        cancelReconnect()
        val delay = reconnectDelayMs
        reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(30_000L)
        val p = prefs ?: return
        val runnable = Runnable {
            reconnectRunnable = null
            val ctx = appContext
            if (ctx != null && p.autoConnect && p.hasCredentials() && !userDisconnected) {
                connect(ctx, p.host, p.token, fromAuto = true)
            }
        }
        reconnectRunnable = runnable
        publish(
            state.copy(
                conn = ConnState.Connecting,
                error = null,
            ),
        )
        notifier?.updateStatus(
            phase = "disconnected",
            activityText = "Reconnecting…",
            projectName = null,
            hasActions = false,
        )
        main.postDelayed(runnable, delay)
    }

    private fun cancelReconnect() {
        reconnectRunnable?.let { main.removeCallbacks(it) }
        reconnectRunnable = null
    }

    private fun publish(next: BridgeConnectionState) {
        state = next
        listeners.forEach { it(next) }
    }

    private fun friendlyWsError(raw: String?): String {
        if (raw.isNullOrBlank()) return "Can't reach bridge — is it running?"
        val msg = raw.lowercase()
        return when {
            "connection abort" in msg -> "Bridge connection dropped"
            "failed to connect" in msg || "unable to resolve" in msg ->
                "Can't reach bridge — check Tailscale and host"
            "timeout" in msg -> "Bridge timed out"
            else -> raw
        }
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block()
        else main.post(block)
    }
}
