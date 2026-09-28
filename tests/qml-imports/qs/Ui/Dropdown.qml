// Contract fixture; native Dropdown rendering is verified in the running shell.
import QtQuick
import QtQuick.Controls
Item {
 id: root
 property string label: ""
 property string value: ""
 property var options: []
 property color foreground: "white"
 property color background: "black"
 property color accent: "white"
 signal changed(string value)
 implicitHeight: 68
 Column {
  width: parent.width; spacing: 6
  Text { text: root.label; textFormat: Text.PlainText; color: root.foreground }
  ComboBox {
   width: parent.width; model: root.options; textRole: "label"; valueRole: "value"
   currentIndex: { for(let i=0;i<root.options.length;i++)if(root.options[i].value===root.value)return i;return -1 }
   onActivated: {root.value=currentValue;root.changed(currentValue)}
  }
 }
}
