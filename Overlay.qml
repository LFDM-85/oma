pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland

Item {
    id: root
    property var shell: null
    property var manifest: null
    property bool opened: false
    property bool closing: false
    property int startupSerial: 0
    property var service: null
    property var targetScreen: null
    readonly property bool docked: !!service && service.docked
    readonly property bool miniMode: !settingsMode && !!service && service.miniMode
    property bool settingsMode: false
    property bool pendingGreeting: false
    function greetOnOpen() {
        if (opened && !settingsMode && pendingGreeting && service && service.keyConfigured) {
            pendingGreeting = false
            // Prefer one-shot restart restoration greeting when context exists.
            service.restoreWelcome()
        }
    }
    onOpenedChanged: syncPresentation()
    onSettingsModeChanged: { if (settingsMode) pendingGreeting = false; syncPresentation() }
    function syncPresentation() { if (service) { service.panelOpened = opened && !closing; service.presentation(opened && !settingsMode && !closing) } }
    function resolveService() {
        service = shell ? shell.serviceFor("io.github.komagata.oma") : null
        if (service && !service.keyConfigured) { settingsMode = true }
        if (opened) {
            syncPresentation()
            greetOnOpen()
        }
    }
    function open(payloadJson) {
        const wasOpen = opened && !closing
        closeDelay.stop()
        closing = false
        let payload = ({})
        try { payload = JSON.parse(String(payloadJson || "{}").slice(0,16384)) || ({}) } catch (e) {}
        pendingGreeting = !wasOpen && payload.greet === true && payload.settings !== true
        settingsMode = payload.settings === true
        resolveService()
        const monitor = Hyprland.focusedMonitor
        targetScreen = Quickshell.screens.find(s => monitor && s.name === monitor.name) || Quickshell.screens[0]
        if (!wasOpen && service) { service.userText = ""; service.assistantText = "" }
        if (!wasOpen) startupSerial++
        opened = true
        if (!wasOpen && service && payload.silent !== true) service.opening()
        syncPresentation()
        greetOnOpen()
        Qt.callLater(function() { keyboardRoot.forceActiveFocus() })
    }
    function close() {
        if (!opened || closing) return
        pendingGreeting = false
        closing = true
        syncPresentation()
        if (service) { service.stop(); if (!settingsMode) service.closingCue() }
        if (settingsMode || !window.visible) finishClose()
        else closeDelay.restart()
    }
    function finishClose() {
        opened = false
        closing = false
    }
    Timer { id: closeDelay; interval: 1230; onTriggered: root.finishClose() }
    Connections {
        target: root.service
        function onDismissRequested() { root.close() }
        function onKeyConfiguredChanged() {
            if (root.opened && !root.service.keyConfigured) { root.settingsMode = true }
        }
    }
    Timer { interval: 500; repeat: true; running: root.opened && !root.service; onTriggered: root.resolveService() }
    OmaPalette { id: ink; accent: root.service ? root.service.accentColor : "#cacccc" }
    FloatingWindow {
        id: window
        screen: root.targetScreen
        visible: root.opened && !(root.service && root.service.computerUsing && !root.docked)
        title: root.miniMode ? "O.M.A. Mini" : "O.M.A."
        maximumSize: root.miniMode && !root.docked ? Qt.size(160, 200) : Qt.size(16777215, 16777215)
        minimumSize: root.docked ? Qt.size(root.miniMode ? 160 : 320, root.miniMode ? 200 : 540) : root.miniMode ? Qt.size(160, 200) : Qt.size(Math.min(600, screen ? screen.width - 48 : 600), Math.min(600, screen ? screen.height - 64 : 600))
        onVisibleChanged: { if (!visible && root.opened && !(root.service && root.service.computerUsing)) root.close() }
        // A regular application window, managed by the compositor.
        implicitWidth: root.miniMode ? 160 : Math.min(600, screen ? screen.width - 48 : 600)
        implicitHeight: root.miniMode ? 200 : Math.min(600, screen ? screen.height - 64 : 600)
        color: root.miniMode ? "transparent" : ink.surface
        Item {
            id: keyboardRoot
            Keys.onEscapePressed: root.close()
            anchors.fill: parent
            anchors.margins: root.miniMode ? 8 : 12
            Conversation {
                anchors.fill: parent; visible: !root.settingsMode
                service: root.service; opened: root.opened && visible
                startupSerial: root.startupSerial
                shuttingDown: root.closing
                onDismiss: root.close()
                onSettingsRequested: root.settingsMode = true
            }
            Settings {
                anchors.fill: parent; visible: root.settingsMode
                service: root.service; opened: root.opened && visible
                onDismiss: root.close()
                onBack: root.settingsMode = false
            }
        }
    }
}
