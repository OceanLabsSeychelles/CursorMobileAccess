package com.cursormobileaccess.app.data

import android.content.Context

class Prefs(context: Context) {
    private val prefs = context.getSharedPreferences("cma", Context.MODE_PRIVATE)

    var host: String
        get() = prefs.getString(KEY_HOST, "") ?: ""
        set(value) {
            prefs.edit().putString(KEY_HOST, value.trim()).apply()
        }

    var token: String
        get() = prefs.getString(KEY_TOKEN, "") ?: ""
        set(value) {
            prefs.edit().putString(KEY_TOKEN, value).apply()
        }

    var chromeCompact: Boolean
        get() = prefs.getBoolean(KEY_COMPACT, false)
        set(value) {
            prefs.edit().putBoolean(KEY_COMPACT, value).apply()
        }

    /** When true, app reconnects on launch if host+token are saved. */
    var autoConnect: Boolean
        get() = prefs.getBoolean(KEY_AUTO, true)
        set(value) {
            prefs.edit().putBoolean(KEY_AUTO, value).apply()
        }

    fun hasCredentials(): Boolean =
        host.isNotBlank() && token.isNotBlank()

    companion object {
        private const val KEY_HOST = "host"
        private const val KEY_TOKEN = "token"
        private const val KEY_COMPACT = "chrome_compact"
        private const val KEY_AUTO = "auto_connect"
    }
}
