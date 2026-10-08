pragma ComponentBehavior: Bound
import QtQuick
import "tasks.js" as Tasks

// History of background tasks and their status, newest first.
Rectangle {
    id: root
    property var tasks: []
    property real now: Date.now()
    property color accentColor: "#cacccc"
    property color textColor: "#a0a0a0"
    property color mutedColor: "#656565"
    property color surfaceColor: "#080808"
    signal closeRequested()
    readonly property int runningCount: tasks.filter(t => t.status === "running").length
    color: Qt.rgba(surfaceColor.r, surfaceColor.g, surfaceColor.b, .95)
    border.color: Qt.rgba(accentColor.r, accentColor.g, accentColor.b, .3)
    radius: 4

    Text {
        x: 10; y: 8
        text: "BACKGROUND TASKS · " + (root.runningCount ? root.runningCount + " RUNNING" : "IDLE")
        textFormat: Text.PlainText
        color: root.accentColor; font.pixelSize: 9; font.letterSpacing: 3
    }
    Text {
        objectName: "taskHistoryClose"
        anchors.right: parent.right; anchors.rightMargin: 10; y: 6
        text: "✕"; textFormat: Text.PlainText
        color: root.textColor; font.pixelSize: 11
        MouseArea { anchors.fill: parent; anchors.margins: -6; cursorShape: Qt.PointingHandCursor; onClicked: root.closeRequested() }
    }
    Text {
        visible: !root.tasks.length
        anchors.centerIn: parent
        text: "No background tasks yet"
        textFormat: Text.PlainText
        color: root.mutedColor; font.pixelSize: 10
    }
    ListView {
        objectName: "taskHistoryList"
        x: 10; y: 28; width: parent.width - 20; height: parent.height - 36
        clip: true
        spacing: 4
        model: root.tasks
        delegate: Item {
            id: row
            required property var modelData
            readonly property bool failed: modelData.status === "failed" || modelData.status === "blocked"
            width: ListView.view.width
            height: modelData.error ? 30 : 16
            Text {
                id: mark
                width: 14
                text: Tasks.glyph(row.modelData.status)
                textFormat: Text.PlainText
                color: row.failed ? "#d97a7a" : row.modelData.status === "running" ? root.accentColor : root.textColor
                font.pixelSize: 10
            }
            Text {
                id: meta
                x: 16; width: 92
                text: Tasks.clockTime(row.modelData.startedAt) + "  " + (row.modelData.source === "system" ? "SYS" : "OMA")
                textFormat: Text.PlainText
                color: root.mutedColor; font.pixelSize: 9; font.letterSpacing: 1
            }
            Text {
                x: 108; width: parent.width - 108 - 46
                text: row.modelData.label
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: root.textColor; font.pixelSize: 10
            }
            Text {
                anchors.right: parent.right; width: 44
                horizontalAlignment: Text.AlignRight
                text: Tasks.elapsed(row.modelData, root.now)
                textFormat: Text.PlainText
                color: root.mutedColor; font.pixelSize: 9
            }
            Text {
                visible: !!row.modelData.error
                x: 108; y: 14; width: parent.width - 108
                text: row.modelData.status + " · " + row.modelData.error
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: row.failed ? "#d97a7a" : root.mutedColor; font.pixelSize: 9
            }
        }
    }
}
