import QtQuick

// Window ground: the theme surface with a faint accent glow rising from the projector floor.
Rectangle {
    id: root
    property color tint: "#080808"
    property color accent: "#cacccc"
    color: Qt.rgba(tint.r, tint.g, tint.b, 1)
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0; color: "transparent" }
            GradientStop { position: .55; color: "transparent" }
            GradientStop { position: 1; color: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, .07) }
        }
    }
}
