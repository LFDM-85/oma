pragma ComponentBehavior: Bound
import QtQuick

// Mini mode: data streaks behind the face while background work runs.
Item {
    id: root
    property bool active: false
    property color accentColor: "#cacccc"
    visible: active
    clip: true
    Repeater {
        model: 7
        Rectangle {
            id: streak
            required property int index
            readonly property bool forward: index % 2 === 0
            y: root.height * (.16 + index * .11)
            width: root.width * (.25 + (index * 37 % 30) / 100); height: 1
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "transparent" }
                GradientStop { position: streak.forward ? .8 : .2; color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, .6) }
                GradientStop { position: 1; color: "transparent" }
            }
            NumberAnimation on x {
                from: streak.forward ? -streak.width : root.width
                to: streak.forward ? root.width : -streak.width
                duration: 1300 + streak.index * 293 % 900
                loops: Animation.Infinite
                running: root.active
            }
        }
    }
}
