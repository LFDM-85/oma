import QtQuick

// A neural network around the face: nodes on a loose shell, links between
// near neighbours and signals travelling along them. It fires faster while
// O.M.A. thinks or works, and the nodes swell with the voice level.
Canvas {
    id: root
    property bool active: true
    property bool thinking: false
    property real level: 0
    property color accentColor: "#cacccc"
    property real phase: 0
    property var nodes: []
    property var links: []
    property var pulses: []
    renderStrategy: Canvas.Cooperative

    function build() {
        const n = 26, out = [], cx = width / 2, cy = height / 2
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 + (i % 3) * .21
            const r = .62 + ((i * 7919) % 100) / 100 * .36
            out.push({x: cx + Math.cos(a) * r * width / 2, y: cy + Math.sin(a) * r * height / 2, seed: i * 1.7})
        }
        const l = []
        for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++) {
                const dx = out[i].x - out[j].x, dy = out[i].y - out[j].y
                if (Math.sqrt(dx * dx + dy * dy) < width * .24) l.push([i, j])
            }
        nodes = out
        links = l
        pulses = []
    }
    onWidthChanged: build()
    onHeightChanged: build()

    Timer {
        interval: root.thinking ? 33 : 80
        repeat: true
        running: root.active && root.visible && root.width > 0
        onTriggered: {
            root.phase += root.thinking ? .09 : .03
            const next = root.pulses.map(p => ({link: p.link, t: p.t + (root.thinking ? .07 : .03)})).filter(p => p.t < 1)
            if (root.links.length && Math.random() < (root.thinking ? .5 : .12)) next.push({link: Math.floor(Math.random() * root.links.length), t: 0})
            root.pulses = next
            root.requestPaint()
        }
    }

    onPaint: {
        const ctx = getContext("2d")
        ctx.reset()
        const c = accentColor
        for (const [i, j] of links) {
            const a = nodes[i], b = nodes[j]
            ctx.strokeStyle = Qt.rgba(c.r, c.g, c.b, .07 + .05 * Math.sin(phase + a.seed))
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
        for (const p of pulses) {
            const [i, j] = links[p.link] || [0, 0]
            const a = nodes[i], b = nodes[j]
            if (!a || !b) continue
            const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t
            ctx.fillStyle = Qt.rgba(c.r, c.g, c.b, .9 * (1 - p.t * .6))
            ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill()
        }
        for (const node of nodes) {
            const glow = .25 + .25 * Math.sin(phase * 2 + node.seed) + level * .5
            ctx.fillStyle = Qt.rgba(c.r, c.g, c.b, Math.min(.9, glow))
            ctx.beginPath(); ctx.arc(node.x, node.y, 1.2 + level * 2.2, 0, Math.PI * 2); ctx.fill()
        }
    }
}
