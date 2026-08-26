package com.cursormobileaccess.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cursormobileaccess.app.ui.theme.Accent
import com.cursormobileaccess.app.ui.theme.AccentInk
import com.cursormobileaccess.app.ui.theme.Bg
import com.cursormobileaccess.app.ui.theme.Border
import com.cursormobileaccess.app.ui.theme.Danger
import com.cursormobileaccess.app.ui.theme.Muted
import com.cursormobileaccess.app.ui.theme.Panel
import com.cursormobileaccess.app.ui.theme.Text as CmaText

@Composable
fun SettingsScreen(
    host: String,
    token: String,
    autoConnect: Boolean,
    connected: Boolean,
    error: String?,
    onSave: (host: String, token: String, autoConnect: Boolean) -> Unit,
    onDisconnect: () -> Unit,
    onBack: (() -> Unit)?,
) {
    var hostDraft by remember(host) { mutableStateOf(host) }
    var tokenDraft by remember(token) { mutableStateOf(token) }
    var autoDraft by remember(autoConnect) { mutableStateOf(autoConnect) }
    var showToken by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Settings", color = CmaText, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            if (onBack != null) {
                TextButton(onClick = onBack) {
                    Text("Back", color = Accent, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Text(
            "Saved on this phone. With auto-connect on, the app reconnects when you open it.",
            color = Muted,
            fontSize = 14.sp,
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Panel, RoundedCornerShape(16.dp))
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            FieldLabel("Bridge host")
            OutlinedTextField(
                value = hostDraft,
                onValueChange = { hostDraft = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("100.x.x.x:8787") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Next,
                ),
                colors = fieldColors(),
            )
            FieldLabel("Auth token")
            OutlinedTextField(
                value = tokenDraft,
                onValueChange = { tokenDraft = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = if (showToken) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                colors = fieldColors(),
            )
            TextButton(onClick = { showToken = !showToken }) {
                Text(
                    if (showToken) "Hide token" else "Show token",
                    color = Accent,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Auto-connect", color = CmaText, fontWeight = FontWeight.SemiBold)
                    Text("Reconnect on app launch", color = Muted, fontSize = 13.sp)
                }
                Switch(
                    checked = autoDraft,
                    onCheckedChange = { autoDraft = it },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = AccentInk,
                        checkedTrackColor = Accent,
                    ),
                )
            }
        }

        if (error != null) {
            Text(error, color = Danger)
        }

        Button(
            onClick = { onSave(hostDraft.trim(), tokenDraft, autoDraft) },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = AccentInk),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(
                if (connected) "Save & reconnect" else "Save & connect",
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
        }

        if (connected) {
            TextButton(onClick = onDisconnect, modifier = Modifier.fillMaxWidth()) {
                Text("Disconnect", color = Danger, fontWeight = FontWeight.SemiBold)
            }
        }

        Spacer(Modifier.height(8.dp))
        Text(
            "Images: use the paperclip on the chat screen. Files go to Cursor’s composer over Tailscale.",
            color = Muted,
            fontSize = 13.sp,
        )
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(
        text.uppercase(),
        color = Muted,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.8.sp,
    )
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = CmaText,
    unfocusedTextColor = CmaText,
    focusedBorderColor = Accent,
    unfocusedBorderColor = Border,
    focusedContainerColor = Bg,
    unfocusedContainerColor = Bg,
    cursorColor = Accent,
    focusedPlaceholderColor = Muted,
    unfocusedPlaceholderColor = Muted,
)
