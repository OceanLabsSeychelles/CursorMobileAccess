package com.cursormobileaccess.app.data

data class WindowInfo(
    val id: String,
    val title: String,
    val projectName: String,
)

data class TabInfo(
    val id: String,
    val title: String,
    val active: Boolean,
)

data class PlanTodo(
    val id: String,
    val text: String,
    val status: String,
)

data class QuestionOption(
    val id: String,
    val label: String,
)

sealed class TimelineItem {
    abstract val id: String

    data class User(override val id: String, val text: String) : TimelineItem()

    data class Assistant(
        override val id: String,
        val markdown: String,
    ) : TimelineItem()

    data class Thought(
        override val id: String,
        val summary: String?,
        val durationSec: Int?,
    ) : TimelineItem()

    data class Tool(
        override val id: String,
        val title: String,
        val detail: String?,
        val status: String,
    ) : TimelineItem()

    data class Command(
        override val id: String,
        val command: String,
        val description: String?,
    ) : TimelineItem()

    data class Plan(
        override val id: String,
        val title: String,
        val summary: String?,
        val todos: List<PlanTodo>,
    ) : TimelineItem()

    data class Question(
        override val id: String,
        val prompt: String,
        val options: List<QuestionOption>,
    ) : TimelineItem()
}

data class Action(
    val id: String,
    val kind: String,
    val label: String,
    val targetItemId: String? = null,
    val optionId: String? = null,
    val selected: Boolean? = null,
    val freeform: Boolean? = null,
)

data class SessionSnapshot(
    val cdp: Boolean = false,
    val windows: List<WindowInfo> = emptyList(),
    val activeWindowId: String? = null,
    val tabs: List<TabInfo> = emptyList(),
    val phase: String = "disconnected",
    val activityText: String? = null,
    val pendingPrompt: String? = null,
    val mode: String? = null,
    val model: String? = null,
    val timeline: List<TimelineItem> = emptyList(),
    val actions: List<Action> = emptyList(),
) {
    val projectName: String
        get() = windows.find { it.id == activeWindowId }?.projectName ?: "No window"

    val hasAnswerActions: Boolean
        get() = actions.any { it.kind == "answer" }
}

sealed class ServerMessage {
    data object AuthOk : ServerMessage()
    data class AuthError(val message: String) : ServerMessage()
    data class Snapshot(val state: SessionSnapshot) : ServerMessage()
    data class Patch(val patch: SessionSnapshot.() -> SessionSnapshot) : ServerMessage()
    data class CommandResult(val commandId: String, val ok: Boolean, val error: String?) : ServerMessage()
    data class Attention(val reason: String, val title: String, val body: String) : ServerMessage()
}

sealed class CommandPayload {
    data class SendMessage(val text: String) : CommandPayload()
    data class InvokeAction(val actionId: String) : CommandPayload()
    data class FillFreeform(val text: String) : CommandPayload()
    data class SelectTab(val tabId: String) : CommandPayload()
    data class AttachFiles(
        val files: List<AttachFile>,
        val text: String? = null,
        val submit: Boolean = true,
    ) : CommandPayload()
}

data class AttachFile(
    val name: String,
    val mime: String,
    val dataBase64: String,
)

enum class ConnState { Idle, Connecting, Live, Error }
