import QtQuick
import QtTest
import "../.." as Oma
TestCase {
    id: tests
    name: "ConversationOpening"
    when: windowShown
    visible: true
    width: 712; height: 762
    QtObject {
        id: fixture
        property string viewMode: "normal"
        function setViewMode(mode) { viewMode=mode }
        property string state: "idle"
        property bool taskBusy: false
        property string userText: ""
        property string assistantText: ""
        property string error: ""
        property string taskStatus: ""
        property real inputLevel: 0
        property bool listeningReady: false
        property real level: 0
        property real lipRound: 0
        property real lipWide: 0
        property var approval: null
        property var question: null
    }
    Oma.Conversation { id: conversation; width: 600; height: 650; service: fixture }
    function test_mini_mode_only_shows_face_and_restores_transcripts() {
        fixture.userText="Hello"
        const face=findChild(conversation,"faceModeToggle")
        verify(face!==null)
        mouseDoubleClickSequence(face,face.width/2,face.height/2,Qt.LeftButton)
        compare(fixture.viewMode,"mini")
        compare(conversation.miniMode,true)
        compare(findChild(conversation,"userCaption").visible,false)
        compare(findChild(conversation,"assistantCaption").visible,false)
        compare(findChild(conversation,"settingsButton").visible,false)
        compare(findChild(conversation,"backgroundStatus0").visible,false)
        verify(findChild(conversation,"faceBackground").visible)
        conversation.width=144;conversation.height=184
        wait(1500)
        grabImage(conversation).save("/tmp/oma-mini.png")
        mouseDoubleClickSequence(face,face.width/2,face.height/2,Qt.LeftButton)
        compare(fixture.viewMode,"normal")
        fixture.viewMode="mini"
        fixture.approval={description:"Confirm"}
        compare(conversation.miniMode,false)
        fixture.approval=null
        fixture.viewMode="normal"
        conversation.width=600;conversation.height=650
        compare(findChild(conversation,"userCaption").visible,true)
        compare(fixture.userText,"Hello")
        fixture.userText=""
    }
    function test_shorter_window_preserves_face_size() {
        fixture.viewMode="normal"
        const face=findChild(conversation,"portrait")
        conversation.height=632
        const original=face.height
        conversation.height=576
        compare(face.height,original)
        compare(face.height,160)
        wait(50)
        compare(face.mapToItem(conversation,face.width/2,face.height/2).y,conversation.height/2)
        verify(Math.abs(face.mapToItem(conversation,face.width/2,face.height/2).x-conversation.width/2)<=0.5)
        conversation.height=900
        wait(50)
        compare(face.mapToItem(conversation,face.width/2,face.height/2).y,conversation.height/2)
        conversation.height=576
        fixture.viewMode="mini"
        compare(face.height,original)
        wait(50)
        compare(face.mapToItem(conversation,face.width/2,face.height/2).y,conversation.height/2)
        fixture.viewMode="normal"
        wait(1500)
        grabImage(conversation).save("/tmp/oma-preserved-face.png")
        conversation.height=650
    }
    function test_working_survives_silent_audio_and_speech() {
        fixture.listeningReady=true
        fixture.taskBusy=true
        compare(conversation.displayStatus,"WORKING")
        fixture.state="speaking"
        compare(conversation.displayStatus,"WORKING")
        fixture.state="idle"
        wait(900)
        compare(conversation.displayStatus,"WORKING")
        fixture.taskBusy=false
        tryCompare(conversation,"displayStatus","LISTENING",1200)
        fixture.listeningReady=false
    }
    function test_task_label_survives_audio_state_and_quick_completion() {
        const label=findChild(conversation,"taskStatusText")
        fixture.taskStatus="run_command"
        fixture.state="speaking"
        compare(label.text,"run_command")
        fixture.state="idle"
        fixture.taskStatus=""
        wait(100)
        compare(label.text,"run_command")
        wait(2000)
        compare(label.text,"")
    }
    function test_status_change_keeps_scroll_position() {
        conversation.opened=false
        conversation.phase=15
        conversation.displayStatus="LISTENING"
        const rows=[0,1,2].map(i=>findChild(conversation,"backgroundStatus"+i))
        const positions=rows.map(row=>row.x)
        for(const status of ["THINKING","TALKING","IDLE","LISTENING"]){
            conversation.displayStatus=status
            rows.forEach((row,i)=>compare(row.x,positions[i],"Status changes must preserve scroll position"))
        }
        conversation.statusScrollX=100
        conversation.scrollStatus(10.75)
        rows.forEach((row,i)=>compare(row.x,89.25+i*160))
        conversation.statusScrollX=-rows[0].width-321
        conversation.scrollStatus(10.75)
        rows.forEach((row,i)=>compare(row.x,rows[0].parent.width+i*160))
        conversation.opened=true
    }
    function test_speech_start_does_not_move_the_conversation() {
        fixture.state="idle";fixture.userText="";fixture.assistantText="";fixture.taskStatus="";fixture.level=0
        wait(50)
        const user=findChild(conversation,"userCaption"),wave=findChild(conversation,"assistantWaveform")
        function positions(){return {userY:user.mapToItem(conversation,0,0).y,waveY:wave.mapToItem(conversation,0,0).y}}
        const baseline=positions()
        fixture.state="speaking";fixture.level=0.4;fixture.assistantText="こんにちは。"
        wait(50)
        compare(JSON.stringify(positions()),JSON.stringify(baseline),"Starting speech must not reposition the user text or waveform")
        fixture.state="working";fixture.taskStatus="Checking your request…"
        wait(50)
        compare(JSON.stringify(positions()),JSON.stringify(baseline),"Task status must not move the conversation")
        fixture.state="speaking";fixture.taskStatus="";fixture.userText="こんにちは。"
        wait(50)
        compare(JSON.stringify(positions()),JSON.stringify(baseline),"Starting another reply must keep the same layout")
        fixture.state="idle";fixture.level=0;fixture.userText="";fixture.assistantText=""
    }
    function test_crt_keeps_text_and_controls_outside_the_effect() {
        const glass=findChild(conversation,"faceBackground")
        verify(glass!==null)
        compare(conversation.layer.enabled,false)
        for(const name of ["userCaption","assistantCaption","userLabel","backgroundStatus0","assistantWaveform","settingsButton"]) {
            let item=findChild(conversation,name)
            verify(item!==null)
            while(item){verify(item!==glass,name+" must not be distorted");item=item.parent}
        }
    }
    function test_talking_starts_immediately_and_survives_short_pauses() {
        fixture.state = "listening"
        wait(900)
        compare(conversation.displayStatus, "LISTENING")
        for (let i = 0; i < 4; i++) {
            fixture.state = "speaking"
            compare(conversation.displayStatus, "TALKING")
            wait(40)
            fixture.state = "listening"
            wait(150)
            compare(conversation.displayStatus, "TALKING")
        }
        wait(900)
        compare(conversation.displayStatus, "LISTENING")
        fixture.state = "working"
        wait(100)
        compare(conversation.displayStatus, "WORKING")
        wait(800)
        compare(conversation.displayStatus, "WORKING")
    }
    function test_you_label_ignores_mic_noise_and_stays_after_first_transcript() {
        const label=findChild(conversation,"userLabel")
        verify(label!==null,"User label must exist")
        fixture.userText=""
        fixture.inputLevel=0
        fixture.listeningReady=true
        label.hasAppeared=false
        compare(label.visible,false)
        wait(40)
        grabImage(conversation).save("/tmp/oma-you-hidden.png")
        fixture.inputLevel=0.3
        compare(label.visible,false,"Microphone levels alone do not confirm user speech")
        wait(40)
        grabImage(conversation).save("/tmp/oma-you-listening.png")
        fixture.userText="こんにちは、オーマ。"
        fixture.inputLevel=0
        compare(label.visible,true)
        wait(40)
        grabImage(conversation).save("/tmp/oma-you-text.png")
        fixture.userText=""
        compare(label.visible,true)
        fixture.listeningReady=false
    }

    function test_you_label_resets_for_each_new_conversation() {
        const label=findChild(conversation,"userLabel")
        fixture.userText="前の会話"
        compare(label.visible,true)
        fixture.userText=""
        conversation.startupSerial++
        compare(label.visible,false,"A fresh opening must not retain the old label")
        fixture.inputLevel=0.5
        compare(label.visible,false)
        fixture.userText="新しい会話"
        compare(label.visible,true)
        fixture.userText=""
        compare(label.visible,true)
    }
    function test_five_user_lines_are_visible() {
        fixture.userText = "１行目：今日は画面表示を確認しています。\n２行目：発言の冒頭も残したいです。\n３行目：途中の文章も表示します。\n４行目：この行も切れずに見えます。\n５行目：最後の行まで同時に表示します。"
        const caption = findChild(conversation, "userCaption")
        wait(100)
        compare(caption.visibleLines, 5)
        compare(caption.scrollOffset, 0)
        compare(caption.revealedText, fixture.userText)
        grabImage(conversation).save("/tmp/oma-five-line-preview.png")
    }
}
