package com.cursormobileaccess.app

import android.app.Application
import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import com.cursormobileaccess.app.bridge.BridgeHub
import com.cursormobileaccess.app.data.AttachFile
import com.cursormobileaccess.app.data.CommandPayload
import com.cursormobileaccess.app.data.ConnState
import com.cursormobileaccess.app.data.Prefs
import com.cursormobileaccess.app.data.SessionSnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class Screen { Session, Settings }

data class PendingImage(
    val name: String,
    val mime: String,
    val bytes: ByteArray,
)

data class UiState(
    val host: String = "",
    val token: String = "",
    val autoConnect: Boolean = true,
    val conn: ConnState = ConnState.Idle,
    val screen: Screen = Screen.Session,
    val snapshot: SessionSnapshot = SessionSnapshot(),
    val draft: String = "",
    val pendingImage: PendingImage? = null,
    val attaching: Boolean = false,
    val error: String? = null,
    val attention: String? = null,
    val selectedOptionId: String? = null,
    val freeformOpen: Boolean = false,
    val freeformText: String = "",
    val chromeCompact: Boolean = false,
) {
    val showFreeform: Boolean
        get() = freeformOpen && snapshot.hasAnswerActions
}

class SessionViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = Prefs(app)
    private val main = Handler(Looper.getMainLooper())
    private var autoStarted = false

    private val hubListener: (com.cursormobileaccess.app.bridge.BridgeConnectionState) -> Unit =
        { hub ->
            _ui.update { s ->
                s.copy(
                    conn = hub.conn,
                    snapshot = hub.snapshot,
                    attention = hub.attention,
                    error = hub.error,
                    attaching = if (hub.error != null) false else s.attaching,
                ).resetFreeformIfNeeded(hub.snapshot.hasAnswerActions)
            }
        }

    private val _ui = MutableStateFlow(
        UiState(
            host = prefs.host,
            token = prefs.token,
            autoConnect = prefs.autoConnect,
            chromeCompact = prefs.chromeCompact,
            screen = if (prefs.hasCredentials()) Screen.Session else Screen.Settings,
        ),
    )
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    init {
        BridgeHub.init(app)
        BridgeHub.addListener(hubListener)
        if (prefs.autoConnect && prefs.hasCredentials() && !autoStarted) {
            autoStarted = true
            if (BridgeHub.currentState().conn != ConnState.Live) {
                main.post { connect(fromAuto = true) }
            }
        }
    }

    fun setHost(value: String) = _ui.update { it.copy(host = value) }
    fun setToken(value: String) = _ui.update { it.copy(token = value) }
    fun setDraft(value: String) = _ui.update { it.copy(draft = value) }
    fun setFreeformText(value: String) = _ui.update { it.copy(freeformText = value) }

    fun setAutoConnect(value: Boolean) {
        prefs.autoConnect = value
        _ui.update { it.copy(autoConnect = value) }
    }

    fun setChromeCompact(value: Boolean) {
        prefs.chromeCompact = value
        _ui.update { it.copy(chromeCompact = value) }
    }

    fun openSettings() = _ui.update { it.copy(screen = Screen.Settings, error = null) }
    fun closeSettings() = _ui.update { it.copy(screen = Screen.Session) }

    fun saveSettings(host: String, token: String, autoConnect: Boolean) {
        val h = host.trim()
        val t = token
        prefs.host = h
        prefs.token = t
        prefs.autoConnect = autoConnect
        val changed = h != _ui.value.host || t != _ui.value.token
        val wasLive = _ui.value.conn == ConnState.Live
        _ui.update {
            it.copy(
                host = h,
                token = t,
                autoConnect = autoConnect,
                screen = Screen.Session,
                error = null,
            )
        }
        if (h.isNotBlank() && t.isNotBlank() && (changed || !wasLive)) {
            connect()
        }
    }

    fun connect(fromAuto: Boolean = false) {
        val host = _ui.value.host.trim()
        val token = _ui.value.token
        if (host.isEmpty() || token.isBlank()) {
            _ui.update {
                it.copy(
                    conn = ConnState.Error,
                    error = if (host.isEmpty()) {
                        "Enter the bridge host (Tailscale IP or MagicDNS + port)"
                    } else {
                        "Enter the auth token"
                    },
                    screen = Screen.Settings,
                )
            }
            return
        }
        prefs.host = host
        prefs.token = token
        _ui.update {
            it.copy(
                conn = ConnState.Connecting,
                error = null,
                attention = null,
                snapshot = SessionSnapshot(),
                screen = Screen.Session,
            )
        }
        BridgeHub.connect(getApplication(), host, token, fromAuto)
    }

    fun disconnect() {
        BridgeHub.disconnect(getApplication())
        _ui.update { it.copy(conn = ConnState.Idle, attaching = false, error = null) }
    }

    fun sendMessage() {
        val text = _ui.value.draft.trim()
        val pending = _ui.value.pendingImage
        if (pending != null) {
            attachAndSend(pending, text.ifEmpty { null })
            return
        }
        if (text.isEmpty()) return
        send(CommandPayload.SendMessage(text))
        _ui.update { it.copy(draft = "") }
    }

    fun setPendingImage(name: String, mime: String, bytes: ByteArray) {
        if (bytes.isEmpty()) {
            _ui.update { it.copy(error = "Empty image") }
            return
        }
        if (bytes.size > 8 * 1024 * 1024) {
            _ui.update { it.copy(error = "Image too large (max 8 MiB)") }
            return
        }
        _ui.update {
            it.copy(
                pendingImage = PendingImage(
                    name = name.ifBlank { "photo.jpg" },
                    mime = mime.ifBlank { "image/jpeg" },
                    bytes = bytes,
                ),
                error = null,
            )
        }
    }

    fun clearPendingImage() = _ui.update { it.copy(pendingImage = null) }

    private fun attachAndSend(image: PendingImage, caption: String?) {
        if (_ui.value.conn != ConnState.Live) return
        _ui.update { it.copy(attaching = true, error = null) }
        val b64 = Base64.encodeToString(image.bytes, Base64.NO_WRAP)
        send(
            CommandPayload.AttachFiles(
                files = listOf(
                    AttachFile(name = image.name, mime = image.mime, dataBase64 = b64),
                ),
                text = caption,
                submit = true,
            ),
        )
        _ui.update { it.copy(draft = "", pendingImage = null) }
        main.postDelayed({ _ui.update { it.copy(attaching = false) } }, 2_500)
    }

    fun selectTab(tabId: String) {
        _ui.update {
            it.copy(selectedOptionId = null, freeformOpen = false, freeformText = "")
        }
        send(CommandPayload.SelectTab(tabId))
    }

    fun pressAction(actionId: String, kind: String, optionId: String?, freeform: Boolean?) {
        val s = _ui.value
        if (kind == "answer") {
            _ui.update {
                it.copy(
                    selectedOptionId = optionId ?: actionId,
                    freeformOpen = freeform == true,
                    freeformText = if (freeform == true) it.freeformText else "",
                )
            }
            send(CommandPayload.InvokeAction(actionId))
            return
        }
        val continueLike = kind == "allow" ||
            kind.contains("continue", ignoreCase = true) ||
            s.snapshot.actions.find { it.id == actionId }?.label
                ?.contains("continue", ignoreCase = true) == true
        if (continueLike && s.showFreeform && s.freeformText.trim().isNotEmpty()) {
            send(CommandPayload.FillFreeform(s.freeformText.trim()))
            main.postDelayed({ send(CommandPayload.InvokeAction(actionId)) }, 350)
            return
        }
        send(CommandPayload.InvokeAction(actionId))
    }

    fun applyFreeform() {
        val text = _ui.value.freeformText.trim()
        if (text.isEmpty()) {
            _ui.update { it.copy(error = "Type an answer before Continue") }
            return
        }
        send(CommandPayload.FillFreeform(text))
    }

    override fun onCleared() {
        BridgeHub.removeListener(hubListener)
        super.onCleared()
    }

    private fun send(payload: CommandPayload) {
        if (_ui.value.conn != ConnState.Live) return
        BridgeHub.send(payload)
    }

    private fun UiState.resetFreeformIfNeeded(hasAnswers: Boolean): UiState =
        if (hasAnswers) this
        else copy(selectedOptionId = null, freeformOpen = false, freeformText = "")
}
