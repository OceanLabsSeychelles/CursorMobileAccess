package com.cursormobileaccess.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.cursormobileaccess.app.Screen
import com.cursormobileaccess.app.SessionViewModel
import com.cursormobileaccess.app.data.ConnState
import com.cursormobileaccess.app.ui.theme.Bg

@Composable
fun CmaApp(vm: SessionViewModel = viewModel()) {
    val state by vm.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val imagePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        val cr = context.contentResolver
        val name = cr.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { c ->
                if (c.moveToFirst()) {
                    val i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (i >= 0) c.getString(i) else null
                } else {
                    null
                }
            } ?: "photo.jpg"
        val mime = cr.getType(uri) ?: "image/jpeg"
        val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: return@rememberLauncherForActivityResult
        vm.setPendingImage(name, mime, bytes)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg)
            .statusBarsPadding(),
    ) {
        when (state.screen) {
            Screen.Settings -> SettingsScreen(
                host = state.host,
                token = state.token,
                autoConnect = state.autoConnect,
                connected = state.conn == ConnState.Live,
                error = state.error
                    ?: if (state.conn == ConnState.Connecting) "Connecting…" else null,
                onSave = vm::saveSettings,
                onDisconnect = vm::disconnect,
                onBack = if (state.conn == ConnState.Live) ({ vm.closeSettings() }) else null,
            )
            Screen.Session -> SessionScreen(
                conn = state.conn,
                snapshot = state.snapshot,
                chromeCompact = state.chromeCompact,
                attention = state.attention,
                error = state.error,
                selectedOptionId = state.selectedOptionId,
                showFreeform = state.showFreeform,
                freeformText = state.freeformText,
                draft = state.draft,
                pendingImageName = state.pendingImage?.name,
                attaching = state.attaching,
                onToggleChrome = { vm.setChromeCompact(!state.chromeCompact) },
                onOpenSettings = vm::openSettings,
                onDisconnect = vm::disconnect,
                onSelectTab = vm::selectTab,
                onPressAction = { a ->
                    vm.pressAction(a.id, a.kind, a.optionId, a.freeform)
                },
                onFreeformChange = vm::setFreeformText,
                onApplyFreeform = vm::applyFreeform,
                onDraftChange = vm::setDraft,
                onPickImage = { imagePicker.launch("image/*") },
                onClearImage = vm::clearPendingImage,
                onSend = vm::sendMessage,
            )
        }
    }
}
