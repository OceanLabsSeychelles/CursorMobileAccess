package com.cursormobileaccess.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cursormobileaccess.app.data.Action
import com.cursormobileaccess.app.data.ConnState
import com.cursormobileaccess.app.data.SessionSnapshot
import com.cursormobileaccess.app.ui.theme.Accent
import com.cursormobileaccess.app.ui.theme.AccentInk
import com.cursormobileaccess.app.ui.theme.AnswerMuted
import com.cursormobileaccess.app.ui.theme.Bg
import com.cursormobileaccess.app.ui.theme.BgElev
import com.cursormobileaccess.app.ui.theme.Border
import com.cursormobileaccess.app.ui.theme.Danger
import com.cursormobileaccess.app.ui.theme.Faint
import com.cursormobileaccess.app.ui.theme.Line
import com.cursormobileaccess.app.ui.theme.Muted
import com.cursormobileaccess.app.ui.theme.Ok
import com.cursormobileaccess.app.ui.theme.Panel
import com.cursormobileaccess.app.ui.theme.Text as CmaText

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SessionScreen(
    conn: ConnState,
    snapshot: SessionSnapshot,
    chromeCompact: Boolean,
    attention: String?,
    error: String?,
    selectedOptionId: String?,
    showFreeform: Boolean,
    freeformText: String,
    draft: String,
    pendingImageName: String?,
    attaching: Boolean,
    onToggleChrome: () -> Unit,
    onOpenSettings: () -> Unit,
    onDisconnect: () -> Unit,
    onSelectTab: (String) -> Unit,
    onPressAction: (Action) -> Unit,
    onFreeformChange: (String) -> Unit,
    onApplyFreeform: () -> Unit,
    onDraftChange: (String) -> Unit,
    onPickImage: () -> Unit,
    onClearImage: () -> Unit,
    onSend: () -> Unit,
) {
    val listState = rememberLazyListState()
    val imeVisible = WindowInsets.isImeVisible
    var composerActive by remember { mutableStateOf(false) }
    val headerCompact = chromeCompact || imeVisible || composerActive

    LaunchedEffect(imeVisible) {
        if (!imeVisible) composerActive = false
    }

    LaunchedEffect(snapshot.timeline.size, snapshot.timeline.lastOrNull()?.id) {
        if (snapshot.timeline.isNotEmpty()) {
            listState.scrollToItem(snapshot.timeline.lastIndex)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .navigationBarsPadding(),
    ) {
        Header(
            conn = conn,
            snapshot = snapshot,
            compact = headerCompact,
            attention = attention,
            error = error,
            onToggle = onToggleChrome,
            onSettings = onOpenSettings,
            onDisconnect = onDisconnect,
            onSelectTab = onSelectTab,
        )
        if (conn != ConnState.Live) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    when (conn) {
                        ConnState.Connecting -> "Connecting to bridge…"
                        ConnState.Error -> error ?: "Disconnected"
                        else -> "Not connected"
                    },
                    color = if (conn == ConnState.Error) Danger else Faint,
                    modifier = Modifier.padding(horizontal = 24.dp),
                )
            }
        } else if (snapshot.timeline.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.TopCenter,
            ) {
                Text(
                    "No messages yet for this chat.",
                    color = Faint,
                    modifier = Modifier.padding(top = 48.dp),
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(snapshot.timeline, key = { it.id }) { item ->
                    TimelineRow(item)
                }
            }
        }

        if (!(headerCompact && snapshot.actions.isEmpty())) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = if (headerCompact) 160.dp else 320.dp)
                    .background(Panel.copy(alpha = 0.92f))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
            if (snapshot.actions.isNotEmpty()) {
                Text(
                    "NEEDS YOUR ACTION",
                    color = Accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.7.sp,
                )
                if (!snapshot.pendingPrompt.isNullOrBlank()) {
                    Text(
                        snapshot.pendingPrompt,
                        color = CmaText,
                        fontSize = 16.sp,
                        modifier = Modifier.padding(top = 8.dp, bottom = 8.dp),
                    )
                } else {
                    Spacer(Modifier.height(8.dp))
                }
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    snapshot.actions.forEach { action ->
                        val selected = action.kind == "answer" &&
                            selectedOptionId != null &&
                            (action.optionId == selectedOptionId || action.id == selectedOptionId)
                        ActionChip(action, selected) { onPressAction(action) }
                    }
                }
                if (showFreeform) {
                    Text(
                        "OTHER — TYPE YOUR ANSWER",
                        color = Ok,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp,
                        modifier = Modifier.padding(top = 12.dp, bottom = 6.dp),
                    )
                    OutlinedTextField(
                        value = freeformText,
                        onValueChange = {
                            if (it.isNotEmpty()) composerActive = true
                            onFreeformChange(it)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 72.dp)
                            .onFocusChanged { focus ->
                                if (focus.isFocused) composerActive = true
                            },
                        placeholder = { Text("Type here, then tap Continue…") },
                        minLines = 3,
                        colors = composerFieldColors(),
                    )
                    Button(
                        onClick = onApplyFreeform,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Accent,
                            contentColor = AccentInk,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.padding(top = 8.dp),
                    ) {
                        Text("Apply text to Cursor", fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                Text(
                    "No pending Run / Skip / Approve / answer buttons in Cursor right now. When the agent waits for one, it will show up here.",
                    color = Faint,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                )
            }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(BgElev)
                .padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TextButton(
                onClick = onPickImage,
                enabled = !attaching,
            ) {
                Text("📎", fontSize = 20.sp)
            }
            Column(modifier = Modifier.weight(1f)) {
                if (pendingImageName != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            "Image: $pendingImageName",
                            color = Accent,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = onClearImage) {
                            Text("✕", color = Danger, fontSize = 12.sp)
                        }
                    }
                }
                OutlinedTextField(
                    value = draft,
                    onValueChange = {
                        if (it.isNotEmpty()) composerActive = true
                        onDraftChange(it)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .onFocusChanged { focus ->
                            if (focus.isFocused) composerActive = true
                        },
                    placeholder = {
                        Text(
                            if (pendingImageName != null) "Caption (optional)…"
                            else "Message the active chat…",
                        )
                    },
                    minLines = 2,
                    maxLines = 5,
                    enabled = !attaching,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    colors = composerFieldColors(),
                )
            }
            Button(
                onClick = onSend,
                enabled = !attaching && (draft.isNotBlank() || pendingImageName != null),
                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = AccentInk),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    if (attaching) "…" else "Send",
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun Header(
    conn: ConnState,
    snapshot: SessionSnapshot,
    compact: Boolean,
    attention: String?,
    error: String?,
    onToggle: () -> Unit,
    onSettings: () -> Unit,
    onDisconnect: () -> Unit,
    onSelectTab: (String) -> Unit,
) {
    val phaseLabel = when (conn) {
        ConnState.Connecting -> "Connecting"
        ConnState.Error -> "Offline"
        ConnState.Idle -> "Offline"
        ConnState.Live -> when (snapshot.phase) {
            "disconnected" -> "Offline"
            "idle" -> "Ready"
            "thinking" -> "Thinking"
            "tool" -> "Working"
            "awaiting_input" -> "Needs you"
            "error" -> "Error"
            else -> snapshot.phase
        }
    }
    val dot = when {
        conn != ConnState.Live -> Danger
        snapshot.phase == "awaiting_input" -> Accent
        snapshot.cdp -> Ok
        else -> Danger
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(BgElev)
            .padding(bottom = 4.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = if (compact) 10.dp else 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                if (!compact) {
                    Text(
                        "CursorMobileAccess",
                        color = CmaText,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.5).sp,
                    )
                    Text(
                        "Your agents. Your network. Your UI.",
                        color = Muted,
                        fontSize = 15.sp,
                        modifier = Modifier.padding(top = 2.dp, bottom = 12.dp),
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(9.dp)
                            .clip(CircleShape)
                            .background(dot),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(phaseLabel, color = Accent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    if (!snapshot.activityText.isNullOrBlank()) {
                        Text(
                            snapshot.activityText,
                            color = Faint,
                            fontSize = 14.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
            TextButton(onClick = onToggle) {
                Text(if (compact) "▾" else "▴", color = CmaText, fontSize = 20.sp)
            }
        }

        if (!compact) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(snapshot.projectName, color = CmaText, fontWeight = FontWeight.SemiBold)
                Row {
                    TextButton(onClick = onSettings) {
                        Text("Settings", color = Accent, fontWeight = FontWeight.SemiBold)
                    }
                    TextButton(onClick = onDisconnect) {
                        Text("Disconnect", color = Accent, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            if (snapshot.tabs.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    snapshot.tabs.forEach { tab ->
                        val bg = if (tab.active) Accent else Panel
                        val fg = if (tab.active) AccentInk else Muted
                        val label = tab.title.ifBlank { "Untitled chat" }
                        TextButton(
                            onClick = { onSelectTab(tab.id) },
                            colors = ButtonDefaults.textButtonColors(contentColor = fg),
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(bg)
                                .border(1.dp, if (tab.active) Accent else Border, CircleShape),
                        ) {
                            Text(
                                label,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                fontWeight = if (tab.active) FontWeight.Bold else FontWeight.Normal,
                            )
                        }
                    }
                }
            } else {
                Text(
                    "No chat list yet — open the Agents sidebar in Cursor.",
                    color = Faint,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
            if (attention != null) {
                Banner(attention, Accent.copy(alpha = 0.18f))
            }
            if (error != null) {
                Banner(error, Danger.copy(alpha = 0.18f))
            }
        }
    }
}

@Composable
private fun Banner(text: String, tint: androidx.compose.ui.graphics.Color) {
    Text(
        text,
        color = CmaText,
        fontSize = 14.sp,
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .fillMaxWidth()
            .background(tint, RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    )
}

@Composable
private fun ActionChip(action: Action, selected: Boolean, onPress: () -> Unit) {
    val isAnswer = action.kind == "answer"
    val primary = action.kind in setOf("approve", "run", "allow", "build")
    val bg = when {
        selected -> Ok
        isAnswer -> AnswerMuted
        primary -> Accent
        else -> Border
    }
    val fg = when {
        selected -> AccentInk
        isAnswer -> CmaText
        primary -> AccentInk
        else -> CmaText
    }
    val label = if (selected && isAnswer) "✓ ${action.label}" else action.label
    Button(
        onClick = onPress,
        colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = fg),
        shape = CircleShape,
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
        border = if (selected) androidx.compose.foundation.BorderStroke(2.dp, CmaText) else null,
    ) {
        Text(label, fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.SemiBold)
    }
}

@Composable
private fun composerFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = CmaText,
    unfocusedTextColor = CmaText,
    focusedBorderColor = Border,
    unfocusedBorderColor = Border,
    focusedContainerColor = Bg,
    unfocusedContainerColor = Bg,
    cursorColor = Accent,
    focusedPlaceholderColor = Muted,
    unfocusedPlaceholderColor = Muted,
)
