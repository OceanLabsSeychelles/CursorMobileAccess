package com.cursormobileaccess.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cursormobileaccess.app.data.TimelineItem
import com.cursormobileaccess.app.ui.theme.Accent
import com.cursormobileaccess.app.ui.theme.Border
import com.cursormobileaccess.app.ui.theme.Faint
import com.cursormobileaccess.app.ui.theme.Muted
import com.cursormobileaccess.app.ui.theme.Panel
import com.cursormobileaccess.app.ui.theme.Text as CmaText
import com.cursormobileaccess.app.ui.theme.UserBubble

@Composable
fun TimelineRow(item: TimelineItem) {
    when (item) {
        is TimelineItem.User -> CollapsibleMessageBubble(item.id, item.text, user = true)
        is TimelineItem.Assistant -> CollapsibleMessageBubble(item.id, item.markdown, user = false)
        is TimelineItem.Thought -> {
            val dur = item.durationSec?.let { " · ${it}s" } ?: ""
            Text(
                (item.summary ?: "Thought") + dur,
                color = Faint,
                fontSize = 13.sp,
                fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
            )
        }
        is TimelineItem.Tool -> CardBlock {
            Text(item.title, color = CmaText, fontWeight = FontWeight.SemiBold)
            if (!item.detail.isNullOrBlank()) {
                Text(item.detail, color = Muted, modifier = Modifier.padding(top = 6.dp))
            }
            Text(
                item.status.uppercase(),
                color = Accent,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.7.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        is TimelineItem.Command -> CardBlock {
            Text(item.description ?: "Command", color = CmaText, fontWeight = FontWeight.SemiBold)
            Text(
                item.command,
                color = ColorC8,
                fontFamily = FontFamily.Monospace,
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        is TimelineItem.Plan -> CardBlock {
            Text(item.title, color = CmaText, fontWeight = FontWeight.SemiBold)
            if (!item.summary.isNullOrBlank()) {
                Text(item.summary, color = Muted, modifier = Modifier.padding(top = 6.dp))
            }
            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                item.todos.forEach { t ->
                    val mark = when (t.status) {
                        "completed" -> "✓"
                        "in_progress" -> "…"
                        else -> "○"
                    }
                    Text("$mark ${t.text}", color = Muted)
                }
            }
        }
        is TimelineItem.Question -> CardBlock {
            Text(item.prompt, color = CmaText, fontWeight = FontWeight.SemiBold)
            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                item.options.forEach { o ->
                    Text("• ${o.label}", color = Muted)
                }
            }
        }
    }
}

private const val MESSAGE_PREVIEW_LINES = 6
private const val MESSAGE_PREVIEW_CHARS = 320

@Composable
private fun CollapsibleMessageBubble(id: String, text: String, user: Boolean) {
    var expanded by remember(id) { mutableStateOf(false) }
    val collapsible =
        text.length > MESSAGE_PREVIEW_CHARS ||
            text.lineSequence().take(MESSAGE_PREVIEW_LINES + 1).count() > MESSAGE_PREVIEW_LINES

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (user) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .clip(RoundedCornerShape(16.dp))
                .then(
                    if (user) Modifier.background(UserBubble)
                    else Modifier.background(Panel).border(1.dp, Border, RoundedCornerShape(16.dp)),
                )
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Text(
                text,
                color = CmaText,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                maxLines = if (!collapsible || expanded) Int.MAX_VALUE else MESSAGE_PREVIEW_LINES,
                overflow = TextOverflow.Ellipsis,
            )
            if (collapsible) {
                TextButton(
                    onClick = { expanded = !expanded },
                    modifier = Modifier.padding(top = 2.dp),
                ) {
                    Text(
                        if (expanded) "Show less" else "Show message",
                        color = Accent,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun CardBlock(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Panel, RoundedCornerShape(14.dp))
            .border(1.dp, Border, RoundedCornerShape(14.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        content()
    }
}

private val ColorC8 = androidx.compose.ui.graphics.Color(0xFFC8D1E0)
