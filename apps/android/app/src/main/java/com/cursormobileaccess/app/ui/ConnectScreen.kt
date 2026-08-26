package com.cursormobileaccess.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cursormobileaccess.app.data.ConnState
import com.cursormobileaccess.app.ui.theme.Accent
import com.cursormobileaccess.app.ui.theme.AccentInk
import com.cursormobileaccess.app.ui.theme.Border
import com.cursormobileaccess.app.ui.theme.Danger
import com.cursormobileaccess.app.ui.theme.Muted
import com.cursormobileaccess.app.ui.theme.Panel
import com.cursormobileaccess.app.ui.theme.Text as CmaText

@Composable
fun ConnectScreen(
    host: String,
    token: String,
    conn: ConnState,
    error: String?,
    onHost: (String) -> Unit,
    onToken: (String) -> Unit,
    onConnect: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 24.dp)
            .background(Panel, RoundedCornerShape(16.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Connect", color = CmaText, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "Same protocol as the web UI. Enter the Tailscale bridge host and auth token.",
            color = Muted,
            fontSize = 15.sp,
        )
        FieldLabel("Bridge host")
        OutlinedTextField(
            value = host,
            onValueChange = onHost,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("100.x.x.x:8787 or host.tailnet.ts.net:8787") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Uri,
                imeAction = ImeAction.Next,
            ),
            colors = fieldColors(),
        )
        FieldLabel("Auth token")
        OutlinedTextField(
            value = token,
            onValueChange = onToken,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onGo = { onConnect() }),
            colors = fieldColors(),
        )
        Button(
            onClick = onConnect,
            enabled = conn != ConnState.Connecting,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = AccentInk),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(
                if (conn == ConnState.Connecting) "Connecting…" else "Enter",
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
        }
        if (error != null) {
            Text(error, color = Danger)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "Keep Cursor Agents Window focused on the chat you want to control.",
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
    focusedContainerColor = com.cursormobileaccess.app.ui.theme.Bg,
    unfocusedContainerColor = com.cursormobileaccess.app.ui.theme.Bg,
    cursorColor = Accent,
    focusedPlaceholderColor = Muted,
    unfocusedPlaceholderColor = Muted,
)
