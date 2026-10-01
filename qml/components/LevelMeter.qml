import QtQuick

// Vertical segmented meter for a normalized audio level.
Column {
    id: root
    property string label: ""
    property real value: 0
    property int segments: 16
    property color accentColor: "#cacccc"
    property color labelColor: "#808080"
    readonly property int lit: Math.round(Math.min(1, Math.max(0, value)) * segments)
    spacing: 6
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        text: root.label; textFormat: Text.PlainText
        color: root.labelColor; font.pixelSize: 8; font.letterSpacing: 2
    }
    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: 3
        Repeater {
            model: root.segments
            Rectangle {
                required property int index
                readonly property int step: root.segments - 1 - index
                readonly property bool on: step < root.lit
                width: 10; height: 5
                color: root.accentColor
                opacity: !on ? .10 : step >= root.lit - 2 ? 1 : .55
            }
        }
    }
}
