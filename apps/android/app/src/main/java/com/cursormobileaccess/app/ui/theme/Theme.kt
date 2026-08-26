package com.cursormobileaccess.app.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Bg = Color(0xFF0E1116)
val BgElev = Color(0xFF12161E)
val Panel = Color(0xFF161B24)
val Line = Color(0xFF1E2430)
val Border = Color(0xFF2A3344)
val Text = Color(0xFFF4F1EA)
val Muted = Color(0xFF9AA3B2)
val Faint = Color(0xFF6B7280)
val Accent = Color(0xFFE8A838)
val AccentInk = Color(0xFF0E1116)
val Danger = Color(0xFFF07178)
val Ok = Color(0xFF5CDB95)
val UserBubble = Color(0xFF243049)
val AnswerMuted = Color(0xFF2A3344)

private val scheme = darkColorScheme(
    primary = Accent,
    onPrimary = AccentInk,
    background = Bg,
    onBackground = Text,
    surface = Panel,
    onSurface = Text,
    error = Danger,
)

@Composable
fun CmaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
