pragma ComponentBehavior: Bound
import QtQuick
import "../components"
import QtQuick.Controls
import qs.Ui as Ui
Item {
    id: root
    property var service: null
    property color accentColor: service && service.accentColor !== undefined ? service.accentColor : "#cacccc"
    property bool opened: false
    property bool started: false
    property bool needsSetup: service && service.setupRequired === true
    property bool modelReady: service && service.modelReady === true
    property bool speechReady: service && service.speechReady === true
    property bool ready: !needsSetup && modelReady && speechReady
    readonly property bool dobbyBackend: !!service && service.voiceProvider === "dobby"
    property bool busy: service && (service.setupBusy === true || service.keySaving === true || service.connectionTesting === true)
    property string step: !started && !ready ? "welcome" : needsSetup ? "device" : !modelReady || !speechReady ? "voice" : "ready"
    readonly property color primaryText: ink.mix("#ececec", ink.accent, .08)
    readonly property color secondaryText: ink.mix("#949494", ink.accent, .06)
    signal dismiss()
    signal back()
    onOpenedChanged: {
        keyInput.clear()
        if (opened) Qt.callLater(() => viewport.contentY = 0)
        if (opened && service) {
            if (service.checkSetup) service.checkSetup()
            if (service.refreshMicrophones) service.refreshMicrophones()
        }
    }
    Keys.onEscapePressed: dismiss()
    OmaPalette { id: ink; accent: root.accentColor }
    PanelBackdrop { tint: ink.surface; anchors.fill: parent }
    component Action: Ui.Button {
        focusable: true; bordered: true
        foreground: root.primaryText; accent: ink.accent
        opacity: enabled ? 1 : .35
    }
    component Copy: Text {
        width: parent.width; color: root.secondaryText; font.pixelSize: 13
        wrapMode: Text.Wrap; textFormat: Text.PlainText; lineHeight: 1.25
    }
    component Section: Column {
        property string title: ""
        width: parent.width; spacing: 12
        Text { text: parent.title; textFormat: Text.PlainText; color: root.primaryText; font.pixelSize: 14; font.weight: Font.Medium }
    }
    component Rule: Rectangle { width: parent.width; height: 1; color: ink.border; opacity: .4 }
    Flickable {
        id: viewport
        anchors.fill: parent; anchors.margins: root.width < 500 ? 12 : 28
        clip: true; contentHeight: content.height + 20
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
        Column {
            id: content
            width: Math.min(560, viewport.width - 8); anchors.horizontalCenter: parent.horizontalCenter
            spacing: 24
            Text { objectName: "setupHeading"; text: "Settings"; textFormat: Text.PlainText; color: root.primaryText; font.pixelSize: 26; font.weight: Font.DemiBold }
            Section {
                title: "AI Engine"
                Ui.Dropdown {
                    id: backendSelect
                    width: parent.width; label: "Backend Engine"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: [
                        {value: "antigravity", label: "Google Antigravity (Gemini 3.8 / Pro)"},
                        {value: "dobby", label: "Dobby (Local autonomous daemon)"},
                        {value: "gpt-live", label: "OpenAI GPT-Live"}
                    ]
                    value: root.service ? (root.service.backend || "antigravity") : "antigravity"
                    enabled: !root.busy && !!root.service
                    onChanged: value => {
                        if (root.service) root.service.setBackend(value)
                    }
                }
            }
            Section {
                title: "Antigravity Models & Reasoning"
                visible: !root.service || root.service.backend === "antigravity" || root.service.voiceProvider === "antigravity"
                Ui.Dropdown {
                    id: modelSelect
                    width: parent.width; label: "Active Model"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: [
                        {value: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Recomendado)"},
                        {value: "gemini-3.7-flash", label: "Gemini 3.7 Flash"},
                        {value: "gemini-3.6-flash", label: "Gemini 3.6 Flash"},
                        {value: "gemini-3.1-pro", label: "Gemini 3.1 Pro (Raciocínio profundo)"},
                        {value: "claude-opus-5-5", label: "Claude Opus 5.5"},
                        {value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5"},
                        {value: "gpt-oss-120b", label: "GPT-OSS 120B"}
                    ]
                    value: root.service ? (root.service.antigravityModel || "gemini-3.8-flash") : "gemini-3.8-flash"
                    enabled: !root.busy && !!root.service
                    onChanged: value => {
                        if (root.service) root.service.setAntigravityModel(value)
                    }
                }
                Ui.Dropdown {
                    id: effortSelect
                    width: parent.width; label: "Reasoning Effort"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: [
                        {value: "low", label: "Low (Rápido para voz - Recomendado)"},
                        {value: "medium", label: "Medium (Equilibrado)"},
                        {value: "high", label: "High (Raciocínio detalhado)"},
                        {value: "max", label: "Max (Máxima profundidade)"}
                    ]
                    value: root.service ? (root.service.antigravityEffort || "low") : "low"
                    enabled: !root.busy && !!root.service
                    onChanged: value => {
                        if (root.service) root.service.setAntigravityEffort(value)
                    }
                }
                Ui.Toggle {
                    width: parent.width; label: "Desktop Window Awareness"
                    foreground: root.primaryText; accent: ink.accent
                    checked: !root.service || root.service.desktopContextEnabled !== false
                    enabled: !root.busy && !!root.service
                    onClicked: if (root.service) root.service.setDesktopContextEnabled(!checked)
                }
                Copy {
                    text: "Permite à O.M.A. detetar a janela e aplicação ativas no Hyprland para contextualizar as respostas por voz."
                    font.pixelSize: 12
                }
            }
            Section {
                title: "Dobby connection"
                visible: !!root.service && root.service.backend === "dobby"
                Copy { text: root.service ? root.service.modelProvider + " · " + root.service.modelName : "" }
                Copy { text: "Uses Dobby’s existing connections and tools. Voice recognition and playback run locally with Voxtype and Piper." }
            }
            Section {
                title: "OpenAI API key"
                visible: !!root.service && root.service.backend === "gpt-live" && (root.step === "voice" || root.ready)
                Ui.TextField {
                    id: keyInput; objectName: "apiKeyInput"; width: parent.width; height: 44
                    enabled: !root.needsSetup && !root.busy
                    password: true; placeholderText: root.service && root.service.keyConfigured ? "*********" : "Paste your OpenAI API key"
                    foreground: root.primaryText; accent: ink.accent; selectByMouse: true
                    inputMethodHints: Qt.ImhHiddenText | Qt.ImhSensitiveData | Qt.ImhNoPredictiveText
                }
                Row {
                    spacing: 10
                    Action { objectName: "saveApiKeyButton"; text: root.service && root.service.keySaving ? "Saving…" : root.service && root.service.keyConfigured ? "Update key" : "Save key"; enabled: keyInput.enabled && keyInput.text.trim().length > 0; onClicked: { root.service.saveKey(keyInput.text); keyInput.clear() } }
                    Action { text: "Get a key ↗"; bordered: false; foreground: root.secondaryText; onClicked: Qt.openUrlExternally("https://platform.openai.com/api-keys") }
                }
            }
            Rule { visible: root.step === "voice" || root.ready }
            Section {
                title: "Audio"
                visible: root.step !== "welcome" && !root.needsSetup
                Ui.Dropdown {
                    id: microphoneSelect; objectName: "microphoneSelect"
                    width: parent.width; label: "Microphone"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: root.service ? root.service.microphones : []
                    value: root.service ? root.service.microphoneTarget : ""
                    enabled: !root.busy && !!root.service && !root.service.microphoneBusy && options.length > 0
                    onChanged: value => {
                        root.service.setMicrophone(value)
                        microphoneSelect.value = Qt.binding(() => root.service ? root.service.microphoneTarget : "")
                    }
                }
                Ui.Dropdown {
                    id: languageSelect; objectName: "languageSelect"
                    width: parent.width; label: "Spoken language"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: root.service ? root.service.responseLanguages : []
                    value: root.service ? root.service.responseLanguage : ""
                    enabled: !root.dobbyBackend && !root.busy && !!root.service && options.length > 0
                    onChanged: value => {
                        root.service.setResponseLanguage(value)
                        languageSelect.value = Qt.binding(() => root.service ? root.service.responseLanguage : "")
                    }
                }
                Ui.Dropdown {
                    id: ttsEngineSelect; objectName: "ttsEngineSelect"
                    width: parent.width; label: "Voice Synthesizer (TTS)"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: [
                        {value: "google", label: "Google Voice (Natural pt-PT) - Recomendado"},
                        {value: "piper", label: "Piper (Local offline)"}
                    ]
                    value: root.service ? (root.service.ttsEngine || "google") : "google"
                    enabled: !root.busy && !!root.service
                    onChanged: value => {
                        if (root.service) root.service.setTtsEngine(value)
                    }
                }
                Ui.Toggle { objectName: "voiceEffectsToggle"; width: parent.width; label: "Voice effects"; foreground: root.primaryText; accent: ink.accent; checked: !root.service || root.service.voiceEffectsEnabled !== false; enabled: !root.busy && !!root.service; onClicked: if (root.service) root.service.setVoiceEffects(!checked) }
                Copy { visible: text.length > 0; text: root.service ? root.service.languageError : ""; color: ink.accent }
                Row {
                    spacing: 10
                    Action { objectName: "testConnectionButton"; visible: root.ready; text: root.service && root.service.connectionTesting ? "Playing…" : "Test voice"; enabled: !root.busy; onClicked: if (root.service) root.service.testConnection() }
                    Action { text: "Refresh devices"; bordered: false; foreground: root.secondaryText; enabled: !root.busy && !!root.service && !root.service.microphoneBusy; onClicked: root.service.refreshMicrophones() }
                }
                Copy { visible: root.service && root.service.connectionTestPassed; text: "Voice test passed."; font.pixelSize: 12 }
                Copy { visible: text.length > 0; text: root.service ? root.service.microphoneError : ""; color: ink.accent }
            }
            Rule { visible: root.ready }
            Section {
                title: "Preferences"; visible: root.ready
                Ui.Toggle { objectName: "wakeToggle"; width: parent.width; label: "Wake on ‘Hey O.M.A.’"; foreground: root.primaryText; accent: ink.accent; checked: !!(root.service && root.service.wakeEnabled); enabled: root.ready; onClicked: if (root.service) root.service.setWake(!checked) }
            }
            Copy { visible: text.length > 0; color: ink.accent; text: root.service ? (root.service.setupLaunchError || root.service.keyError || root.service.connectionTestError || "") : "" }
            Row {
                spacing: 10
                Action { objectName: "startConversationButton"; visible: root.ready && root.service && root.service.connectionTestPassed === true; text: "Start talking"; onClicked: root.back() }
                Action { visible: root.ready; text: "Done"; bordered: false; onClicked: root.back() }
            }

        }
    }
}
