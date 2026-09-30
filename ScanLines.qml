import QtQuick

// Static CRT scanlines, painted once per size change.
Canvas {
    renderStrategy: Canvas.Cooperative
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d")
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = "#000000"
        for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1)
    }
}
