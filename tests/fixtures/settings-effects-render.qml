import QtQuick
import "../../qml/views"
import QtQuick.Controls
ApplicationWindow {
 id: win; width: 800; height: 900; visible: true; color: "#101315"
 title: "O.M.A. Settings fixture"
 QtObject {
  id: fake
  property color accentColor: "#cacccc"
  property string setupMessage: ""; property bool setupRequired: false; property bool setupBusy: false
  property bool modelReady: true; property bool speechReady: true; property bool keyConfigured: true
  property bool keySaving: false; property string keyError: ""; property string setupLaunchError: ""
  property bool connectionTesting: false; property bool connectionTestPassed: false; property string connectionTestError: ""
  property bool wakeEnabled: false; property bool voiceEffectsEnabled: true
  property var microphones: [{value:"",label:"System default"}]; property string microphoneTarget: ""; property bool microphoneBusy: false; property string microphoneError: ""
  property var responseLanguages: [{value:"ja",label:"Japanese"}]; property string responseLanguage: "ja"; property string languageError: ""
  function checkSetup(){} function refreshMicrophones(){} function setVoiceEffects(enabled){voiceEffectsEnabled=enabled}
 }
 Settings { id: settings; anchors.fill: parent; service: fake; opened: true }
 property int phase: 0
 Timer { interval: 800; running: true; repeat: true; onTriggered: {
  const name=win.phase===0?"on":win.phase===1?"off":"off-narrow"
  settings.grabToImage(result=>{result.saveToFile(Qt.resolvedUrl("settings-effects-"+name+".png").toString().replace("file://",""));if(win.phase===0){fake.voiceEffectsEnabled=false;win.phase++}else if(win.phase===1){win.width=420;win.height=740;win.phase++}else Qt.quit()})
 } }
}
