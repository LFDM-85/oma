pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import qs.Ui as Ui

Item {
    id: root
    component Action: Ui.Button {
        focusable: true
        bordered: true
        foreground: ink.text
        accent: ink.accent
    }
    property var service: null
    property color accentColor: service && service.accentColor !== undefined ? service.accentColor : "#cacccc"
    OmaPalette { id: ink; accent: root.accentColor }
    readonly property bool miniMode: !!service && service.viewMode === "mini" && !service.approval && !service.question && !service.error
    property bool opened: true
    property int startupSerial: 0
    property bool shuttingDown: false
    property real phase: 0
    property var questionValues: ({})
    readonly property string status: service ? service.state : "starting"
    signal scrollStatus(real distance)
    property real statusScrollX: 0
    readonly property real statusRowOffset: 160
    onScrollStatus: function(distance) {
        statusScrollX -= distance
        if (statusScrollX + statusRowOffset * 2 + statusRows.itemAt(0).width < 0)
            statusScrollX = faceArea.width
    }
    signal dismiss()
    signal settingsRequested()
    function close() { dismiss() }
    focus: opened
    Keys.onEscapePressed: close()
    Timer { interval: 40; repeat: true; running: root.opened; onTriggered: { root.phase += .025; root.scrollStatus(10.75) } }
    readonly property string statusBaseText: root.service && root.service.taskBusy && !root.service.error && !root.service.approval ? "WORKING" : root.service && root.service.cameraActive ? "CAMERA" : root.service && root.service.listeningReady && root.status === "idle" ? "LISTENING" : root.status === "speaking" ? "TALKING" : root.status.toUpperCase()
    readonly property string taskText: service ? service.taskStatus : ""
    property string displayedTask: ""
    onTaskTextChanged: {
        if (taskText) { displayedTask = taskText; taskHold.restart() }
        else if (!taskHold.running) displayedTask = ""
    }
    Timer { id: taskHold; interval: 2000; onTriggered: if (!root.taskText) root.displayedTask = "" }
    property string displayStatus: ""
    Component.onCompleted: displayStatus = statusBaseText
    onStatusBaseTextChanged: {
        if (statusBaseText === "TALKING" || statusBaseText === "WORKING") {
            statusSettle.stop()
            displayStatus = statusBaseText
        } else statusSettle.restart()
    }
    onStartupSerialChanged: { userLabel.hasAppeared = false; taskHold.stop(); displayedTask = "" }
    onOpenedChanged: {
        if (opened) displayStatus = statusBaseText
        else statusSettle.stop()
    }
    Timer {
        id: statusSettle
        interval: 800
        onTriggered: root.displayStatus = root.statusBaseText
    }
    Item {
        id: settingsButton
        visible: !root.miniMode
        objectName: "settingsButton"
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        width: 32; height: 32; z: 20
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: "Settings"
        Accessible.onPressAction: root.settingsRequested()
        Keys.onReturnPressed: root.settingsRequested()
        Keys.onSpacePressed: root.settingsRequested()
        Text {
            anchors.centerIn: parent
            text: "\uf013"
            textFormat: Text.PlainText
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: 20
            color: settingsButton.activeFocus || settingsMouse.containsMouse ? ink.text : ink.secondary
        }
        MouseArea {
            id: settingsMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.settingsRequested()
        }
    }
    PanelBackdrop { visible: !root.miniMode; tint: ink.surface; anchors.fill: parent; anchors.margins: 0 }
            Item {
                id: bodyArea
                anchors.fill: parent
                clip: true

                Column {
                id: content
                width: parent.width - 24
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.leftMargin: root.miniMode ? 0 : 12
                anchors.rightMargin: root.miniMode ? 0 : 12
                // Center the face itself, independently of transcript and task heights.
                y: root.height / 2 - faceArea.y - faceArea.height / 2
                spacing: root.miniMode ? 0 : root.height < 720 ? 8 : 14
                clip: true
                Item {
                    width: parent.width
                    id: userBlock
                    visible: !root.miniMode
                    height: userTranscriptColumn.implicitHeight
                    Column {
                        id: userTranscriptColumn
                        objectName: "userTranscript"
                        width: parent.width
                        spacing: 8
                        // Keep the user block visible while listening/recording, even before text is finalized.
                        visible: root.service !== null
                        Item {
                            width: parent.width; height: userLabel.implicitHeight
                            Text {
                                id: userLabel
                                objectName: "userLabel"
                                property bool hasAppeared: false
                                // Mic levels include ambient noise; only a transcript confirms user speech.
                                readonly property bool hasInput: userCaption.text.trim().length > 0
                                onHasInputChanged: if (hasInput) hasAppeared = true
                                Component.onCompleted: if (hasInput) hasAppeared = true
                                visible: hasAppeared
                                width: parent.width; text: "YOU"; textFormat: Text.PlainText
                                color: ink.muted; font.pixelSize: 11; font.letterSpacing: 3
                                horizontalAlignment: Text.AlignHCenter
                            }
                        }
                        Item {
                            width: parent.width; height: 105
                            TypewriterText {
                                id: userCaption
                                cursorColor: root.accentColor
                                objectName: "userCaption"
                                color: ink.secondary
                                width: parent.width; height: Math.min(parent.height, lineHeight * 5)
                                text: root.service ? root.service.userText : ""
                                font.pixelSize: 14
                                animated: false
                                active: root.opened
                            }
                        }

                        // Keep user area order aligned with assistant area: label -> text -> waveform.
                        Item {
                            width: parent.width
                            height: 12
                            Row {
                                visible: !!root.service && root.service.inputLevel > 0.08
                                anchors.horizontalCenter: parent.horizontalCenter
                                spacing: 4
                                Repeater {
                                    model: 33
                                    Rectangle {
                                        required property int index
                                        width: 2
                                        anchors.verticalCenter: parent.verticalCenter
                                        color: ink.accent
                                        readonly property real meterLevel: root.service ? root.service.inputLevel : 0
                                        readonly property real scaledLevel: Math.min(1, meterLevel * 1.35 + 0.05)
                                        readonly property real pulse: 5 + 18 * Math.abs(Math.sin(index * 2.1 + root.phase * 12))
                                        height: 2 + scaledLevel * pulse
                                    }
                                }
                            }
                        }
                    }
                }
                Item {
                    id: faceArea
                    width: parent.width; height: root.miniMode ? bodyArea.height : 224
                    clip: true
                    Repeater {
                        id: statusRows
                        model: 3
                        Text {
                            id: statusRow
                            visible: !root.miniMode
                            required property int index
                            objectName: "backgroundStatus" + index
                            y: index * parent.height / 3
                            height: parent.height / 3
                            verticalAlignment: Text.AlignVCenter
                            // Share one left-edge origin so text widths cannot change the stagger.
                            x: root.statusScrollX + index * root.statusRowOffset
                            text: root.displayStatus
                            textFormat: Text.PlainText
                            font.pointSize: 60
                            font.bold: true
                            font.letterSpacing: 6
                            color: ink.accent
                            opacity: 0.18
                        }
                    }
                    Item {
                        id: faceBackground
                        z: 2
                        objectName: "faceBackground"
                        anchors.fill: parent
                        layer.enabled: root.opened && GraphicsInfo.api !== GraphicsInfo.Software
                        layer.smooth: true
                        layer.effect: CrtEffect {}
                        Glow { visible: !root.miniMode; accentColor: root.accentColor; anchors.centerIn: parent; width: Math.min(parent.width, parent.height*2.1); height: parent.height }
                        Face {
                            id: portrait
                            objectName: "portrait"
                            accentColor: root.accentColor
                            anchors.centerIn: parent
                            width: height*.78; height: 160
                            mouthOpen: root.service ? root.service.level : 0
                            lipRound: root.service ? root.service.lipRound : 0
                            lipWide: root.service ? root.service.lipWide : 0
                            startupSerial: root.startupSerial
                            shuttingDown: root.shuttingDown
                            status: root.status
                            active: root.opened
                        }
                        MouseArea {
                            objectName: "faceModeToggle"
                            anchors.fill: portrait
                            enabled: !!root.service && !root.service.approval && !root.service.question
                            onDoubleClicked: root.service.setViewMode(root.miniMode ? "normal" : "mini")
                        }
                    }
                    Item {
                        id: assistantWaveform
                        objectName: "assistantWaveform"
                        z: 1
                        visible: !root.miniMode && root.displayStatus === "TALKING" && !root.shuttingDown
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: portrait.y
                        width: parent.width
                        height: portrait.height
                        Repeater {
                            model: 101
                            Rectangle {
                                required property int index
                                readonly property real position: (index - 50) / 50
                                readonly property real distance: Math.abs(position)
                                readonly property real envelope: Math.exp(-Math.pow((distance - 0.30) / 0.22, 2))
                                readonly property real energy: Math.min(1, (root.service ? root.service.level : 0) * 2.5)
                                readonly property real ripple: 0.25 + 0.75 * Math.abs(Math.sin(index * 2.37 + root.phase * 15))
                                x: index * (assistantWaveform.width - width) / 100
                                anchors.verticalCenter: parent.verticalCenter
                                width: 2
                                height: 2 + (parent.height - 2) * envelope * energy * ripple
                                // Keep the facial features clear while the wings extend behind them.
                                opacity: Math.abs(x + width / 2 - parent.width / 2) < portrait.width * 0.42 ? 0 : 0.75
                                color: ink.accent
                            }
                        }
                    }
                }
                Item {
                    id: assistantCaptionArea
                    visible: !root.miniMode
                    width: parent.width; height: 105
                    TypewriterText {
                        id: assistantCaption
                        objectName: "assistantCaption"
                        font.pixelSize: 14
                        cursorColor: root.accentColor
                        color: ink.text
                        width: parent.width; height: Math.min(parent.height, lineHeight * 5)
                        text: root.service ? root.service.assistantText : ""
                        active: root.opened
                    }
                }
                Item {
                    visible: !root.miniMode
                    width: parent.width; height: 24
                    Text {
                        id: statusText
                        objectName: "taskStatusText"
                        anchors.fill: parent
                        visible: text.length > 0
                        text: root.service ? root.service.error || root.displayedTask : ""
                        textFormat: Text.PlainText
                        color: ink.text
                        font.pixelSize: 13
                        wrapMode: Text.Wrap
                        maximumLineCount: 2
                        elide: Text.ElideRight
                        horizontalAlignment: Text.AlignLeft
                    }
                }
                Action { visible: ["error","offline","unauthenticated"].indexOf(root.status)>=0; anchors.horizontalCenter: parent.horizontalCenter; text: "Retry"; onClicked: if(root.service)root.service.retry() }
                }
            }
            Rectangle {
                visible: root.service && (root.service.approval !== null || root.service.question !== null)
                anchors.centerIn: parent; width: Math.min(parent.width-60,700); height: requestColumn.implicitHeight+40; color: ink.surface; border.color: ink.muted
                MouseArea { anchors.fill: parent; onClicked: {} }
                Column {
                    id: requestColumn; anchors.centerIn: parent; width: parent.width-40; spacing: 16
                    Text { text: "O.M.A. NEEDS YOUR INPUT"; textFormat: Text.PlainText; color: ink.accent; font.pixelSize: 17 }
                    Text { width: parent.width; text: root.service ? (root.service.approval ? root.service.approval.description : root.service.question ? "Please answer the following questions." : "") : ""; textFormat: Text.PlainText; color: ink.text; wrapMode: Text.Wrap; maximumLineCount: 12; elide: Text.ElideRight }
                    Row { spacing: 15; visible: root.service && root.service.approval !== null
                        Action { text: "Allow once"; onClicked: root.service.approve(true) }
                        Action { text: "Deny"; onClicked: root.service.approve(false) }
                        Action { visible: root.service && root.service.voiceProvider === "pipeline"; text: "Speak answer"; onClicked: root.service.press() }
                    }
                    Repeater {
                        model: root.service && root.service.question ? root.service.question.questions : []
                        delegate: Column {
                            id: questionRow
                            required property var modelData
                            width: requestColumn.width; spacing: 8
                            Text { width: parent.width; text: questionRow.modelData.question; textFormat: Text.PlainText; color: ink.text; wrapMode: Text.Wrap }
                            Ui.TextField {
                                width: parent.width; placeholderText: "Your answer"
                                onTextChanged: { const values = root.questionValues; values[parent.modelData.id] = text; root.questionValues = values }
                            }
                        }
                    }
                    Action { visible: root.service && root.service.question !== null; text: "Submit answers"; onClicked: { root.service.answer(root.questionValues); root.questionValues = ({}) } }
                }
            }
            Item {
                id: footer
                visible: !root.miniMode
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                height: 32
                z: 10
                clip: true
            }
        }
