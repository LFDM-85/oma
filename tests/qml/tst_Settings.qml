import QtQuick
import QtQuick.Controls
import QtTest
import "../.."
TestCase {
 visible: true; name: "Onboarding"; when: windowShown; width: 800; height: 900
 QtObject {
  id: fake
  property string voiceProvider: "pipeline"
  property bool providerChanging: false
  property bool localSetupBusy: false
  property string localSetupMessage: ""
  property int localSetupCalls: 0
  function localSetup(){localSetupCalls++}
  function setVoiceProvider(value){voiceProvider=value}
  property bool setupRequired: false; property string setupMessage: "Required components are missing"
  property int setupCalls: 0; function setup(){setupCalls++} function checkSetup(){}
  property bool modelReady: false; property bool speechReady: false; property bool keyConfigured: false
  property bool keySaving: false; property string keyError: ""; property string setupLaunchError: ""; property bool setupBusy: false
  property bool connectionTesting: false; property bool connectionTestPassed: false; property string connectionTestError: ""
  property bool wakeEnabled: false; function setWake(enabled){wakeEnabled=enabled}
  property string modelProvider: "fixture"; property string modelName: "model"
  property int modelSetupCalls: 0; function modelSetup(){modelSetupCalls++}
  property var responseLanguages: [{value:"",label:"System default (Japanese)"},{value:"en",label:"English"},{value:"ja",label:"Japanese"}]
  property string responseLanguage: ""
  property string languageError: ""
  function setResponseLanguage(value){responseLanguage=value}
  property var microphones: [{value:"",label:"System default"},{value:"camera",label:"Web camera"},{value:"yamaha",label:"Yamaha AG03MK2"}]
  property string microphoneTarget: ""
  property bool microphoneBusy: false
  property string microphoneError: ""
  function refreshMicrophones(){}
  function setMicrophone(value){microphoneTarget=value}
  property string savedKey: ""; function saveKey(key){savedKey=key} function testConnection(){}
 }
 Settings { id: settings; anchors.fill: parent; service: fake; opened: true }
 SignalSpy { id: dismissSpy; target: settings; signalName: "dismiss" }
 function init(){fake.voiceProvider="pipeline";settings.started=false;fake.setupRequired=false;fake.modelReady=false;fake.speechReady=false;fake.connectionTestPassed=false;fake.setupBusy=false}
 function test_welcome_then_only_missing_connection(){
  compare(settings.step,"welcome");verify(!findChild(settings,"setupButton").visible)
  findChild(settings,"beginSetupButton").clicked();compare(settings.step,"model")
  findChild(settings,"modelSetupButton").clicked();compare(fake.modelSetupCalls,1)
  fake.modelReady=true;compare(settings.step,"voice");verify(findChild(settings,"apiKeyInput").visible)
  fake.speechReady=true;compare(settings.step,"ready");verify(!findChild(settings,"startConversationButton").visible)
  fake.connectionTestPassed=true;verify(findChild(settings,"startConversationButton").visible)
 }
 function test_machine_setup_is_only_offered_when_missing(){settings.started=true;fake.setupRequired=true;compare(settings.step,"device");findChild(settings,"setupButton").clicked();compare(fake.setupCalls,1);compare(dismissSpy.count,0);fake.setupRequired=false;verify(!findChild(settings,"setupButton").visible)}
 function test_secret_cleared_on_close(){settings.started=true;fake.modelReady=true;const input=findChild(settings,"apiKeyInput");compare(input.echoMode,TextInput.Password);input.text="fictional";settings.opened=false;compare(input.text,"");settings.opened=true}
 function test_live_needs_only_one_connection(){fake.voiceProvider="gpt-live";settings.started=true;compare(settings.step,"voice");verify(findChild(settings,"apiKeyInput").visible);verify(!findChild(settings,"modelSetupButton").visible)}
 function test_local_selection_offers_setup_without_api_key(){
  fake.voiceProvider="gpt-live";settings.started=true
  const picker=findChild(settings,"providerSelect");verify(picker!==null)
  picker.value="local";picker.changed("local");compare(fake.voiceProvider,"local")
  verify(!findChild(settings,"apiKeyInput").visible)
  const setup=findChild(settings,"localSetupButton");verify(setup.visible)
  setup.clicked();compare(fake.localSetupCalls,1)
  fake.modelReady=true;fake.speechReady=true
  verify(!setup.visible);verify(findChild(settings,"microphoneSelect").visible);verify(findChild(settings,"languageSelect").visible)
  fake.voiceProvider="gpt-live";compare(picker.value,"gpt-live");verify(findChild(settings,"apiKeyInput").visible)
 }
 function test_wake_toggle_updates_service_and_preserves_binding(){
  settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.wakeEnabled=false
  const toggle=findChild(settings,"wakeToggle");verify(toggle!==null);compare(toggle.checked,false)
  toggle.clicked();compare(fake.wakeEnabled,true);compare(toggle.checked,true)
  fake.wakeEnabled=false;compare(toggle.checked,false)
 }
 function test_microphone_selection_is_saved_and_external_updates_keep_binding(){
  fake.voiceProvider="gpt-live";settings.started=true;fake.modelReady=true;fake.speechReady=true
  const picker=findChild(settings,"microphoneSelect");verify(picker!==null)
  compare(picker.options.length,3);compare(picker.value,"")
  picker.value="yamaha";picker.changed("yamaha");compare(fake.microphoneTarget,"yamaha");compare(picker.value,"yamaha")
  fake.microphoneTarget="camera";compare(picker.value,"camera")
  fake.microphoneBusy=true;compare(picker.enabled,false);fake.microphoneBusy=false
 }
 function test_saved_api_key_can_be_updated_from_ready_settings(){
  fake.voiceProvider="gpt-live";settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.keyConfigured=true
  const input=findChild(settings,"apiKeyInput"),save=findChild(settings,"saveApiKeyButton")
  verify(input.visible);verify(save!==null);compare(input.echoMode,TextInput.Password)
  input.text="fictional-key";save.clicked();compare(fake.savedKey,"fictional-key");compare(input.text,"")
 }
 function test_language_selection_preserves_binding(){
  fake.voiceProvider="gpt-live";settings.started=true;fake.modelReady=true;fake.speechReady=true
  const picker=findChild(settings,"languageSelect");verify(picker!==null);verify(picker.visible)
  compare(picker.value,"");picker.value="en";picker.changed("en");compare(fake.responseLanguage,"en")
  fake.responseLanguage="";compare(picker.value,"")
 }
 function test_layout(){fake.voiceProvider="gpt-live";settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.keyConfigured=true;wait(100);grabImage(settings).save("/tmp/oma-onboarding-wide.png");width=420;height=700;wait(100);grabImage(settings).save("/tmp/oma-onboarding-narrow.png");width=800;height=900}
}
