pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Shapes

// Segmented targeting rings turning behind the face, faster while working.
Item {
    id: root
    property bool active: true
    property bool busy: false
    property color accentColor: "#cacccc"
    readonly property real r: Math.min(width, height) / 2

    component Ring: Shape {
        id: ring
        property real radius: 50
        property real lineWidth: 1
        property real alpha: .3
        property var dashes: [4, 6]
        property int period: 20000
        property bool clockwise: true
        anchors.centerIn: parent
        width: radius * 2; height: radius * 2
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, ring.alpha)
            strokeWidth: ring.lineWidth
            fillColor: "transparent"
            strokeStyle: ShapePath.DashLine
            dashPattern: ring.dashes
            PathAngleArc { centerX: ring.radius; centerY: ring.radius; radiusX: ring.radius - 1; radiusY: ring.radius - 1; startAngle: 0; sweepAngle: 360 }
        }
        RotationAnimation on rotation {
            from: ring.clockwise ? 0 : 360; to: ring.clockwise ? 360 : 0
            duration: root.busy ? ring.period / 3 : ring.period
            loops: Animation.Infinite
            running: root.active && root.visible
        }
    }

    Ring { radius: root.r; alpha: .22; dashes: [2, 5]; period: 40000 }
    Ring { radius: root.r * .86; lineWidth: 2; alpha: .3; dashes: [14, 10, 2, 10]; period: 26000; clockwise: false }
    Ring { radius: root.r * .72; alpha: .18; dashes: [30, 50]; period: 14000 }
}
