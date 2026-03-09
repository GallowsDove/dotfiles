import QtQuick
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Services
import qs.Modules.Plugins

PluginComponent {
    id: root

    readonly property string defaultColorsPath: Quickshell.env("HOME") + "/.config/niri/dms/colors.kdl"

    // How long after startup / wallpaper change we keep re-patching if DMS overwrites us again
    readonly property int maxWaitMs: 8000

    // If file looks patched and nothing changes for this long, we can stop early
    readonly property int settleMs: 1200

    // Prevent rapid re-patching loops (e.g. partial writes)
    readonly property int minPatchIntervalMs: 200

    property double armedUntilMs: 0
    property bool patching: false
    property double lastPatchMs: 0

    function colorsPath() {
        const p = (pluginData.colorsPath ?? "").trim()
        return p.length ? p : defaultColorsPath
    }

    function nowMs() { return Date.now() }

    function armWindow() {
        armedUntilMs = nowMs() + maxWaitMs
        colorsFile.path = colorsPath()
        colorsFile.reload()
        settleTimer.restart()
    }

    function pctToByte(pct, fallbackPct) {
        const v = Math.max(0, Math.min(100, (pct ?? fallbackPct)))
        return Math.max(0, Math.min(255, Math.round(v * 255 / 100)))
    }

    function alphaHexFor(target) {
        let b = 255
        if (target === "focus-ring") b = pctToByte(pluginData.alphaFocusRingPercent, 33)
        else if (target === "border") b = pctToByte(pluginData.alphaBorderPercent, 33)
        else if (target === "tab-indicator") b = pctToByte(pluginData.alphaTabIndicatorPercent, 33)
        return b.toString(16).padStart(2, "0")
    }

    Timer {
        id: settleTimer
        repeat: false
        interval: root.settleMs
        onTriggered: {
            // If we’re past the arming window, stop caring.
            if (root.nowMs() > root.armedUntilMs) return

            // If file is already patched (no 6-hex targets) and it has been quiet for settleMs,
            // we can end the window early.
            const t = colorsFile.text()
            if (t && t.length > 10 && !root.hasUnpatchedTargets(t)) {
                root.armedUntilMs = 0
            }
        }
    }

    Connections {
        target: SessionData
        function onWallpaperPathChanged() {
            root.armWindow()
        }
    }

    Component.onCompleted: {
        // Start watching immediately on DMS startup and allow late writes.
        root.armWindow()
    }

    FileView {
        id: colorsFile
        path: root.colorsPath()
        watchChanges: true
        printErrors: true

        onFileChanged: {
            // any write resets settle timer
            settleTimer.restart()
            this.reload()
        }

        onLoaded: root.tryPatchFromText(this.text())

        onSaveFailed: (err) => {
            ToastService.showError("NiriKdlAlpha", "Failed to write colors.kdl")
        }
    }

    function hasUnpatchedTargets(text) {
        // Any 6-hex (no alpha) indicates DMS (re)generated unpatched colors.
        const re = new RegExp('(?:active-color|inactive-color|urgent-color)\\s+"#[0-9a-fA-F]{6}"')
        return re.test(text)
    }

    function patchText(text) {
        const lines = text.split(/\r?\n/)
        let depth = 0
        let inTarget = null
        let targetDepth = null
        let changed = false

        const enterRe = new RegExp('^\\s*(focus-ring|border|tab-indicator)\\s*\\{\\s*$')
        const colorRe = new RegExp('^(\\s*(?:active-color|inactive-color|urgent-color)\\s+)"(#[0-9a-fA-F]{6,8})"(\\s*)$')
        const sixHexRe = new RegExp('^#[0-9a-f]{6}$')
        const eightHexRe = new RegExp('^#[0-9a-f]{8}$')

        function addOrReplaceAlpha(hex, aa) {
            const h = String(hex).toLowerCase()
            if (sixHexRe.test(h)) return h + aa
            if (eightHexRe.test(h)) return h.slice(0, 7) + aa
            return hex
        }

        const out = []

        function countMatches(str, pattern) {
            const m = str.match(pattern)
            return m ? m.length : 0
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]

            const mEnter = line.match(enterRe)
            if (mEnter && inTarget === null) {
                inTarget = mEnter[1]
                targetDepth = depth + 1
                out.push(line)
                depth += countMatches(line, /\{/g)
                depth -= countMatches(line, /\}/g)
                continue
            }

            if (inTarget !== null && depth >= targetDepth) {
                const m = line.match(colorRe)
                if (m) {
                    const aa = alphaHexFor(inTarget)
                    const newHex = addOrReplaceAlpha(m[2], aa)
                    if (newHex !== m[2]) {
                        changed = true
                        line = `${m[1]}"${newHex}"${m[3]}`
                    }
                }
            }

            out.push(line)

            depth += countMatches(line, /\{/g)
            depth -= countMatches(line, /\}/g)

            if (inTarget !== null && depth < targetDepth) {
                inTarget = null
                targetDepth = null
            }
        }

        return { text: out.join("\n"), changed }
    }

    function tryPatchFromText(text) {
        if (!text || text.length < 10) return
        if (root.nowMs() > root.armedUntilMs && root.armedUntilMs !== 0) return
        if (root.armedUntilMs === 0) return
        if (root.patching) return

        // Rate limit patch attempts
        if (root.nowMs() - root.lastPatchMs < root.minPatchIntervalMs) return

        // Only patch when DMS overwrote us with unpatched colors.
        if (!hasUnpatchedTargets(text)) return

        const res = patchText(text)
        if (!res.changed) return

        root.patching = true
        root.lastPatchMs = root.nowMs()
        colorsFile.setText(res.text)
        root.patching = false
        // don’t disarm here — DMS may write again; settle timer will stop us when stable
    }
}

