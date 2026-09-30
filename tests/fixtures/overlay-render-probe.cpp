// Test-only probe of the actual Quickshell backing window, not QML configuration.
#include <QQmlExtensionPlugin>
#include <qqml.h>
#include <QQuickWindow>
#include <QImage>
#include <QVariantMap>
class RenderProbe : public QObject {
    Q_OBJECT
public:
    Q_INVOKABLE QVariantMap capture(QObject *object, const QString &path) {
        auto *window = qobject_cast<QQuickWindow *>(object);
        if (!window) return {{"error", "No backing QQuickWindow"}};
        auto image = window->grabWindow();
        int outside = 0, face = 0;
        for (int y = 0; y < image.height(); ++y) {
            for (int x = 0; x < image.width(); ++x) {
                const int alpha = image.pixelColor(x, y).alpha();
                // The 124.8x160 face is centered in the 160x200 mini window.
                if (x < 17 || x >= 143 || y < 20 || y >= 180) outside += alpha != 0;
                else face += alpha > 128;
            }
        }
        if (!path.isEmpty()) image.save(path);
        return {{"alphaBits", window->format().alphaBufferSize()},
                {"width", image.width()}, {"height", image.height()},
                {"cornerAlpha", image.isNull() ? -1 : image.pixelColor(0, 0).alpha()},
                {"outsidePixels", outside}, {"facePixels", face}};
    }
};
class ProbePlugin : public QQmlExtensionPlugin {
    Q_OBJECT
    Q_PLUGIN_METADATA(IID QQmlExtensionInterface_iid)
public:
    void registerTypes(const char *uri) override { qmlRegisterType<RenderProbe>(uri, 1, 0, "RenderProbe"); }
};
#include "overlay-render-probe.moc"
