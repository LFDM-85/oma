import QtQuick
import QtQuick.Window
import Quickshell
import OmaRenderProbe 1.0

ShellRoot {
    QtObject {
        id: service
        property bool keyConfigured: true
        property string viewMode: "normal"
        readonly property bool miniMode: viewMode === "mini" && !approval && !question && !error
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
        property bool cameraActive: false
        property var backendStatus: ({pending: 0})
        property var microphones: []
        property string microphoneTarget: ""
        property string responseLanguage: "Japanese"
        property bool wakeEnabled: false
        property bool omarchySkillLoaded: true
        function setViewMode(mode) { viewMode = mode }
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
    RenderProbe { id: probe }
    property bool surfaceOnly: false
    property int phase: 0
    property var retainedWindow: null
    function capture(label, mini) {
        const nativeWindow = overlay.testWindow.contentItem.Window.window
        if (retainedWindow && retainedWindow !== nativeWindow) throw Error("Window recreated during mode switch")
        retainedWindow = nativeWindow
        const result = probe.capture(nativeWindow, Qt.resolvedUrl(label + ".png").toString().replace("file://", ""))
        console.log("OVERLAY_RENDER " + label + " " + JSON.stringify(result))
        if (result.alphaBits < 8) throw Error("Expected alpha-capable surface from first normal frame, got " + result.alphaBits)
        if (!result.width || !result.height) throw Error("Empty render capture")
        if (mini) {
            if (result.width !== 160 || result.height !== 200) throw Error("Mini geometry changed")
            if (result.outsidePixels !== 0) throw Error("Pixels outside face are opaque: " + result.outsidePixels)
            if (!surfaceOnly && result.facePixels < 1000) throw Error("Face missing from render")
        } else if (result.cornerAlpha !== 255) throw Error("Normal UI must remain opaque")
    }
    Timer {
        interval: 1600; repeat: true; running: true
        onTriggered: {
            try {
                switch (phase++) {
                case 0: overlay.open('{"silent":true}'); break
                case 1: capture("normal", false); service.viewMode = "mini"; break
                case 2: capture("mini", true); service.viewMode = "normal"; break
                case 3: capture("normal-restored", false); console.log("OVERLAY_RENDER_PASS"); Qt.quit(); break
                }
            } catch (error) { console.error("OVERLAY_RENDER_FAIL " + error); Qt.quit() }
        }
    }
}
