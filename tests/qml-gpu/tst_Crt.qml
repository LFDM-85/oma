import QtQuick
import QtTest
import "../../qml/components" as Oma
TestCase {
    id: tests
    name: "CrtGlass"
    when: windowShown
    visible: true
    width: 320; height: 320
    Rectangle {
        id: panel
        anchors.fill: parent; color: "white"
        layer.enabled: true
        layer.effect: Oma.CrtEffect {}
        Rectangle { anchors.centerIn: parent; width: 60; height: 60; color: "red" }
    }
    function test_glass_preserves_center_and_curves_edges_without_changing_layout() {
        wait(150)
        const image=grabImage(panel)
        verify(image.red(160,160)>220 && image.green(160,160)<10,"Center content remains intact")
        verify(image.red(2,2)<20,"The corner curves into the dark glass edge")
        verify(image.red(160,3)>150,"The middle of the top edge remains visible")
        compare(panel.width,320);compare(panel.height,320)
        image.save("/tmp/oma-crt-test.png")
    }
}
