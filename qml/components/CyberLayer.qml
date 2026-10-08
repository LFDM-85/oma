pragma ComponentBehavior: Bound
import QtQuick

// Ambient "security console" motion behind the panel content: hex streams
// down both edges, a scan beam sweeping the panel and HUD readouts in the
// corners. Everything runs only while the panel is shown, and speeds up
// while O.M.A. is working.
Item {
    id: root
    property bool active: true
    property bool busy: false
    property color accentColor: "#cacccc"
    property color labelColor: "#656565"
    // Live console: real events from the panel, newest last (see Conversation).
    property var feed: []
    readonly property color faint: Qt.rgba(accentColor.r, accentColor.g, accentColor.b, .16)
    property int tick: 0
    clip: true

    function hex(n) {
        let s = ""
        for (let i = 0; i < n; i++) s += "0123456789ABCDEF"[Math.floor(Math.random() * 16)]
        return s
    }

    Timer {
        interval: root.busy ? 90 : 220
        repeat: true
        running: root.active && root.visible
        onTriggered: root.tick++
    }

    // Hex streams in the side margins.
    Repeater {
        model: 2
        Column {
            id: stream
            required property int index
            readonly property bool rightSide: index === 1
            x: rightSide ? root.width - width - 4 : 4
            y: -height + ((root.tick * (root.busy ? 9 : 4) + index * 170) % (root.height + height))
            width: 34
            spacing: 2
            opacity: .55
            Repeater {
                model: 18
                Text {
                    required property int index
                    width: stream.width
                    horizontalAlignment: stream.rightSide ? Text.AlignRight : Text.AlignLeft
                    text: root.tick >= 0 ? root.hex(index % 5 === 0 ? 4 : 2) : ""
                    textFormat: Text.PlainText
                    color: index === 17 ? root.accentColor : root.faint
                    font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 8
                }
            }
        }
    }

    // Scan beam, top to bottom.
    Rectangle {
        id: beam
        width: root.width; height: 26
        gradient: Gradient {
            GradientStop { position: 0; color: "transparent" }
            GradientStop { position: .85; color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, root.busy ? .1 : .05) }
            GradientStop { position: 1; color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, root.busy ? .35 : .18) }
        }
        NumberAnimation on y {
            from: -beam.height; to: root.height
            duration: root.busy ? 2200 : 6500
            loops: Animation.Infinite
            running: root.active && root.visible
        }
    }

    // HUD readouts in the bottom corners, above the footer.
    component Readout: Text {
        textFormat: Text.PlainText
        color: root.labelColor
        font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 7; font.letterSpacing: 1
        opacity: .7
    }
    Column {
        objectName: "consoleFeed"
        x: 44; y: root.height * .5
        width: Math.min(190, root.width * .3)
        spacing: 1
        Repeater {
            model: root.feed.slice(-6)
            Text {
                id: line
                required property string modelData
                required property int index
                readonly property bool newest: index === Math.min(root.feed.length, 6) - 1
                width: parent.width
                elide: Text.ElideRight
                // The newest line types in, with a block cursor.
                text: newest ? modelData.slice(0, Math.min(modelData.length, typed)) + (root.tick % 2 ? "█" : " ") : modelData
                property int typed: 0
                NumberAnimation on typed { running: line.newest; from: 0; to: line.modelData.length; duration: Math.min(900, line.modelData.length * 25) }
                textFormat: Text.PlainText
                color: newest ? root.accentColor : root.labelColor
                opacity: .45 + .55 * (index + 1) / Math.min(root.feed.length, 6)
                font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 7
            }
        }
    }
    Readout {
        anchors.right: parent.right; anchors.rightMargin: 46; y: root.height * .52
        horizontalAlignment: Text.AlignRight
        text: "NODE ▸ OMARCHY\nLINK ▸ " + (root.tick % 8 < 4 ? "◉" : "○") + " SYNC\nHASH ▸ " + (root.tick >= 0 ? root.hex(8) : "")
    }
}
