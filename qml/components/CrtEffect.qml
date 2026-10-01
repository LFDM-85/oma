import QtQuick

ShaderEffect {
    property var source
    property real curvature: 0.045
    fragmentShader: Qt.resolvedUrl("../../assets/crt.frag.qsb")
}
