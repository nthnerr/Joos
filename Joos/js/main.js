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
        ui.progressFill  = document.getElementById('progress-fill');
        ui.progressPct   = document.getElementById('progress-pct');

        ui.exportBtn.addEventListener('click', onExportClick);
        ui.qualitySlider.addEventListener('input', onQualityChange);

        onQualityChange();
        setStatus('');
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
        } else {
            startExport();
        }
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

    function buildFFmpegFlagsArray() {
        var level      = getQualityLevel();
        var quality    = QUALITY_MAP[level] || QUALITY_MAP[5];
        var upscaleKey = getUpscaleKey();
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

        var ffmpegFlagsJson  = JSON.stringify(buildFFmpegFlagsArray());
        var jsxStringLiteral = JSON.stringify(ffmpegFlagsJson);
        var script           = 'joos_export(' + jsxStringLiteral + ')';

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
            setProgress(5);

            try {
                activeRenderProcess = renderModule.runAERender(config, onProgress, function (err) {
                    activeRenderProcess = null;
                    onRenderComplete(err, config);
                });
            } catch (e) {
                handleError('Internal render error: ' + e.message);
            }
        });
    }

    function onProgress(percent, phase) {
        setProgress(percent);
        if (phase === 'ae') {
            setStatus('Rendering\u2026');
        } else if (phase === 'ffmpeg_start') {
            setStatus('Encoding\u2026');
        } else if (phase === 'ffmpeg_end') {
            setStatus('Finishing up\u2026');
        }
    }

    function onRenderComplete(err, config) {
        isExporting = false;
        setExportButtonState(false);

        if (err) {
            setProgress(0);
            setStatus('');
            csInterface.evalScript('joos_cleanup()');
            showNotification('Export Failed', err.message || String(err));
        } else {
            csInterface.evalScript('joos_cleanup()', function() {
                setProgress(0);
                setStatus('');
                showNotification(
                    'Export Complete',
                    config && config.outputPath
                        ? 'Video saved to:\n' + config.outputPath
                        : 'Video exported successfully.'
                );
            });
        }
    }

    function handleError(message) {
        isExporting = false;
        setExportButtonState(false);
        setProgress(0);
        setStatus('');
        showNotification('Export Failed', message);
    }

    function showNotification(title, message) {
        setTimeout(function () {
            alert(title + '\n\n' + message);
        }, 0);
    }

    function setStatus(msg) {
        if (ui.statusMsg) ui.statusMsg.textContent = msg;
    }

    function setProgress(percent) {
        var p = Math.max(0, Math.min(100, percent));
        if (ui.progressFill) ui.progressFill.style.width = p + '%';
        if (ui.progressPct)  ui.progressPct.textContent  = p + '%';
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
