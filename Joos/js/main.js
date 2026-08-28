(function () {
    'use strict';

    var csInterface  = new CSInterface();
    var nodePath     = require('path');
    var extPath      = csInterface.getSystemPath(SystemPath.EXTENSION);
    var renderModule = require(nodePath.join(extPath, 'node', 'render.js'));

    var ui          = {};
    var isExporting = false;
    var activeRenderProcess = null;

    var QUALITY_MAP = {
        1: { name: '\ud83d\udca9', crf: '24', preset: 'veryslow' },
        2: { name: 'Bad',          crf: '21', preset: 'veryslow' },
        3: { name: 'Poor',         crf: '18', preset: 'veryslow' },
        4: { name: 'Low',          crf: '15', preset: 'veryslow' },
        5: { name: 'Fair',         crf: '12', preset: 'veryslow' },
        6: { name: 'Good',         crf: '9',  preset: 'veryslow' },
        7: { name: 'Great',        crf: '6',  preset: 'veryslow' },
        8: { name: 'Excellent',    crf: '3',  preset: 'veryslow' },
        9: { name: 'Lossless',     crf: '0',  preset: 'veryslow' }
    };

    var UPSCALE_MAP = {
        1: { label: 'OFF',  vf: null                      },
        2: { label: '2K',   vf: 'scale=2560:1440:flags=lanczos' },
        4: { label: '4K',   vf: 'scale=3840:2160:flags=lanczos' }
    };

    function init() {
        ui.exportBtn     = document.getElementById('export-btn');
        ui.qualitySlider = document.getElementById('quality-slider');
        ui.qualityName   = document.getElementById('quality-name');
        ui.statusMsg     = document.getElementById('status-msg');
        ui.statusLabel   = document.getElementById('status-label');
        ui.statusEta     = document.getElementById('status-eta');
        ui.progressFill  = document.getElementById('progress-fill');
        ui.progressPct   = document.getElementById('progress-pct');

        ui.exportBtn.addEventListener('click', onExportClick);
        ui.qualitySlider.addEventListener('input', onQualityChange);

        onQualityChange();
        setStatus('');
        setEta(null);
        loadJSX();
    }

    function loadJSX() {
        var jsxPath    = extPath.replace(/\\/g, '/') + '/jsx/main.jsx';
        var injectRoot = 'JOOS_EXTENSION_ROOT = ' + JSON.stringify(extPath.replace(/\\/g, '/')) + ';';

        csInterface.evalScript(injectRoot, function () {
            csInterface.evalScript('$.evalFile("' + jsxPath + '")', function (result) {
                if (result === 'EvalScript error.') {
                    setStatus('Error: failed to load scripts');
                }
            });
        });
    }

    function onQualityChange() {
        var level = getQualityLevel();
        if (QUALITY_MAP[level]) {
            ui.qualityName.textContent = QUALITY_MAP[level].name;
        }
    }

    function onExportClick() {
        if (isExporting) {
            cancelExport();
            return;
        }

        if (window.JoosBehavior && window.JoosBehavior.getConfirmBeforeExport && window.JoosBehavior.getConfirmBeforeExport()) {
            var level        = getQualityLevel();
            var upscaleKey   = getUpscaleKey();
            var qualityName  = (QUALITY_MAP[level] || QUALITY_MAP[5]).name;
            var upscaleLabel = (UPSCALE_MAP[upscaleKey] || UPSCALE_MAP[1]).label;

            var proceed = confirm(
                'Start export?\n\nQuality: ' + qualityName + '\nUpscale: ' + upscaleLabel
            );
            if (!proceed) return;
        }

        startExport();
    }

    function cancelExport() {
        if (activeRenderProcess) {
            if (activeRenderProcess.killAll) {
                activeRenderProcess.killAll();
            } else {
                try { activeRenderProcess.kill('SIGKILL'); } catch (e) {}
            }
            activeRenderProcess = null;
        }
        isExporting = false;
        setExportButtonState(false);
        setProgress(0);
        setStatus('');
        setEta(null);
        csInterface.evalScript('joos_cleanup()');
    }

    function getQualityLevel() {
        var v = parseInt(ui.qualitySlider.value, 10);
        return isNaN(v) ? 5 : v;
    }

    function getUpscaleKey() {
        var radios = document.getElementsByName('upscale');
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                var v = parseInt(radios[i].value, 10);
                return isNaN(v) ? 1 : v;
            }
        }
        return 1;
    }

    function buildFFmpegFlagsArray(level, upscaleKey) {
        var quality    = QUALITY_MAP[level] || QUALITY_MAP[5];
        var upscale    = UPSCALE_MAP[upscaleKey] || UPSCALE_MAP[1];

        var flags = [
            '-c:v',     'libx264',
            '-preset',  quality.preset,
            '-crf',     quality.crf,
            '-pix_fmt', 'yuv420p'
        ];

        if (upscale.vf) {
            flags = flags.concat(['-vf', upscale.vf]);
        }

        return flags;
    }

    function startExport() {
        isExporting = true;
        setExportButtonState(true);
        setStatus('Initializing\u2026');
        setProgress(0);
        setEta(null);

        var level      = getQualityLevel();
        var upscaleKey = getUpscaleKey();

        // Export Defaults' "remember last used settings" feature lives in
        // settings.js; recording here (at the moment the user commits to
        // exporting, not on completion) matches how most apps remember your
        // last-chosen settings regardless of whether the export itself
        // later succeeds or is cancelled.
        if (window.JoosExportDefaults && window.JoosExportDefaults.recordLastUsed) {
            window.JoosExportDefaults.recordLastUsed(level, upscaleKey);
        }

        var defaultFolder = (window.JoosExportDefaults && window.JoosExportDefaults.getOutputFolder)
            ? window.JoosExportDefaults.getOutputFolder()
            : '';

        var ffmpegFlagsJson  = JSON.stringify(buildFFmpegFlagsArray(level, upscaleKey));
        var ffmpegFlagsArg   = JSON.stringify(ffmpegFlagsJson);
        var defaultFolderArg = JSON.stringify(defaultFolder);
        var script           = 'joos_export(' + ffmpegFlagsArg + ', ' + defaultFolderArg + ')';

        csInterface.evalScript(script, function (result) {
            if (!result || result === 'undefined' || result === 'EvalScript error.') {
                return handleError(
                    'Failed to communicate with After Effects.\n' +
                    'Make sure a project is open and try again.'
                );
            }

            var config;
            try {
                config = JSON.parse(result);
            } catch (e) {
                return handleError('Unexpected response from After Effects: ' + result);
            }

            if (!config.success) {
                return handleError(config.error || 'Export could not be started.');
            }

            setStatus('Rendering\u2026');

            var autoCleanup = (window.JoosBehavior && window.JoosBehavior.getAutoCleanup)
                ? window.JoosBehavior.getAutoCleanup()
                : true;

            try {
                activeRenderProcess = renderModule.runAERender(config, onProgress, function (err) {
                    activeRenderProcess = null;
                    onRenderComplete(err, config, autoCleanup);
                }, autoCleanup);
            } catch (e) {
                handleError('Internal render error: ' + e.message);
            }
        });
    }

    function onProgress(percent, phase, etaMs) {
        setProgress(percent);
        setEta(etaMs);
        if (phase === 'ae') {
            setStatus('Rendering\u2026');
        } else if (phase === 'ffmpeg_start') {
            setStatus('Encoding\u2026');
        } else if (phase === 'ffmpeg_end') {
            setStatus('Finishing up\u2026');
        }
    }

    function onRenderComplete(err, config, autoCleanup) {
        isExporting = false;
        setExportButtonState(false);

        if (err) {
            setProgress(0);
            setStatus('');
            setEta(null);
            csInterface.evalScript('joos_cleanup()');
            showNotification('Export Failed', err.message || String(err));
        } else {
            csInterface.evalScript('joos_cleanup()', function() {
                setProgress(0);
                setStatus('');
                setEta(null);

                var autoClose = (window.JoosBehavior && window.JoosBehavior.getAutoClose)
                    ? window.JoosBehavior.getAutoClose()
                    : false;

                if (autoClose) {
                    // Skip the completion alert entirely rather than
                    // showing it and closing right after — alert() blocks
                    // further script execution until dismissed, so the
                    // close call wouldn't actually run until the user
                    // clicked through it anyway, defeating the point of
                    // "auto". The panel disappearing is itself the signal.
                    csInterface.closeExtension();
                    return;
                }

                var message = config && config.outputPath
                    ? 'Video saved to:\n' + config.outputPath
                    : 'Video exported successfully.';

                if (autoCleanup === false && config && config.frameDir) {
                    message += '\n\nTemp files kept at:\n' + config.frameDir;
                }

                showNotification('Export Complete', message);
            });
        }
    }

    function handleError(message) {
        isExporting = false;
        setExportButtonState(false);
        setProgress(0);
        setStatus('');
        setEta(null);
        showNotification('Export Failed', message);
    }

    function showNotification(title, message) {
        setTimeout(function () {
            alert(title + '\n\n' + message);
        }, 0);
    }

    function setStatus(msg) {
        if (ui.statusLabel) ui.statusLabel.textContent = msg;
    }

    // etaMs is the same estimated-time-remaining value render.js derives
    // from the rate-based totalEstimate math used for the percentage
    // (estimatedTotalDuration - elapsedSoFar) — this just formats it.
    function setEta(etaMs) {
        if (!ui.statusEta) return;
        ui.statusEta.textContent = formatEta(etaMs);
    }

    function formatEta(etaMs) {
        if (etaMs === null || etaMs === undefined || !isFinite(etaMs) || etaMs <= 0) {
            return '';
        }

        // Round up rather than down/nearest — an ETA that counts down to
        // exactly zero as work finishes reads as more honest than one that
        // hits "0s left" a moment before the process actually completes.
        var totalSeconds = Math.ceil(etaMs / 1000);
        if (totalSeconds < 1) return '~1s left';

        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;

        if (minutes > 0) {
            return '~' + minutes + 'm ' + seconds + 's left';
        }
        return '~' + seconds + 's left';
    }

    function setProgress(percent) {
        var p = Math.max(0, Math.min(100, percent));
        if (ui.progressFill) ui.progressFill.style.width = p + '%';
        if (ui.progressPct)  ui.progressPct.textContent  = p.toFixed(2) + '%';
    }

    function setExportButtonState(exporting) {
        if (!ui.exportBtn) return;
        ui.exportBtn.disabled    = false;
        ui.exportBtn.textContent = exporting ? 'CANCEL' : 'EXPORT';
        ui.exportBtn.style.background = exporting ? '#ff4466' : '';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
