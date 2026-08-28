(function () {
    'use strict';

    var csInterface = new CSInterface();
    var fs   = require('fs');
    var path = require('path');

    var DEFAULT_ACCENT  = '#5bc0de';
    var DEFAULT_THEME   = 'dark';     // matches the app's original fixed-dark look
    var DEFAULT_DENSITY = 'expanded'; // matches the app's original layout
    var HEX_PATTERN      = /^#[0-9a-fA-F]{6}$/;
    var VALID_THEMES     = ['light', 'dark', 'auto'];
    var VALID_DENSITIES  = ['expanded', 'compact'];

    // Export Defaults. VALID_QUALITY_LEVELS/VALID_UPSCALE_KEYS mirror the
    // domains of main.js's QUALITY_MAP (1-9) and UPSCALE_MAP (1/2/4) — kept
    // in sync manually since the two scripts don't share module state.
    var DEFAULT_EXPORT_QUALITY = 5;
    var DEFAULT_EXPORT_UPSCALE = 1;
    var DEFAULT_OUTPUT_FOLDER  = '';
    var DEFAULT_REMEMBER_SCOPE = 'global';
    var VALID_QUALITY_LEVELS   = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    var VALID_UPSCALE_KEYS     = [1, 2, 4];
    var VALID_REMEMBER_SCOPES  = ['global', 'per-project'];

    // Mirrors QUALITY_MAP's display names in main.js for the Default Preset
    // quality slider's live label — see the note above on why this isn't a
    // single shared source.
    var DEFAULT_PRESET_QUALITY_NAMES = {
        1: '\ud83d\udca9', 2: 'Bad',  3: 'Poor',      4: 'Low', 5: 'Fair',
        6: 'Good',         7: 'Great', 8: 'Excellent', 9: 'Lossless'
    };

    // Behavior. autoCleanup defaults to true (matches the app's existing
    // always-cleans-up behavior) — the other two default to false/off,
    // since neither existed before and shouldn't change anyone's workflow
    // without them opting in.
    var DEFAULT_AUTO_CLOSE            = false;
    var DEFAULT_CONFIRM_BEFORE_EXPORT = false;
    var DEFAULT_AUTO_CLEANUP          = true;

    // Settings persist to the extension's own subfolder under the user's
    // writable per-user data directory — NOT under the extension's own
    // install directory, which on Windows typically lives under
    // "Program Files" and isn't writable without admin rights.
    var settingsDir  = path.join(csInterface.getSystemPath(SystemPath.USER_DATA), 'Joos');
    var settingsFile = path.join(settingsDir, 'settings.json');

    var ui = {};
    var currentSettings = null; // populated in init() from loadSettings()

    // ---- persistence ----
    // loadSettings validates each field independently against its own
    // default, so a partial or partially-corrupt file (e.g. a valid theme
    // but a malformed accentColor) doesn't fall back to *all* defaults —
    // only the field that's actually missing/invalid does.

    function isValidExportRecord(rec) {
        return !!rec && typeof rec === 'object' &&
            VALID_QUALITY_LEVELS.indexOf(rec.quality) !== -1 &&
            VALID_UPSCALE_KEYS.indexOf(rec.upscale) !== -1;
    }

    function loadSettings() {
        var settings = {
            accentColor: DEFAULT_ACCENT,
            theme:       DEFAULT_THEME,
            density:     DEFAULT_DENSITY,
            exportDefaults: {
                quality:       DEFAULT_EXPORT_QUALITY,
                upscale:       DEFAULT_EXPORT_UPSCALE,
                outputFolder:  DEFAULT_OUTPUT_FOLDER,
                rememberScope: DEFAULT_REMEMBER_SCOPE
            },
            // Only read when rememberScope === 'per-project': last-used
            // quality/upscale keyed by each project's absolute file path.
            projectDefaults: {},
            // Only read when rememberScope === 'global': last-used
            // quality/upscale shared across every project.
            lastUsedGlobal: null,
            behavior: {
                autoClose:           DEFAULT_AUTO_CLOSE,
                confirmBeforeExport: DEFAULT_CONFIRM_BEFORE_EXPORT,
                autoCleanup:         DEFAULT_AUTO_CLEANUP
            }
        };
        try {
            var raw    = fs.readFileSync(settingsFile, 'utf8');
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                if (typeof parsed.accentColor === 'string' && HEX_PATTERN.test(parsed.accentColor)) {
                    settings.accentColor = parsed.accentColor;
                }
                if (VALID_THEMES.indexOf(parsed.theme) !== -1) {
                    settings.theme = parsed.theme;
                }
                if (VALID_DENSITIES.indexOf(parsed.density) !== -1) {
                    settings.density = parsed.density;
                }

                if (parsed.exportDefaults && typeof parsed.exportDefaults === 'object') {
                    var ed = parsed.exportDefaults;
                    if (VALID_QUALITY_LEVELS.indexOf(ed.quality) !== -1) {
                        settings.exportDefaults.quality = ed.quality;
                    }
                    if (VALID_UPSCALE_KEYS.indexOf(ed.upscale) !== -1) {
                        settings.exportDefaults.upscale = ed.upscale;
                    }
                    if (typeof ed.outputFolder === 'string') {
                        settings.exportDefaults.outputFolder = ed.outputFolder;
                    }
                    if (VALID_REMEMBER_SCOPES.indexOf(ed.rememberScope) !== -1) {
                        settings.exportDefaults.rememberScope = ed.rememberScope;
                    }
                }

                if (parsed.projectDefaults && typeof parsed.projectDefaults === 'object') {
                    settings.projectDefaults = parsed.projectDefaults;
                }

                if (isValidExportRecord(parsed.lastUsedGlobal)) {
                    settings.lastUsedGlobal = {
                        quality: parsed.lastUsedGlobal.quality,
                        upscale: parsed.lastUsedGlobal.upscale
                    };
                }

                if (parsed.behavior && typeof parsed.behavior === 'object') {
                    var bh = parsed.behavior;
                    if (typeof bh.autoClose === 'boolean') {
                        settings.behavior.autoClose = bh.autoClose;
                    }
                    if (typeof bh.confirmBeforeExport === 'boolean') {
                        settings.behavior.confirmBeforeExport = bh.confirmBeforeExport;
                    }
                    if (typeof bh.autoCleanup === 'boolean') {
                        settings.behavior.autoCleanup = bh.autoCleanup;
                    }
                }
            }
        } catch (e) {
            // No settings file yet (first launch) or it's unreadable/corrupt
            // — the defaults set above already cover this case.
        }
        return settings;
    }

    // Always writes the full currentSettings object, never a partial one —
    // callers mutate currentSettings first, then call this, so a change to
    // one field can never clobber the others on disk.
    function persistSettings() {
        try {
            if (!fs.existsSync(settingsDir)) {
                fs.mkdirSync(settingsDir, { recursive: true });
            }
            fs.writeFileSync(settingsFile, JSON.stringify(currentSettings, null, 2), 'utf8');
        } catch (e) {
            // Best-effort — a failed write just means preferences revert to
            // default next launch, not worth interrupting the user over.
        }
    }

    // ---- color math ----
    // The app's palette already expresses --accent-hover/-dim/-glow/-glow-hi
    // as CSS custom properties derived from a single base color, so a
    // user-chosen accent only needs to regenerate those same relationships:
    // a lighter HSL variant for hover, and the base color at various alpha
    // levels for the dim/glow states.

    function hexToRgb(hex) {
        var clean = hex.replace('#', '');
        var num   = parseInt(clean, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }

    function rgbToHex(r, g, b) {
        function toHex(v) {
            var h = Math.max(0, Math.min(255, Math.round(v))).toString(16);
            return h.length === 1 ? '0' + h : h;
        }
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                default: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h, s: s, l: l };
    }

    function hslToRgb(h, s, l) {
        var r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            var hue2rgb = function (p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: r * 255, g: g * 255, b: b * 255 };
    }

    // Calibrated against the app's original hardcoded pair
    // (--accent: #5bc0de -> --accent-hover: #6dd5f5): converting both to
    // HSL shows that pair differs by +8% lightness and +21% saturation,
    // not a lightness-only shift. Reproducing that same delta from any
    // chosen accent regenerates a hover state consistent with the app's
    // existing design language rather than a generically "lighter" guess.
    function deriveHoverHex(hex) {
        var rgb = hexToRgb(hex);
        var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        hsl.l = Math.min(1, hsl.l + 0.08);
        hsl.s = Math.min(1, hsl.s + 0.21);
        var out = hslToRgb(hsl.h, hsl.s, hsl.l);
        return rgbToHex(out.r, out.g, out.b);
    }

    function hexToRgbaString(hex, alpha) {
        var rgb = hexToRgb(hex);
        return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
    }

    function isValidHex(hex) {
        return HEX_PATTERN.test(hex);
    }

    function applyAccentColor(hex) {
        var root = document.documentElement.style;
        root.setProperty('--accent', hex);
        root.setProperty('--accent-hover', deriveHoverHex(hex));
        root.setProperty('--accent-dim', hexToRgbaString(hex, 0.10));
        root.setProperty('--accent-glow', hexToRgbaString(hex, 0.40));
        root.setProperty('--accent-glow-hi', hexToRgbaString(hex, 0.60));
    }

    function syncColorInputs(hex) {
        if (ui.colorPicker)   ui.colorPicker.value = hex;
        if (ui.colorHexInput) ui.colorHexInput.value = hex.toUpperCase();
    }

    // ---- theme ----
    // "Auto" tracks the OS's color-scheme preference live via matchMedia,
    // rather than reading it once at load time, so the panel follows a
    // system theme change while it's open. "Light"/"Dark" are hard
    // overrides independent of the OS setting.

    var lightMediaQuery   = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    var mediaQueryHandler = null;

    function mqAddListener(mq, handler) {
        if (!mq) return;
        if (mq.addEventListener) {
            mq.addEventListener('change', handler);
        } else if (mq.addListener) {
            // Safari < 14 / older WebKit fallback.
            mq.addListener(handler);
        }
    }

    function mqRemoveListener(mq, handler) {
        if (!mq) return;
        if (mq.removeEventListener) {
            mq.removeEventListener('change', handler);
        } else if (mq.removeListener) {
            mq.removeListener(handler);
        }
    }

    function resolveEffectiveTheme(pref) {
        if (pref === 'auto') {
            return (lightMediaQuery && lightMediaQuery.matches) ? 'light' : 'dark';
        }
        return pref;
    }

    function applyTheme(pref) {
        document.documentElement.setAttribute('data-theme', resolveEffectiveTheme(pref));

        // Tear down any previous listener first — switching away from
        // "auto" should stop it from silently flipping the theme later,
        // and switching back into "auto" shouldn't stack a second one.
        if (mediaQueryHandler) {
            mqRemoveListener(lightMediaQuery, mediaQueryHandler);
            mediaQueryHandler = null;
        }

        if (pref === 'auto') {
            mediaQueryHandler = function () {
                document.documentElement.setAttribute('data-theme', resolveEffectiveTheme('auto'));
            };
            mqAddListener(lightMediaQuery, mediaQueryHandler);
        }
    }

    function syncThemeRadio(value) {
        var el = document.getElementById('theme-' + value);
        if (el) el.checked = true;
    }

    // ---- density ----

    function applyDensity(pref) {
        document.documentElement.setAttribute('data-density', pref);
    }

    function syncDensityRadio(value) {
        var el = document.getElementById('density-' + value);
        if (el) el.checked = true;
    }

    // ---- export defaults ----
    // Resolution priority: a remembered last-used value (scoped globally or
    // per-project, per the user's choice) wins over the static Default
    // Preset — the preset is the fallback for when there's no memory yet
    // (a brand-new project, a freshly-cleared history, or global scope with
    // no exports made so far).

    function resolveExportDefaults(projectPath) {
        var ed = currentSettings.exportDefaults;

        if (ed.rememberScope === 'per-project' && projectPath) {
            var perProject = currentSettings.projectDefaults[projectPath];
            if (isValidExportRecord(perProject)) return perProject;
        }

        if (ed.rememberScope === 'global' && isValidExportRecord(currentSettings.lastUsedGlobal)) {
            return currentSettings.lastUsedGlobal;
        }

        return { quality: ed.quality, upscale: ed.upscale };
    }

    function applyExportDefaultsToMainView(resolved) {
        var qualitySlider = document.getElementById('quality-slider');
        if (qualitySlider) {
            qualitySlider.value = resolved.quality;
            // Setting .value programmatically doesn't fire 'input' on its
            // own — dispatch it so main.js's own listener updates the
            // quality-name label, keeping that logic in one place instead
            // of duplicating it here.
            qualitySlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        var upscaleRadio = document.getElementById('u' + resolved.upscale);
        if (upscaleRadio) upscaleRadio.checked = true;
    }

    // Applying the resolved default to the main view only needs an async
    // ExtendScript round-trip when scope is 'per-project' (fetching the
    // current project's path) — the far more common 'global' scope (and the
    // default state) resolves and applies synchronously with zero delay.
    function resolveAndApplyExportDefaults() {
        var ed = currentSettings.exportDefaults;
        if (ed.rememberScope === 'per-project') {
            csInterface.evalScript('joos_getProjectPath()', function (result) {
                var projectPath = null;
                try {
                    var parsed = JSON.parse(result);
                    if (parsed && parsed.success && parsed.path) projectPath = parsed.path;
                } catch (e) {}
                applyExportDefaultsToMainView(resolveExportDefaults(projectPath));
            });
        } else {
            applyExportDefaultsToMainView(resolveExportDefaults(null));
        }
    }

    // Called by main.js the moment the user commits to an export (not on
    // completion — matches how most apps remember your last-chosen export
    // settings regardless of whether the export itself later succeeds).
    function recordLastUsed(quality, upscale) {
        if (!isValidExportRecord({ quality: quality, upscale: upscale })) return;
        var record = { quality: quality, upscale: upscale };

        if (currentSettings.exportDefaults.rememberScope === 'per-project') {
            csInterface.evalScript('joos_getProjectPath()', function (result) {
                try {
                    var parsed = JSON.parse(result);
                    if (parsed && parsed.success && parsed.path) {
                        currentSettings.projectDefaults[parsed.path] = record;
                        persistSettings();
                    }
                    // An unsaved project (path === null) has nowhere to
                    // scope a per-project memory to — silently skip rather
                    // than falling back to global, since that would be
                    // surprising given the user explicitly chose per-project.
                } catch (e) {}
            });
        } else {
            currentSettings.lastUsedGlobal = record;
            persistSettings();
        }
    }

    function syncDefaultQualityLabel() {
        if (!ui.defaultQualitySlider || !ui.defaultQualityName) return;
        var level = parseInt(ui.defaultQualitySlider.value, 10);
        if (DEFAULT_PRESET_QUALITY_NAMES[level]) {
            ui.defaultQualityName.textContent = DEFAULT_PRESET_QUALITY_NAMES[level];
        }
    }

    function syncDefaultUpscaleRadio(value) {
        var el = document.getElementById('du' + value);
        if (el) el.checked = true;
    }

    function syncRememberScopeRadio(value) {
        var el = document.getElementById('remember-' + value);
        if (el) el.checked = true;
    }

    function updateOutputFolderDisplay() {
        var folder = currentSettings.exportDefaults.outputFolder;
        if (ui.outputFolderPath) {
            if (folder) {
                ui.outputFolderPath.textContent = folder;
                ui.outputFolderPath.title = folder;
                ui.outputFolderPath.classList.add('is-set');
            } else {
                ui.outputFolderPath.textContent = 'Not set \u2014 uses project folder';
                ui.outputFolderPath.title = '';
                ui.outputFolderPath.classList.remove('is-set');
            }
        }
        if (ui.outputFolderClearBtn) {
            if (folder) {
                ui.outputFolderClearBtn.classList.remove('view-hidden');
            } else {
                ui.outputFolderClearBtn.classList.add('view-hidden');
            }
        }
    }

    // ---- navigation: main export view <-> the single settings page ----

    function openSettings() {
        if (ui.brandHeader)  ui.brandHeader.classList.add('view-hidden');
        if (ui.mainView)     ui.mainView.classList.add('view-hidden');
        if (ui.settingsView) ui.settingsView.classList.remove('view-hidden');
    }

    function closeSettings() {
        if (ui.settingsView) ui.settingsView.classList.add('view-hidden');
        if (ui.mainView)     ui.mainView.classList.remove('view-hidden');
        if (ui.brandHeader)  ui.brandHeader.classList.remove('view-hidden');
    }

    // ---- hint tooltips ----
    // The tooltip is position:fixed (see settings.css for why), so it needs
    // its actual viewport coordinates computed here — a static CSS anchor
    // can't be correct for every badge, since how far right a badge sits
    // depends entirely on how long its setting's label is.

    function positionHintTooltip(badge) {
        var tooltip = badge.querySelector('.hint-tooltip');
        if (!tooltip) return;

        var margin = 8;
        var badgeRect = badge.getBoundingClientRect();
        // The tooltip is already laid out (just invisible via
        // opacity/visibility, not display:none), so its real rendered
        // width is measurable even before it's shown.
        var tooltipWidth = tooltip.getBoundingClientRect().width;

        var left = badgeRect.left;
        var maxLeft = window.innerWidth - tooltipWidth - margin;
        if (left > maxLeft) left = Math.max(margin, maxLeft);

        tooltip.style.left = left + 'px';
        tooltip.style.top  = (badgeRect.bottom + margin) + 'px';
    }

    function wireHintBadges() {
        var badges = document.querySelectorAll('.hint-badge');
        for (var i = 0; i < badges.length; i++) {
            (function (badge) {
                badge.addEventListener('mouseenter', function () { positionHintTooltip(badge); });
                badge.addEventListener('focus', function () { positionHintTooltip(badge); });
            })(badges[i]);
        }
    }

    // ---- wiring ----

    function init() {
        ui.settingsBtn   = document.getElementById('settings-btn');
        ui.backBtn       = document.getElementById('settings-back-btn');
        ui.mainView      = document.getElementById('main-view');
        ui.settingsView  = document.getElementById('settings-view');
        ui.brandHeader   = document.getElementById('brand-header');
        ui.colorPicker   = document.getElementById('accent-color-picker');
        ui.colorHexInput = document.getElementById('accent-color-hex');
        ui.resetBtn      = document.getElementById('appearance-reset-btn');

        ui.defaultQualitySlider  = document.getElementById('default-quality-slider');
        ui.defaultQualityName    = document.getElementById('default-quality-name');
        ui.outputFolderPath      = document.getElementById('output-folder-path');
        ui.outputFolderBrowseBtn = document.getElementById('output-folder-browse-btn');
        ui.outputFolderClearBtn  = document.getElementById('output-folder-clear-btn');
        ui.exportDefaultsResetBtn = document.getElementById('export-defaults-reset-btn');

        ui.behaviorAutoClose    = document.getElementById('behavior-auto-close');
        ui.behaviorConfirmExport = document.getElementById('behavior-confirm-export');
        ui.behaviorAutoCleanup  = document.getElementById('behavior-auto-cleanup');
        ui.behaviorResetBtn     = document.getElementById('behavior-reset-btn');

        currentSettings = loadSettings();

        applyAccentColor(currentSettings.accentColor);
        syncColorInputs(currentSettings.accentColor);

        applyTheme(currentSettings.theme);
        syncThemeRadio(currentSettings.theme);

        applyDensity(currentSettings.density);
        syncDensityRadio(currentSettings.density);

        if (ui.defaultQualitySlider) ui.defaultQualitySlider.value = currentSettings.exportDefaults.quality;
        syncDefaultQualityLabel();
        syncDefaultUpscaleRadio(currentSettings.exportDefaults.upscale);
        syncRememberScopeRadio(currentSettings.exportDefaults.rememberScope);
        updateOutputFolderDisplay();
        resolveAndApplyExportDefaults();

        if (ui.behaviorAutoClose)     ui.behaviorAutoClose.checked = currentSettings.behavior.autoClose;
        if (ui.behaviorConfirmExport) ui.behaviorConfirmExport.checked = currentSettings.behavior.confirmBeforeExport;
        if (ui.behaviorAutoCleanup)   ui.behaviorAutoCleanup.checked = currentSettings.behavior.autoCleanup;

        if (ui.settingsBtn) ui.settingsBtn.addEventListener('click', openSettings);
        if (ui.backBtn)     ui.backBtn.addEventListener('click', closeSettings);

        wireHintBadges();

        if (ui.colorPicker) {
            // 'input' fires continuously while the picker is open — use it
            // for live preview so the whole UI updates as the user drags.
            ui.colorPicker.addEventListener('input', function () {
                var hex = ui.colorPicker.value;
                applyAccentColor(hex);
                if (ui.colorHexInput) ui.colorHexInput.value = hex.toUpperCase();
            });
            // 'change' only fires once the picker dialog closes — that's
            // the point to persist, rather than writing to disk on every
            // intermediate drag position.
            ui.colorPicker.addEventListener('change', function () {
                currentSettings.accentColor = ui.colorPicker.value;
                persistSettings();
            });
        }

        if (ui.colorHexInput) {
            ui.colorHexInput.addEventListener('input', function () {
                var hex = ui.colorHexInput.value.trim();
                if (isValidHex(hex)) {
                    applyAccentColor(hex);
                    if (ui.colorPicker) ui.colorPicker.value = hex;
                }
            });
            ui.colorHexInput.addEventListener('change', function () {
                var hex = ui.colorHexInput.value.trim();
                if (isValidHex(hex)) {
                    currentSettings.accentColor = hex;
                    persistSettings();
                    ui.colorHexInput.value = hex.toUpperCase();
                } else {
                    // Invalid entry — revert to the last known-good color
                    // rather than leaving a broken value in the field.
                    var fallback = ui.colorPicker ? ui.colorPicker.value : DEFAULT_ACCENT;
                    applyAccentColor(fallback);
                    syncColorInputs(fallback);
                }
            });
        }

        var themeInputs = document.querySelectorAll('input[name="theme"]');
        for (var t = 0; t < themeInputs.length; t++) {
            themeInputs[t].addEventListener('change', function (e) {
                if (!e.target.checked) return;
                currentSettings.theme = e.target.value;
                applyTheme(currentSettings.theme);
                persistSettings();
            });
        }

        var densityInputs = document.querySelectorAll('input[name="density"]');
        for (var d = 0; d < densityInputs.length; d++) {
            densityInputs[d].addEventListener('change', function (e) {
                if (!e.target.checked) return;
                currentSettings.density = e.target.value;
                applyDensity(currentSettings.density);
                persistSettings();
            });
        }

        if (ui.defaultQualitySlider) {
            ui.defaultQualitySlider.addEventListener('input', syncDefaultQualityLabel);
            ui.defaultQualitySlider.addEventListener('change', function () {
                currentSettings.exportDefaults.quality = parseInt(ui.defaultQualitySlider.value, 10);
                persistSettings();
            });
        }

        var defaultUpscaleInputs = document.querySelectorAll('input[name="default-upscale"]');
        for (var du = 0; du < defaultUpscaleInputs.length; du++) {
            defaultUpscaleInputs[du].addEventListener('change', function (e) {
                if (!e.target.checked) return;
                currentSettings.exportDefaults.upscale = parseInt(e.target.value, 10);
                persistSettings();
            });
        }

        if (ui.outputFolderBrowseBtn) {
            ui.outputFolderBrowseBtn.addEventListener('click', function () {
                csInterface.evalScript('joos_selectOutputFolder()', function (result) {
                    try {
                        var parsed = JSON.parse(result);
                        if (parsed && parsed.success && parsed.path) {
                            currentSettings.exportDefaults.outputFolder = parsed.path;
                            persistSettings();
                            updateOutputFolderDisplay();
                        }
                        // cancelled === true just means the user closed the
                        // picker without choosing — nothing to do.
                    } catch (e) {}
                });
            });
        }

        if (ui.outputFolderClearBtn) {
            ui.outputFolderClearBtn.addEventListener('click', function () {
                currentSettings.exportDefaults.outputFolder = DEFAULT_OUTPUT_FOLDER;
                persistSettings();
                updateOutputFolderDisplay();
            });
        }

        var rememberScopeInputs = document.querySelectorAll('input[name="remember-scope"]');
        for (var rs = 0; rs < rememberScopeInputs.length; rs++) {
            rememberScopeInputs[rs].addEventListener('change', function (e) {
                if (!e.target.checked) return;
                currentSettings.exportDefaults.rememberScope = e.target.value;
                persistSettings();
                // Which memory bucket is "active" just changed — refresh
                // the main view so it reflects whatever that scope
                // actually resolves to right now, rather than staying on
                // whatever the previous scope had shown.
                resolveAndApplyExportDefaults();
            });
        }

        if (ui.exportDefaultsResetBtn) {
            ui.exportDefaultsResetBtn.addEventListener('click', function () {
                // Resets the preset/folder/scope back to factory defaults.
                // Deliberately leaves projectDefaults/lastUsedGlobal alone
                // — clearing accumulated "last used" history is a more
                // destructive action than what a "Reset to Default" button
                // implies here.
                currentSettings.exportDefaults.quality       = DEFAULT_EXPORT_QUALITY;
                currentSettings.exportDefaults.upscale       = DEFAULT_EXPORT_UPSCALE;
                currentSettings.exportDefaults.outputFolder  = DEFAULT_OUTPUT_FOLDER;
                currentSettings.exportDefaults.rememberScope = DEFAULT_REMEMBER_SCOPE;
                persistSettings();

                if (ui.defaultQualitySlider) ui.defaultQualitySlider.value = DEFAULT_EXPORT_QUALITY;
                syncDefaultQualityLabel();
                syncDefaultUpscaleRadio(DEFAULT_EXPORT_UPSCALE);
                syncRememberScopeRadio(DEFAULT_REMEMBER_SCOPE);
                updateOutputFolderDisplay();
                resolveAndApplyExportDefaults();
            });
        }

        if (ui.behaviorAutoClose) {
            ui.behaviorAutoClose.addEventListener('change', function () {
                currentSettings.behavior.autoClose = ui.behaviorAutoClose.checked;
                persistSettings();
            });
        }

        if (ui.behaviorConfirmExport) {
            ui.behaviorConfirmExport.addEventListener('change', function () {
                currentSettings.behavior.confirmBeforeExport = ui.behaviorConfirmExport.checked;
                persistSettings();
            });
        }

        if (ui.behaviorAutoCleanup) {
            ui.behaviorAutoCleanup.addEventListener('change', function () {
                currentSettings.behavior.autoCleanup = ui.behaviorAutoCleanup.checked;
                persistSettings();
            });
        }

        if (ui.behaviorResetBtn) {
            ui.behaviorResetBtn.addEventListener('click', function () {
                currentSettings.behavior.autoClose           = DEFAULT_AUTO_CLOSE;
                currentSettings.behavior.confirmBeforeExport = DEFAULT_CONFIRM_BEFORE_EXPORT;
                currentSettings.behavior.autoCleanup         = DEFAULT_AUTO_CLEANUP;
                persistSettings();

                if (ui.behaviorAutoClose)     ui.behaviorAutoClose.checked = DEFAULT_AUTO_CLOSE;
                if (ui.behaviorConfirmExport) ui.behaviorConfirmExport.checked = DEFAULT_CONFIRM_BEFORE_EXPORT;
                if (ui.behaviorAutoCleanup)   ui.behaviorAutoCleanup.checked = DEFAULT_AUTO_CLEANUP;
            });
        }

        if (ui.resetBtn) {
            ui.resetBtn.addEventListener('click', function () {
                applyAccentColor(DEFAULT_ACCENT);
                syncColorInputs(DEFAULT_ACCENT);

                applyTheme(DEFAULT_THEME);
                syncThemeRadio(DEFAULT_THEME);

                applyDensity(DEFAULT_DENSITY);
                syncDensityRadio(DEFAULT_DENSITY);

                currentSettings.accentColor = DEFAULT_ACCENT;
                currentSettings.theme       = DEFAULT_THEME;
                currentSettings.density     = DEFAULT_DENSITY;
                persistSettings();
            });
        }
    }

    // main.js calls into these two at export time — recordLastUsed the
    // moment the user commits to exporting, getOutputFolder to seed the
    // save dialog's starting folder. Safe to expose at module scope (rather
    // than only after init()) since both close over currentSettings lazily
    // and are only ever invoked after a user interaction, by which point
    // init() has always already run.
    window.JoosExportDefaults = {
        recordLastUsed: recordLastUsed,
        getOutputFolder: function () {
            return (currentSettings && currentSettings.exportDefaults.outputFolder) || '';
        }
    };

    // main.js calls into these at the relevant points in the export flow:
    // getConfirmBeforeExport before starting, getAutoCleanup when handing
    // off to render.js, getAutoClose once the export completes. Same
    // lazy-closure-over-currentSettings reasoning as JoosExportDefaults
    // above applies here too.
    window.JoosBehavior = {
        getAutoClose: function () {
            return !!(currentSettings && currentSettings.behavior.autoClose);
        },
        getConfirmBeforeExport: function () {
            return !!(currentSettings && currentSettings.behavior.confirmBeforeExport);
        },
        getAutoCleanup: function () {
            return currentSettings ? currentSettings.behavior.autoCleanup !== false : true;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
