import QtQuick
import QtQuick.Window
import Quickshell

ShellRoot {
    QtObject {
        id: service
        property bool keyConfigured: true
        property bool miniMode: false
        property bool docked: false
        property bool computerUsing: false
        property bool panelOpened: false
        property string accentColor: "#cacccc"
        property string userText: ""
        property string assistantText: ""
        property string state: "idle"
        property string taskStatus: ""
        property bool taskBusy: false
        property var approval: null
        property var question: null
        property string error: ""
        property real inputLevel: 0
        property real level: 0
        property real lipRound: 0
        property real lipWide: 0
        property bool listeningReady: false
        property bool companionVisible: false
        property var companionOpens: []
        property var companionCloses: []
        function companionVisibility(active) { companionVisible = active }
        function companionOpened(address) { companionOpens = companionOpens.concat([address]) }
        function companionClosed(address) { companionCloses = companionCloses.concat([address]) }
        function companionPanel(active, closing) {}
        function presentation(active) {}
        function stop() {}
        function closingCue() {}
        signal dismissRequested()
    }
    QtObject { id: shell; function serviceFor(name) { return service } }
    Overlay { id: overlay; shell: shell }
    property int phase: 0
    property bool failed: false
    function dimensions(width, height, label) {
        if (overlay.testWindow.width !== width || overlay.testWindow.height !== height) {
            failed = true
            console.error("OVERLAY_GEOMETRY_FAIL " + label + ": expected " + width + "x" + height + ", got " + overlay.testWindow.width + "x" + overlay.testWindow.height)
        }
    }
    function resize(width, height) {
        const nativeWindow = overlay.testWindow.contentItem.Window.window
        nativeWindow.width = width
        nativeWindow.height = height
    }
    Timer {
        interval: 80; repeat: true; running: true
        onTriggered: {
            try {
                switch (phase++) {
                case 0: overlay.open('{"silent":true}'); break
                case 1: resize(720, 680); service.docked = true; break
                case 2: resize(360, 1100); service.docked = false; break
                case 3: dimensions(720, 680, "undock live"); service.docked = true; break
                case 4: resize(360, 1100); service.docked = false; break
                case 5: dimensions(720, 680, "second undock"); service.docked = true; break
                case 6:
                    resize(360, 1100)
                    overlay.close()
                    phase = 60
                    break
                case 60:
                    dimensions(360, 1100, "normal visible shutdown after frame")
                    if (!overlay.closing || !overlay.testWindow.visible || !service.docked) throw Error("Shutdown must remain docked and visible")
                    if (service.companionVisible) throw Error("Shutdown must cancel automatic opens immediately")
                    overlay.open('{"silent":true}')
                    if (overlay.closing) throw Error("Reopening must cancel animation")
                    dimensions(360, 1100, "cancelled animation retains tile")
                    overlay.close()
                    phase = 61
                    break
                case 61:
                    dimensions(360, 1100, "second visible shutdown")
                    overlay.finishClose()
                    overlay.open('{"silent":true}')
                    if (overlay.opened) throw Error("Reopen must wait for hidden restoration")
                    service.docked = false
                    phase = 7
                    break
                case 7: dimensions(720, 680, "close docked/reopen"); service.computerUsing = true; break
                case 8:
                    overlay.companionEvent({name: "openwindow", data: "40,1,editor,title"})
                    overlay.companionEvent({name: "openwindow", data: '40";bad,1,editor,title'})
                    if (service.companionOpens.length) throw Error("Temporary hide must defer opens")
                    service.computerUsing = false
                    break
                case 9:
                    if (service.companionOpens.join(",") !== "0x40") throw Error("Temporary-hide open must replay when visible")
                    service.companionOpens = []
                    dimensions(720, 680, "temporary observation hide"); service.miniMode = true; break
                case 10: dimensions(160, 200, "mini"); service.docked = true; break
                case 11: resize(200, 1100); overlay.close(); phase = 110; break
                case 110:
                    dimensions(200, 1100, "mini visible shutdown after frame")
                    if (!overlay.closing || !overlay.testWindow.visible || !service.docked) throw Error("Mini shutdown must remain docked and visible")
                    overlay.finishClose(); service.docked = false; phase = 12; break
                case 12: overlay.open('{"silent":true}'); break
                case 13: dimensions(160, 200, "mini close docked/reopen"); service.miniMode = false; break
                case 14:
                    if (overlay.testWindow.width < 600 || overlay.testWindow.height > 800)
                        throw Error("Normal after mini retained tall tile geometry")
                    overlay.settingsMode = true
                    if (!service.companionVisible) throw Error("Settings must allow deterministic companion without voice")
                    overlay.companionEvent({name: "openwindow", data: "20,1,editor,untrusted title"})
                    overlay.companionEvent({name: "activewindowv2", data: "30"})
                    overlay.companionEvent({name: "openwindow", data: '20";bad,1,editor,title'})
                    if (service.companionOpens.join(",") !== "0x20") throw Error("Only openwindow with a strict address may trigger")
                    overlay.close()
                    if (overlay.opened || overlay.closing) throw Error("Settings close must hide immediately")
                    if (service.companionVisible) throw Error("Close must cancel automatic companion")
                    overlay.companionEvent({name: "openwindow", data: "30,1,editor,title"})
                    overlay.companionEvent({name: "closewindow", data: "20"})
                    if (service.companionOpens.length !== 1 || service.companionCloses.join(",") !== "0x20") throw Error("Hidden opens must not trigger; closes still cancel")
                    if (!failed) console.log("OVERLAY_GEOMETRY_PASS")
                    Qt.quit(); break
                }
            } catch (error) { console.error("OVERLAY_GEOMETRY_FAIL " + error); Qt.quit() }
        }
    }
}
