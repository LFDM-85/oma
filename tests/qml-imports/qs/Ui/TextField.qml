import QtQuick
import QtQuick.Controls as Controls
Controls.TextField {
 property bool password: false
 property color foreground: "white"
 property color accent: "green"
 echoMode: password ? TextInput.Password : TextInput.Normal
}
