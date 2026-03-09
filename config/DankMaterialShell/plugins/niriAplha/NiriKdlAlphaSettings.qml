import QtQuick
import qs.Common
import qs.Modules.Plugins
import qs.Widgets

PluginSettings {
    id: root
    pluginId: "niriKdlAlpha"

    StyledText {
        width: parent.width
        text: "Niri KDL Alpha Patch"
        font.pixelSize: Theme.fontSizeLarge
        font.weight: Font.Bold
        color: Theme.surfaceText
    }

    StyledText {
        width: parent.width
        wrapMode: Text.WordWrap
        text: "Adds/replaces alpha for focus-ring, border and tab-indicator colors in ~/.config/niri/dms/colors.kdl whenever the wallpaper changes."
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.surfaceVariantText
    }

    // Separate alpha per section
    SliderSetting {
        settingKey: "alphaFocusRingPercent"
        label: "Focus ring transparency (alpha)"
        description: "0% = fully transparent, 100% = fully opaque."
        defaultValue: 33
        minimum: 0
        maximum: 100
        unit: "%"
    }

    SliderSetting {
        settingKey: "alphaBorderPercent"
        label: "Border transparency (alpha)"
        description: "0% = fully transparent, 100% = fully opaque."
        defaultValue: 33
        minimum: 0
        maximum: 100
        unit: "%"
    }

    SliderSetting {
        settingKey: "alphaTabIndicatorPercent"
        label: "Tab indicator transparency (alpha)"
        description: "0% = fully transparent, 100% = fully opaque."
        defaultValue: 33
        minimum: 0
        maximum: 100
        unit: "%"
    }

    StringSetting {
        settingKey: "colorsPath"
        label: "colors.kdl path"
        description: "Leave empty for default."
        placeholder: "/home/you/.config/niri/dms/colors.kdl"
        defaultValue: ""
    }
}

