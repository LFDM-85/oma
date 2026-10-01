import QtQuick

// Projection cone from the emitter to the face. Brightness, width and the
// rising particles follow the assistant's output level.
Canvas {
    id: root
    property color accentColor: "#cacccc"
    property real level: 0
    property real phase: 0
    property real apexX: width / 2
    property real apexY: height
    property real topY: 0
    property real topHalfWidth: width * .26
    property real baseHalfWidth: 34
    readonly property real energy: Math.min(1, Math.max(0, level) * 2.5)
    onEnergyChanged: requestPaint()
    onPhaseChanged: requestPaint()
    onAccentColorChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    renderStrategy: Canvas.Cooperative
    function fraction(value) { return value - Math.floor(value) }
    onPaint: {
        const ctx = getContext("2d")
        ctx.clearRect(0, 0, width, height)
        const a = accentColor
        const strength = .28 + .72 * energy
        const spread = .78 + .22 * energy
        const top = topHalfWidth * spread, base = baseHalfWidth
        const tone = (alpha) => Qt.rgba(a.r, a.g, a.b, alpha)
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(apexX - top, topY); ctx.lineTo(apexX + top, topY)
        ctx.lineTo(apexX + base, apexY); ctx.lineTo(apexX - base, apexY)
        ctx.closePath()
        ctx.clip()
        const fill = ctx.createLinearGradient(0, apexY, 0, topY)
        fill.addColorStop(0, tone(.30 * strength))
        fill.addColorStop(.55, tone(.09 * strength))
        fill.addColorStop(1, tone(0))
        ctx.fillStyle = fill
        ctx.fillRect(apexX - top, topY, top * 2, apexY - topY)
        ctx.lineWidth = 1
        for (let x = apexX - top; x < apexX + top; x += 12) {
            ctx.strokeStyle = tone(.05 * strength)
            ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(apexX + (x - apexX) * base / top, apexY); ctx.stroke()
        }
        // Particles rise faster and brighter while O.M.A. is speaking.
        for (let i = 0; i < 28; i++) {
            const t = fraction(i * .618 + phase * (.08 + .05 * energy) * (1 + (i % 3) * .25))
            const y = apexY - 24 - t * (apexY - topY - 24)
            const half = base + (top - base) * (apexY - y) / (apexY - topY)
            const x = apexX + (fraction(i * .371) * 2 - 1) * half * .8
            const size = 1.5 + (i % 3) * .6
            ctx.fillStyle = tone((.2 + .6 * fraction(i * .7)) * (1 - t) * strength)
            ctx.fillRect(x, y, size, size)
        }
        ctx.restore()
    }
}
