pragma ComponentBehavior: Bound
import QtQuick
import "tasks.js" as Tasks

// Background work projected on both sides behind the face: O.M.A.'s own
// commands and package/update processes. A click opens the task history.
Item {
    id: root
    property var tasks: []
    property real now: Date.now()
    // Width kept clear in the middle for the face.
    property real gap: 180
    property color accentColor: "#cacccc"
    property color labelColor: "#808080"
    signal historyRequested()
    readonly property var shown: Tasks.visible(tasks, now).slice(0, 6)
    readonly property real cardWidth: Math.max(96, Math.min(190, (width - gap) / 2 - 6))
    visible: shown.length > 0

    Repeater {
        model: root.shown
        Rectangle {
            id: card
            required property var modelData
            required property int index
            readonly property bool running: modelData.status === "running"
            readonly property bool failed: modelData.status === "failed" || modelData.status === "blocked"
            x: index % 2 === 0 ? 0 : root.width - width
            y: Math.floor(index / 2) * (height + 6)
            width: root.cardWidth; height: 36
            radius: 3
            color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, .07)
            border.color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, running ? .5 : .2)
            opacity: running ? 1 : .6
            Text {
                x: 6; y: 4
                text: Tasks.glyph(card.modelData.status) + "  " + (card.modelData.source === "system" ? "SYSTEM" : "O.M.A.")
                textFormat: Text.PlainText
                color: card.failed ? "#d97a7a" : root.accentColor
                font.pixelSize: 8; font.letterSpacing: 2
            }
            Text {
                anchors.right: parent.right; anchors.rightMargin: 6; y: 4
                text: Tasks.elapsed(card.modelData, root.now)
                textFormat: Text.PlainText
                color: root.labelColor; font.pixelSize: 8; font.letterSpacing: 1
            }
            Text {
                x: 6; y: 16; width: parent.width - 12
                text: card.modelData.label
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: root.labelColor; font.pixelSize: 9
            }
            // Indeterminate sweep while the task runs.
            Item {
                visible: card.running
                x: 1; width: parent.width - 2; height: 1
                anchors.bottom: parent.bottom
                clip: true
                Rectangle {
                    id: sweep
                    width: parent.width * .3; height: 1
                    color: root.accentColor
                    NumberAnimation on x { from: -sweep.width; to: card.width; duration: 1300; loops: Animation.Infinite; running: card.running && root.visible }
                }
            }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.historyRequested() }
        }
    }
}
