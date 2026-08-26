package com.cursormobileaccess.app.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.addJsonObject

private val json = Json { ignoreUnknownKeys = true }

fun parseServerMessage(raw: String): ServerMessage? {
    val obj = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull() ?: return null
    return when (obj.str("type")) {
        "auth_ok" -> ServerMessage.AuthOk
        "auth_error" -> ServerMessage.AuthError(obj.str("message") ?: "Auth failed")
        "snapshot" -> {
            val state = obj.obj("state") ?: return null
            ServerMessage.Snapshot(parseSnapshot(state))
        }
        "patch" -> {
            val patch = obj.obj("patch") ?: return null
            ServerMessage.Patch { applyPatch(this, patch) }
        }
        "command_result" -> ServerMessage.CommandResult(
            commandId = obj.str("commandId") ?: "",
            ok = obj.bool("ok") ?: false,
            error = obj.str("error"),
        )
        "attention" -> ServerMessage.Attention(
            reason = obj.str("reason") ?: "",
            title = obj.str("title") ?: "Attention",
            body = obj.str("body") ?: "",
        )
        else -> null
    }
}

fun authFrame(token: String): String =
    buildJsonObject {
        put("type", "auth")
        put("token", token)
    }.toString()

fun commandFrame(commandId: String, payload: CommandPayload): String =
    buildJsonObject {
        put("type", "command")
        put("commandId", commandId)
        when (payload) {
            is CommandPayload.SendMessage -> {
                put("op", "send_message")
                put("text", payload.text)
            }
            is CommandPayload.InvokeAction -> {
                put("op", "invoke_action")
                put("actionId", payload.actionId)
            }
            is CommandPayload.FillFreeform -> {
                put("op", "fill_freeform")
                put("text", payload.text)
            }
            is CommandPayload.SelectTab -> {
                put("op", "select_tab")
                put("tabId", payload.tabId)
            }
            is CommandPayload.AttachFiles -> {
                put("op", "attach_files")
                put("submit", payload.submit)
                if (payload.text != null) put("text", payload.text)
                putJsonArray("files") {
                    for (f in payload.files) {
                        addJsonObject {
                            put("name", f.name)
                            put("mime", f.mime)
                            put("dataBase64", f.dataBase64)
                        }
                    }
                }
            }
        }
    }.toString()

fun normalizeWsUrl(input: String): String {
    val trimmed = input.trim().trimEnd('/')
    return when {
        trimmed.startsWith("ws://") || trimmed.startsWith("wss://") -> trimmed
        trimmed.startsWith("http://") -> "ws://" + trimmed.removePrefix("http://")
        trimmed.startsWith("https://") -> "wss://" + trimmed.removePrefix("https://")
        else -> "ws://$trimmed"
    }
}

private fun parseSnapshot(obj: JsonObject): SessionSnapshot =
    applyPatch(SessionSnapshot(), obj)

private fun applyPatch(base: SessionSnapshot, patch: JsonObject): SessionSnapshot {
    var next = base
    patch.obj("connection")?.bool("cdp")?.let { next = next.copy(cdp = it) }
    if ("windows" in patch) {
        next = next.copy(windows = patch.arr("windows").mapNotNull(::parseWindow))
    }
    if ("activeWindowId" in patch) {
        next = next.copy(activeWindowId = patch.str("activeWindowId"))
    }
    if ("tabs" in patch) {
        next = next.copy(tabs = patch.arr("tabs").mapNotNull(::parseTab))
    }
    patch.str("phase")?.let { next = next.copy(phase = it) }
    if ("activityText" in patch) next = next.copy(activityText = patch.str("activityText"))
    if ("pendingPrompt" in patch) next = next.copy(pendingPrompt = patch.str("pendingPrompt"))
    if ("mode" in patch) next = next.copy(mode = patch.str("mode"))
    if ("model" in patch) next = next.copy(model = patch.str("model"))
    if ("timeline" in patch) {
        next = next.copy(timeline = patch.arr("timeline").mapNotNull(::parseTimelineItem))
    }
    if ("actions" in patch) {
        next = next.copy(actions = patch.arr("actions").mapNotNull(::parseAction))
    }
    return next
}

private fun parseWindow(el: JsonElement): WindowInfo? {
    val o = el as? JsonObject ?: return null
    val id = o.str("id") ?: return null
    return WindowInfo(
        id = id,
        title = o.str("title") ?: id,
        projectName = o.str("projectName") ?: o.str("title") ?: id,
    )
}

private fun parseTab(el: JsonElement): TabInfo? {
    val o = el as? JsonObject ?: return null
    val id = o.str("id") ?: return null
    return TabInfo(
        id = id,
        title = o.str("title") ?: id,
        active = o.bool("active") ?: false,
    )
}

private fun parseAction(el: JsonElement): Action? {
    val o = el as? JsonObject ?: return null
    val id = o.str("id") ?: return null
    return Action(
        id = id,
        kind = o.str("kind") ?: "custom",
        label = o.str("label") ?: id,
        targetItemId = o.str("targetItemId"),
        optionId = o.str("optionId"),
        selected = o.bool("selected"),
        freeform = o.bool("freeform"),
    )
}

private fun parseTimelineItem(el: JsonElement): TimelineItem? {
    val o = el as? JsonObject ?: return null
    val id = o.str("id") ?: return null
    return when (o.str("kind")) {
        "user" -> TimelineItem.User(id, o.str("text") ?: "")
        "assistant" -> TimelineItem.Assistant(id, o.str("markdown") ?: "")
        "thought" -> TimelineItem.Thought(id, o.str("summary"), o.int("durationSec"))
        "tool" -> TimelineItem.Tool(
            id = id,
            title = o.str("title") ?: "Tool",
            detail = o.str("detail"),
            status = o.str("status") ?: "done",
        )
        "command" -> TimelineItem.Command(
            id = id,
            command = o.str("command") ?: "",
            description = o.str("description"),
        )
        "plan" -> TimelineItem.Plan(
            id = id,
            title = o.str("title") ?: "Plan",
            summary = o.str("summary"),
            todos = o.arr("todos").mapNotNull { t ->
                val to = t as? JsonObject ?: return@mapNotNull null
                PlanTodo(
                    id = to.str("id") ?: return@mapNotNull null,
                    text = to.str("text") ?: "",
                    status = to.str("status") ?: "pending",
                )
            },
        )
        "question" -> TimelineItem.Question(
            id = id,
            prompt = o.str("prompt") ?: "",
            options = o.arr("options").mapNotNull { opt ->
                val oo = opt as? JsonObject ?: return@mapNotNull null
                QuestionOption(
                    id = oo.str("id") ?: return@mapNotNull null,
                    label = oo.str("label") ?: "",
                )
            },
        )
        else -> null
    }
}

private fun JsonObject.str(key: String): String? {
    val el = this[key] ?: return null
    if (el is JsonNull) return null
    return (el as? JsonPrimitive)?.contentOrNull
}

private fun JsonObject.bool(key: String): Boolean? {
    val el = this[key] ?: return null
    if (el is JsonNull) return null
    val p = el as? JsonPrimitive ?: return null
    return p.content.toBooleanStrictOrNull() ?: p.content.toBoolean()
}

private fun JsonObject.int(key: String): Int? {
    val el = this[key] ?: return null
    if (el is JsonNull) return null
    return (el as? JsonPrimitive)?.intOrNull
}

private fun JsonObject.obj(key: String): JsonObject? =
    this[key] as? JsonObject

private fun JsonObject.arr(key: String): JsonArray =
    this[key] as? JsonArray ?: JsonArray(emptyList())
