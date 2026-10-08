import QtQuick

// Window ground: the theme surface, slightly translucent so Hyprland's blur lets the
// current Omarchy wallpaper through, with a faint accent glow rising from the projector floor.
Rectangle {
    id: root
    property color tint: "#080808"
    property color accent: "#cacccc"
    property real surfaceOpacity: .86
    color: Qt.rgba(tint.r, tint.g, tint.b, surfaceOpacity)
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0; color: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, .05) }
            GradientStop { position: .18; color: "transparent" }
            GradientStop { position: .55; color: "transparent" }
            GradientStop { position: 1; color: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, .08) }
        }
    }
}
