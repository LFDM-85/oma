.pragma library
// Shared formatting for background tasks (see runtime/tasks.mjs).

function glyph(status) {
    return ({running: "⟳", done: "✓", ended: "✓", failed: "✕", blocked: "⊘", interrupted: "◌"})[status] || "·"
}

function elapsed(task, now) {
    const end = task.endedAt ? Date.parse(task.endedAt) : now
    const s = Math.max(0, Math.round((end - Date.parse(task.startedAt)) / 1000))
    return s < 60 ? s + "s" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")
}

function clockTime(iso) {
    const d = new Date(iso)
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")
}

// Running tasks, plus finished ones for a few seconds so the outcome is seen.
function visible(tasks, now) {
    return tasks.filter(t => t.status === "running" || (t.endedAt && now - Date.parse(t.endedAt) < 8000))
}
