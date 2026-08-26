package com.cursormobileaccess.app.data

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class BridgeClient(
    private val onOpen: () -> Unit,
    private val onMessage: (ServerMessage) -> Unit,
    private val onClosed: () -> Unit,
    private val onFailure: (String) -> Unit,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val socket = AtomicReference<WebSocket?>(null)
    @Volatile private var closing = false

    fun connect(wsUrl: String, token: String) {
        disconnect()
        closing = false
        val request = Request.Builder().url(wsUrl).build()
        val ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                onOpen()
                webSocket.send(authFrame(token))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = parseServerMessage(text)
                if (msg != null) {
                    onMessage(msg)
                } else {
                    onFailure("Bad server frame")
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                socket.compareAndSet(webSocket, null)
                onClosed()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                socket.compareAndSet(webSocket, null)
                if (!closing) {
                    onFailure(t.message ?: "WebSocket error - is the bridge running?")
                }
            }
        })
        socket.set(ws)
    }

    fun send(payload: CommandPayload) {
        val ws = socket.get() ?: return
        val commandId = "c-${System.currentTimeMillis()}"
        ws.send(commandFrame(commandId, payload))
    }

    fun disconnect() {
        closing = true
        socket.getAndSet(null)?.close(1000, "bye")
    }
}
