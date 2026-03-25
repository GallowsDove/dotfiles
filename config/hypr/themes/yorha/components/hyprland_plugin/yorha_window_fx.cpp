#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <format>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include <drm_fourcc.h>
#include <hyprland/src/SharedDefs.hpp>
#include <hyprland/src/debug/log/Logger.hpp>
#include <hyprland/src/desktop/view/Window.hpp>
#include <hyprland/src/event/EventBus.hpp>
#include <hyprland/src/plugins/HookSystem.hpp>
#include <hyprland/src/plugins/PluginAPI.hpp>
#include <hyprland/src/render/OpenGL.hpp>
#include <hyprland/src/render/Renderer.hpp>
#include <hyprland/src/render/Texture.hpp>
#include <hyprland/src/render/pass/TexPassElement.hpp>
#include <hyprland/src/render/pass/TextureMatteElement.hpp>

using namespace Hyprutils::Math;

static constexpr auto PLUGIN_VERSION = "0.8.11";

static HANDLE                  g_pluginHandle      = nullptr;
static std::atomic<bool>       g_unloading         = false;
static Hyprlang::CConfigValue* g_cfgEnabled        = nullptr;
static Hyprlang::CConfigValue* g_cfgDurationMs     = nullptr;
static Hyprlang::CConfigValue* g_cfgEdgeAlpha      = nullptr;
static Hyprlang::CConfigValue* g_cfgDebugRawSnapshot = nullptr;
static Hyprlang::CConfigValue* g_cfgSnapshotDelayMs = nullptr;
static CHyprSignalListener*    g_openListener      = nullptr;
static CHyprSignalListener*    g_destroyListener   = nullptr;
static CHyprSignalListener*    g_tickListener      = nullptr;
static CFunctionHook*          g_renderWindowHook  = nullptr;

struct SYorhaOverlay {
    PHLWINDOWREF                                    m_window;
    std::optional<std::chrono::steady_clock::time_point> m_mappedAt;
    std::optional<std::chrono::steady_clock::time_point> m_startedAt;
    SP<IFramebuffer>                                m_matteFB;
    SP<IFramebuffer>                                m_croppedFB;
    SP<IFramebuffer>                                m_composedFB;
    int                                             m_lastWidth = 0;
    int                                             m_lastHeight = 0;
    int                                             m_lastStep = -1;
    float                                           m_savedAlpha = 1.f;
    bool                                            m_forcedWindowAlpha = false;
    bool                                            m_snapshotReady = false;
    bool                                            m_snapshotAttempted = false;
    int                                             m_snapshotAttempts = 0;
    bool                                            m_seenRender = false;
    bool                                            m_loggedFirstDraw = false;
    bool                                            m_warnedNoSnapshot = false;
};

static std::unordered_map<uintptr_t, SYorhaOverlay>* g_activeOverlays = nullptr;

static bool getConfigBool(Hyprlang::CConfigValue* value, bool fallback) {
    if (!value || !value->getDataStaticPtr())
        return fallback;

    return **reinterpret_cast<Hyprlang::INT* const*>(value->getDataStaticPtr()) != 0;
}

static float getConfigFloat(Hyprlang::CConfigValue* value, float fallback) {
    if (!value || !value->getDataStaticPtr())
        return fallback;

    return **reinterpret_cast<Hyprlang::FLOAT* const*>(value->getDataStaticPtr());
}

static uintptr_t windowKey(PHLWINDOW window) {
    return reinterpret_cast<uintptr_t>(window.get());
}

static void notify(const std::string& text, const float timeMs = 1800.f) {
    if (!g_pluginHandle || g_unloading.load())
        return;

    HyprlandAPI::addNotification(g_pluginHandle, text, CHyprColor{1.f, 0.92f, 0.72f, 1.f}, timeMs);
}

static float overlayProgress(const SYorhaOverlay& overlay) {
    if (!overlay.m_startedAt.has_value())
        return 0.f;

    const auto durationMs = std::max(1.f, getConfigFloat(g_cfgDurationMs, 420.f));
    return std::clamp(
        std::chrono::duration<float, std::milli>(std::chrono::steady_clock::now() - *overlay.m_startedAt).count() / durationMs,
        0.f,
        1.f
    );
}

static float msSince(const std::optional<std::chrono::steady_clock::time_point>& point) {
    if (!point.has_value())
        return 0.f;

    return std::chrono::duration<float, std::milli>(std::chrono::steady_clock::now() - *point).count();
}

static int quantizedStep(float progress) {
    return static_cast<int>(std::round(progress * 24.f));
}

static void restoreWindowAlpha(SYorhaOverlay& overlay) {
    const auto window = overlay.m_window.lock();
    if (!window || !overlay.m_forcedWindowAlpha || !window->m_alpha)
        return;

    window->m_alpha->setValueAndWarp(overlay.m_savedAlpha);
    overlay.m_forcedWindowAlpha = false;
}

static CBox monitorLocalWindowBox(PHLWINDOW window, PHLMONITOR monitor) {
    auto box = window->getWindowMainSurfaceBox();
    box.translate(-monitor->m_position);
    box.scale(monitor->m_scale);
    box.round();
    return box;
}

static void rebuildMatte(SYorhaOverlay& overlay, const CBox& scaledWindowBox, float progress) {
    const auto window = overlay.m_window.lock();
    const auto monitor = window ? window->m_monitor.lock() : nullptr;
    if (!monitor)
        return;

    const int  width  = std::max(1, static_cast<int>(std::round(monitor->m_transformedSize.x)));
    const int  height = std::max(1, static_cast<int>(std::round(monitor->m_transformedSize.y)));
    const auto step   = quantizedStep(progress);

    if (overlay.m_lastWidth == width && overlay.m_lastHeight == height && overlay.m_lastStep == step && overlay.m_matteFB && overlay.m_matteFB->isAllocated())
        return;

    overlay.m_lastWidth  = width;
    overlay.m_lastHeight = height;
    overlay.m_lastStep   = step;

    if (!overlay.m_matteFB)
        overlay.m_matteFB = g_pHyprRenderer->createFB("yorha-window-fx-matte");

    if (!overlay.m_matteFB || !overlay.m_matteFB->alloc(width, height, DRM_FORMAT_ARGB8888))
        return;

    const auto matteTexture = overlay.m_matteFB->getTexture();
    if (!matteTexture)
        return;

    std::vector<unsigned char> pixels(static_cast<size_t>(width) * static_cast<size_t>(height) * 4, 0);

    const float centerX = static_cast<float>(scaledWindowBox.x + scaledWindowBox.w * 0.5);
    const float centerY = static_cast<float>(scaledWindowBox.y + scaledWindowBox.h * 0.5);
    const float halfW   = static_cast<float>(scaledWindowBox.w * 0.5);
    const float halfH   = static_cast<float>(scaledWindowBox.h * 0.5);
    const float maxDist = std::sqrt(halfW * halfW + halfH * halfH);
    const float radius  = maxDist * progress;
    const float edgePx  = std::max(6.f, std::min(30.f, std::min(halfW, halfH) * 0.2f));
    const float edgeAlpha = std::clamp(getConfigFloat(g_cfgEdgeAlpha, 0.18f), 0.f, 1.f);
    const float solidRadius = std::max(0.f, radius - edgePx);

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const float dx = (static_cast<float>(x) + 0.5f) - centerX;
            const float dy = (static_cast<float>(y) + 0.5f) - centerY;
            const float dist = std::sqrt(dx * dx + dy * dy);

            float alpha = 0.f;
            if (dist <= solidRadius) {
                alpha = 1.f;
            } else if (dist <= radius) {
                const float t = (dist - solidRadius) / std::max(0.0001f, edgePx);
                alpha = std::clamp(1.f - t * (1.f - edgeAlpha), 0.f, 1.f);
            }

            const size_t idx = (static_cast<size_t>(y) * static_cast<size_t>(width) + static_cast<size_t>(x)) * 4;
            pixels[idx + 0] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = static_cast<unsigned char>(std::round(alpha * 255.f));
        }
    }

    CRegion damage = CBox(0, 0, width, height);
    matteTexture->update(DRM_FORMAT_ARGB8888, pixels.data(), width * 4, damage);
}

static void rebuildComposedSnapshot(SYorhaOverlay& overlay) {
    const auto window = overlay.m_window.lock();
    if (!window || !window->m_snapshotFB || !window->m_snapshotFB->getTexture())
        return;

    const auto monitor = window->m_monitor.lock();
    if (!monitor || !overlay.m_matteFB || !overlay.m_matteFB->isAllocated())
        return;

    const auto windowBox = monitorLocalWindowBox(window, monitor);
    const int  width     = std::max(1, static_cast<int>(std::round(monitor->m_pixelSize.x)));
    const int  height    = std::max(1, static_cast<int>(std::round(monitor->m_pixelSize.y)));

    if (!overlay.m_croppedFB)
        overlay.m_croppedFB = g_pHyprRenderer->createFB("yorha-window-fx-cropped");

    if (!overlay.m_composedFB)
        overlay.m_composedFB = g_pHyprRenderer->createFB("yorha-window-fx-composed");

    if (!overlay.m_croppedFB || !overlay.m_croppedFB->alloc(width, height, DRM_FORMAT_ABGR8888))
        return;

    if (!overlay.m_composedFB || !overlay.m_composedFB->alloc(width, height, DRM_FORMAT_ABGR8888))
        return;

    CRegion damage = CBox(0, 0, width, height);
    if (!g_pHyprRenderer->beginFullFakeRender(monitor, damage, overlay.m_croppedFB))
        return;

    g_pHyprOpenGL->clear(CHyprColor{0.f, 0.f, 0.f, 0.f});
    const auto uvTopLeft = Vector2D{
        static_cast<double>(windowBox.x) / monitor->m_pixelSize.x,
        1.0 - static_cast<double>(windowBox.y + windowBox.h) / monitor->m_pixelSize.y,
    };
    const auto uvBottomRight = Vector2D{
        static_cast<double>(windowBox.x + windowBox.w) / monitor->m_pixelSize.x,
        1.0 - static_cast<double>(windowBox.y) / monitor->m_pixelSize.y,
    };

    g_pHyprOpenGL->renderTexture(
        window->m_snapshotFB->getTexture(),
        windowBox,
        CHyprOpenGLImpl::STextureRenderData{
            .damage = &damage,
            .a = 1.f,
            .allowCustomUV = true,
            .primarySurfaceUVTopLeft = uvTopLeft,
            .primarySurfaceUVBottomRight = uvBottomRight,
        }
    );
    g_pHyprRenderer->endRender();

    if (!g_pHyprRenderer->beginFullFakeRender(monitor, damage, overlay.m_composedFB))
        return;

    g_pHyprOpenGL->clear(CHyprColor{0.f, 0.f, 0.f, 0.f});
    g_pHyprOpenGL->renderTextureMatte(overlay.m_croppedFB->getTexture(), CBox(0, 0, monitor->m_transformedSize.x, monitor->m_transformedSize.y), overlay.m_matteFB);
    g_pHyprRenderer->endRender();
}

static void attachOverlay(PHLWINDOW window) {
    if (!window || !getConfigBool(g_cfgEnabled, true) || g_unloading.load() || !g_activeOverlays)
        return;

    const auto key = windowKey(window);
    if (g_activeOverlays->contains(key))
        return;

    g_activeOverlays->emplace(key, SYorhaOverlay{
        .m_window = window,
        .m_mappedAt = std::nullopt,
        .m_startedAt = std::nullopt,
        .m_matteFB = nullptr,
        .m_croppedFB = nullptr,
        .m_composedFB = nullptr,
    });
    Log::logger->log(Log::INFO, "[yorha-window-fx] attached overlay for window {:x}", key);
    notify(std::format("yorha fx attach {:x}", key), 1200.f);
}

static void removeOverlayForWindow(PHLWINDOW window) {
    if (!window || !g_activeOverlays)
        return;

    auto it = g_activeOverlays->find(windowKey(window));
    if (it != g_activeOverlays->end()) {
        restoreWindowAlpha(it->second);
        g_activeOverlays->erase(it);
    }
}

static void cleanupFinishedOverlays() {
    if (!g_activeOverlays || g_unloading.load())
        return;

    std::vector<uintptr_t> toRemove;

    for (auto& [key, overlay] : *g_activeOverlays) {
        const auto window = overlay.m_window.lock();
        if (!window) {
            toRemove.push_back(key);
            continue;
        }

        if (!valid(window) || overlayProgress(overlay) >= 1.f) {
            restoreWindowAlpha(overlay);
            toRemove.push_back(key);
            continue;
        }

        if (!overlay.m_snapshotReady && overlay.m_seenRender) {
            const auto snapshotDelayMs = std::max(0.f, getConfigFloat(g_cfgSnapshotDelayMs, 45.f));
            if (!overlay.m_mappedAt.has_value())
                overlay.m_mappedAt = std::chrono::steady_clock::now();

            if (msSince(overlay.m_mappedAt) >= snapshotDelayMs && g_pHyprRenderer) {
                g_pHyprRenderer->makeSnapshot(window);
                overlay.m_snapshotAttempted = true;
                overlay.m_snapshotAttempts++;
                overlay.m_snapshotReady = window->m_snapshotFB && window->m_snapshotFB->isAllocated() && window->m_snapshotFB->getTexture();

                if (overlay.m_snapshotReady && !overlay.m_startedAt.has_value()) {
                    overlay.m_startedAt = std::chrono::steady_clock::now();

                    if (window->m_alpha) {
                        overlay.m_savedAlpha = window->m_alpha->goal();
                        window->m_alpha->setValueAndWarp(0.f);
                        overlay.m_forcedWindowAlpha = true;
                    }
                } else if (!overlay.m_snapshotReady && !overlay.m_warnedNoSnapshot) {
                    Log::logger->log(Log::WARN, "[yorha-window-fx] snapshot not ready yet for {:x}", windowKey(window));
                    overlay.m_warnedNoSnapshot = true;
                }
            }
        }

        if (validMapped(window) && g_pHyprRenderer)
            g_pHyprRenderer->damageBox(window->getWindowMainSurfaceBox());

        if (overlay.m_snapshotReady && overlay.m_startedAt.has_value()) {
            const auto progress = overlayProgress(overlay);
            if (progress < 1.f) {
                rebuildMatte(overlay, monitorLocalWindowBox(window, window->m_monitor.lock()), progress);
                rebuildComposedSnapshot(overlay);
            }
        }
    }

    for (const auto key : toRemove)
        g_activeOverlays->erase(key);
}

using SRenderWindowFn = void (*)(IHyprRenderer*, PHLWINDOW, PHLMONITOR, const Time::steady_tp&, bool, eRenderPassMode, bool, bool);

static void onRenderWindow(IHyprRenderer* self, PHLWINDOW window, PHLMONITOR monitor, const Time::steady_tp& now, bool decorate, eRenderPassMode passMode, bool ignorePosition,
                           bool standalone) {
    const auto original = reinterpret_cast<SRenderWindowFn>(g_renderWindowHook->m_original);
    original(self, window, monitor, now, decorate, passMode, ignorePosition, standalone);

    if (g_unloading.load() || !g_activeOverlays || !window || !monitor || passMode != RENDER_PASS_MAIN)
        return;

    const auto it = g_activeOverlays->find(windowKey(window));
    if (it == g_activeOverlays->end())
        return;

    auto& overlay = it->second;
    if (!validMapped(window))
        return;

    overlay.m_seenRender = true;

    if (!overlay.m_mappedAt.has_value())
        overlay.m_mappedAt = std::chrono::steady_clock::now();

    if (!overlay.m_snapshotReady || !window->m_snapshotFB || !window->m_snapshotFB->getTexture())
        return;

    const auto progress = overlayProgress(overlay);
    if (progress >= 1.f)
        return;

    if (getConfigBool(g_cfgDebugRawSnapshot, false)) {
        CTexPassElement::SRenderData debugData;
        debugData.tex = window->m_snapshotFB->getTexture();
        debugData.box = monitorLocalWindowBox(window, monitor);
        debugData.a = 1.f;
        debugData.damage = CRegion{debugData.box};
        debugData.flipEndFrame = true;
        g_pHyprRenderer->m_renderPass.add(makeUnique<CTexPassElement>(std::move(debugData)));

        if (!overlay.m_loggedFirstDraw) {
            notify(std::format("yorha fx raw {:x}", windowKey(window)), 1200.f);
            overlay.m_loggedFirstDraw = true;
        }
        return;
    }

    if (!overlay.m_composedFB || !overlay.m_composedFB->isAllocated() || !overlay.m_composedFB->getTexture())
        return;

    CTexPassElement::SRenderData data;
    data.tex = overlay.m_composedFB->getTexture();
    data.box = CBox(0, 0, monitor->m_transformedSize.x, monitor->m_transformedSize.y);
    data.a = 1.f;
    data.damage = CRegion{0, 0, monitor->m_transformedSize.x, monitor->m_transformedSize.y};
    data.flipEndFrame = true;
    g_pHyprRenderer->m_renderPass.add(makeUnique<CTexPassElement>(std::move(data)));

    if (!overlay.m_loggedFirstDraw) {
        notify(std::format("yorha fx draw {:x}", windowKey(window)), 1200.f);
        overlay.m_loggedFirstDraw = true;
    }
}

APICALL EXPORT std::string PLUGIN_API_VERSION() {
    return HYPRLAND_API_VERSION;
}

APICALL EXPORT PLUGIN_DESCRIPTION_INFO PLUGIN_INIT(HANDLE handle) {
    g_pluginHandle    = handle;
    g_unloading       = false;
    g_activeOverlays  = new std::unordered_map<uintptr_t, SYorhaOverlay>();
    g_openListener    = new CHyprSignalListener();
    g_destroyListener = new CHyprSignalListener();
    g_tickListener    = new CHyprSignalListener();

    HyprlandAPI::addConfigValue(handle, "plugin:yorha_window_fx:enabled", Hyprlang::CConfigValue{Hyprlang::INT{1}});
    HyprlandAPI::addConfigValue(handle, "plugin:yorha_window_fx:duration_ms", Hyprlang::CConfigValue{Hyprlang::FLOAT{420.f}});
    HyprlandAPI::addConfigValue(handle, "plugin:yorha_window_fx:edge_alpha", Hyprlang::CConfigValue{Hyprlang::FLOAT{0.18f}});
    HyprlandAPI::addConfigValue(handle, "plugin:yorha_window_fx:debug_raw_snapshot", Hyprlang::CConfigValue{Hyprlang::INT{0}});
    HyprlandAPI::addConfigValue(handle, "plugin:yorha_window_fx:snapshot_delay_ms", Hyprlang::CConfigValue{Hyprlang::FLOAT{45.f}});

    g_cfgEnabled    = HyprlandAPI::getConfigValue(handle, "plugin:yorha_window_fx:enabled");
    g_cfgDurationMs = HyprlandAPI::getConfigValue(handle, "plugin:yorha_window_fx:duration_ms");
    g_cfgEdgeAlpha  = HyprlandAPI::getConfigValue(handle, "plugin:yorha_window_fx:edge_alpha");
    g_cfgDebugRawSnapshot = HyprlandAPI::getConfigValue(handle, "plugin:yorha_window_fx:debug_raw_snapshot");
    g_cfgSnapshotDelayMs = HyprlandAPI::getConfigValue(handle, "plugin:yorha_window_fx:snapshot_delay_ms");

    *g_openListener = Event::bus()->m_events.window.open.listen([](PHLWINDOW window) {
        attachOverlay(window);
    });

    *g_destroyListener = Event::bus()->m_events.window.destroy.listen([](PHLWINDOW window) {
        removeOverlayForWindow(window);
    });

    *g_tickListener = Event::bus()->m_events.tick.listen([]() {
        cleanupFinishedOverlays();
    });

    const auto matches = HyprlandAPI::findFunctionsByName(handle, "renderWindow");
    for (const auto& match : matches) {
        if (!match.demangled.contains("IHyprRenderer::renderWindow"))
            continue;

        g_renderWindowHook = HyprlandAPI::createFunctionHook(handle, match.address, reinterpret_cast<void*>(&onRenderWindow));
        if (g_renderWindowHook && g_renderWindowHook->hook())
            break;

        g_renderWindowHook = nullptr;
    }

    notify(std::string{"yorha fx "} + PLUGIN_VERSION + (g_renderWindowHook ? " loaded" : " hook failed"), 1800.f);

    return {
        .name = "yorha-window-fx",
        .description = "Per-window YorHa radial snapshot reveal",
        .author = "OpenAI",
        .version = PLUGIN_VERSION,
    };
}

APICALL EXPORT void PLUGIN_EXIT() {
    g_unloading = true;

    if (g_tickListener)
        g_tickListener->reset();
    if (g_destroyListener)
        g_destroyListener->reset();
    if (g_openListener)
        g_openListener->reset();

    if (g_activeOverlays) {
        for (auto& [_, overlay] : *g_activeOverlays)
            restoreWindowAlpha(overlay);
        g_activeOverlays->clear();
    }

    if (g_renderWindowHook) {
        g_renderWindowHook->unhook();
        HyprlandAPI::removeFunctionHook(g_pluginHandle, g_renderWindowHook);
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(75));

    g_openListener = nullptr;
    g_destroyListener = nullptr;
    g_tickListener = nullptr;
    g_activeOverlays = nullptr;
    g_renderWindowHook = nullptr;
    g_pluginHandle = nullptr;
}
