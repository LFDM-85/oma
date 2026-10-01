pragma ComponentBehavior: Bound
import QtQuick

// Projector floor: perspective grid, microphone ripples, the four-part state
// ring and the emitter. Each ring segment lights while that state is active.
Item {
    id: root
    property color accentColor: "#cacccc"
    property color labelColor: "#808080"
    property real horizonY: height * .4
    property real centerX: width / 2
    property real centerY: height * .7
    property real ringX: 150
    property real ringY: 32
    property real inputLevel: 0
    property real level: 0
    property bool listening: false
    property bool thinking: false
    property bool speaking: false
    property bool working: false
    readonly property var segments: [
        {name: "LISTEN", from: 202, to: 262, on: listening},
        {name: "THINK", from: 278, to: 338, on: thinking},
        {name: "SPEAK", from: 22, to: 82, on: speaking},
        {name: "WORK", from: 98, to: 158, on: working}
    ]
    Canvas {
        id: floor
        anchors.fill: parent
        renderStrategy: Canvas.Cooperative
        readonly property var watched: [root.accentColor, root.horizonY, root.centerX, root.centerY, root.ringX, root.ringY,
            Math.round(root.inputLevel * 20), Math.round(root.level * 20), root.listening, root.thinking, root.speaking, root.working]
        onWatchedChanged: requestPaint()
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            const ctx = getContext("2d"), a = root.accentColor
            const tone = (alpha) => Qt.rgba(a.r, a.g, a.b, alpha)
            ctx.clearRect(0, 0, width, height)
            const cx = root.centerX, hz = root.horizonY
            // Place the emitter at depth 2.85 so the grid converges on the horizon.
            const depthScale = (root.centerY - hz) * 2.85
            const project = (x, z) => [cx + x * depthScale * width / 650 / z, hz + depthScale / z]
            ctx.lineWidth = 1
            for (let i = -12; i <= 12; i++) {
                const p = project(i * .35, 1.05), q = project(i * .35, 9)
                ctx.strokeStyle = tone(Math.max(.03, .13 - Math.abs(i) * .008))
                ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
            }
            for (let z = 1.05; z < 9; z *= 1.16) {
                const p = project(-6, z), q = project(6, z)
                ctx.strokeStyle = tone(Math.min(.15, .04 + .1 / z))
                ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
            }
            const horizon = ctx.createLinearGradient(0, 0, width, 0)
            horizon.addColorStop(0, tone(0)); horizon.addColorStop(.5, tone(.45)); horizon.addColorStop(1, tone(0))
            ctx.strokeStyle = horizon
            ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(width, hz); ctx.stroke()
            function ellipse(rx, ry) { ctx.beginPath(); ctx.ellipse(cx - rx, root.centerY - ry, rx * 2, ry * 2) }
            const rx = root.ringX, ry = root.ringY
            // Microphone ripples widen and brighten with the input level.
            const mic = Math.min(1, root.inputLevel * 1.6)
            for (let i = 0; i < 3; i++) {
                ellipse(rx + 26 + i * 18 + mic * 8, ry + 6 + i * 4 + mic * 2)
                ctx.strokeStyle = tone((.10 - i * .025) + mic * (.45 - i * .12)); ctx.stroke()
            }
            ellipse(rx, ry); ctx.strokeStyle = tone(.12); ctx.stroke()
            for (const segment of root.segments) {
                ctx.beginPath()
                for (let k = 0; k <= 24; k++) {
                    const angle = (segment.from + (segment.to - segment.from) * k / 24) * Math.PI / 180
                    const x = cx + rx * Math.cos(angle), y = root.centerY + ry * Math.sin(angle)
                    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
                }
                ctx.lineWidth = segment.on ? 3.5 : 1.5
                ctx.strokeStyle = tone(segment.on ? .95 : .22); ctx.stroke()
            }
            ctx.lineWidth = 2; ellipse(rx * .36, ry * .38); ctx.strokeStyle = tone(.9); ctx.stroke()
            ellipse(rx * .24, ry * .24); ctx.fillStyle = tone(.3 + Math.min(1, root.level * 2.5) * .4); ctx.fill()
            ellipse(rx * .12, ry * .12); ctx.fillStyle = Qt.rgba(1, 1, 1, .75); ctx.fill()
        }
    }
    Repeater {
        model: root.segments
        Text {
            required property var modelData
            objectName: "stateSegment" + modelData.name
            readonly property real angle: (modelData.from + modelData.to) / 2 * Math.PI / 180
            x: root.centerX + (root.ringX + 30) * Math.cos(angle) - width / 2
            y: root.centerY + (root.ringY + 12) * Math.sin(angle) - height / 2
            text: modelData.name; textFormat: Text.PlainText
            font.pixelSize: 8; font.letterSpacing: 2
            color: modelData.on ? root.accentColor : root.labelColor
            opacity: modelData.on ? 1 : .6
        }
    }
}
