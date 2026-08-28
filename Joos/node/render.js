'use strict';

var spawn    = require('child_process').spawn;
var exec     = require('child_process').exec;
var execSync = require('child_process').execSync;
var path  = require('path');
var fs    = require('fs');

// Progress is a single 0.00-100.00% continuum spanning both phases (AE
// render + FFmpeg encode), weighted by *measured* wall-clock rates rather
// than a fixed split — see the stdout handler in runAERender (phase 1) and
// the stderr handler in runFFmpeg (phase 2) for the estimation math.
function clampMonotonic(progressState, rawPercent) {
    // 100.00% is reserved exclusively for genuine completion (set directly
    // on process exit), never for an estimate, so intermediate values are
    // capped just under it.
    var clamped = Math.max(0, Math.min(99.99, rawPercent));
    // Estimates can be revised as better data arrives (e.g. FFmpeg's
    // speed= reading correcting an early guess) — never let a revision
    // move the displayed value backwards.
    if (clamped < progressState.lastPercent) clamped = progressState.lastPercent;
    progressState.lastPercent = clamped;
    return clamped;
}

function findAERenderPath() {
    var possiblePaths = [];

    var commonDirs = [
        'C:\\Program Files\\Adobe',
        'C:\\Program Files (x86)\\Adobe',
        'D:\\Program Files\\Adobe',
        'D:\\Program Files (x86)\\Adobe',
        'E:\\Program Files\\Adobe'
    ];

    for (var i = 0; i < commonDirs.length; i++) {
        if (fs.existsSync(commonDirs[i])) {
            try {
                var entries = fs.readdirSync(commonDirs[i]);
                for (var j = 0; j < entries.length; j++) {
                    if (/After Effects/i.test(entries[j])) {
                        var aerenderPath = path.join(commonDirs[i], entries[j], 'Support Files', 'aerender.exe');
                        if (fs.existsSync(aerenderPath)) {
                            possiblePaths.push(aerenderPath);
                        }
                    }
                }
            } catch (e) {}
        }
    }

    try {
        var whereOutput = execSync('where aerender.exe', { encoding: 'utf8', timeout: 3000 });
        var lines = whereOutput.split('\n');
        for (var k = 0; k < lines.length; k++) {
            var line = lines[k].trim();
            if (line && fs.existsSync(line)) {
                possiblePaths.push(line);
            }
        }
    } catch (e) {}

    if (possiblePaths.length === 0) return null;

    possiblePaths.sort();
    possiblePaths.reverse();
    return possiblePaths[0];
}

// aerender.exe is just a thin launcher — the actual rendering happens in a
// separate process it spawns (AfterFX.com on Windows). Node's proc.kill()
// only terminates the immediate process, not its children, so a plain kill
// leaves that render host orphaned and running in the background even after
// aerender.exe itself is gone. taskkill's /T flag kills the whole tree.
function killProcessTree(targetProc) {
    if (!targetProc || !targetProc.pid) return;

    if (process.platform === 'win32') {
        // Fire-and-forget: don't block the panel's UI thread waiting on
        // taskkill to finish. Cleanup below retries with backoff, so the
        // exact moment this completes doesn't matter.
        exec('taskkill /PID ' + targetProc.pid + ' /T /F', function () {});
        return;
    }

    try {
        if (!targetProc.killed) targetProc.kill('SIGKILL');
    } catch (e) {}
}

function deleteFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {}
}

function deleteFolderRecursive(folderPath) {
    try {
        if (!folderPath || !fs.existsSync(folderPath)) return;
        if (typeof fs.rmSync === 'function') {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return;
        }
    } catch (e) {}

    // Fallback for older bundled Node runtimes without fs.rmSync.
    try {
        var entries = fs.readdirSync(folderPath);
        for (var i = 0; i < entries.length; i++) {
            var full = path.join(folderPath, entries[i]);
            var stat = fs.statSync(full);
            if (stat.isDirectory()) {
                deleteFolderRecursive(full);
            } else {
                try { fs.unlinkSync(full); } catch (e) {}
            }
        }
        fs.rmdirSync(folderPath);
    } catch (e) {}
}

function cleanupTempFiles(config) {
    if (config && config.autoCleanup === false) {
        // Auto-cleanup is off — leave the rendered frames/audio on disk.
        // Applies uniformly regardless of how the render ended (success,
        // failure, or manual cancel), since all three paths call this same
        // function with the same config object.
        return;
    }

    var attempts    = 0;
    var maxAttempts = 6;    // ~3 seconds of retrying total
    var delayMs     = 500;  // gives Windows time to release the killed process's file handles

    function stillPresent() {
        return (config.frameDir && fs.existsSync(config.frameDir)) ||
               (config.audioTempPath && fs.existsSync(config.audioTempPath));
    }

    function tryOnce() {
        attempts++;
        deleteFolderRecursive(config.frameDir);
        deleteFile(config.audioTempPath);

        if (stillPresent() && attempts < maxAttempts) {
            setTimeout(tryOnce, delayMs);
        }
    }

    tryOnce();
}

// Scans the rendered frame folder for files matching "<prefix><digits>.png",
// and returns the numbering info FFmpeg needs to read them back as a sequence.
function scanFrameSequence(frameDir, framePrefix) {
    if (!fs.existsSync(frameDir)) return null;

    var escapedPrefix = framePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('^' + escapedPrefix + '(\\d+)\\.png$', 'i');

    var files  = fs.readdirSync(frameDir);
    var frames = [];
    for (var i = 0; i < files.length; i++) {
        var match = files[i].match(re);
        if (match) {
            frames.push({ num: parseInt(match[1], 10), digits: match[1].length });
        }
    }

    if (frames.length === 0) return null;

    frames.sort(function (a, b) { return a.num - b.num; });

    return {
        startNumber: frames[0].num,
        padWidth:    frames[0].digits,
        count:       frames.length
    };
}

function runAERender(config, progressCallback, callback, autoCleanup) {
    // Stamped onto config once here rather than threaded through every
    // function's parameters — killAll() below and runFFmpeg's finish()
    // (success and failure both) all already share this same config object,
    // so cleanupTempFiles() can just read it off config wherever it's called.
    config.autoCleanup = (autoCleanup !== false);

    var aerenderPath = findAERenderPath();
    if (!aerenderPath) {
        callback(new Error(
            'Could not find aerender.exe.\n' +
            'Ensure After Effects is installed under C:\\Program Files\\Adobe.'
        ));
        return null;
    }

    var progressState = {
        aeStartTime:     Date.now(),  // AE phase clock starts now, not at frame 1
        aeElapsedFinal:  null,        // locked to an exact value once AE exits
        ffmpegStartTime: null,
        lastPercent:     0
    };

    var args = [
        '-project', config.projectPath
    ];

    var proc;
    try {
        proc = spawn(aerenderPath, args, { windowsHide: false });
    } catch (e) {
        callback(new Error('Failed to launch aerender: ' + e.message));
        return null;
    }

    var callbackFired = false;
    var ffmpegProc    = null;

    function fireCallback(err) {
        if (callbackFired) return;
        callbackFired = true;

        killProcessTree(proc);
        killProcessTree(ffmpegProc);

        callback(err);
    }

    proc.killAll = function() {
        // Mark this render as finished up front so any 'exit'/'error' events
        // that arrive later (from either process, asynchronously, as a
        // result of the kill below) don't also fire the normal
        // success/failure callback and surface a spurious alert.
        callbackFired = true;

        // taskkill terminates the processes, but any stdout/stderr chunks
        // that were already sitting in the OS pipe buffer before the kill
        // still get delivered to these listeners afterward. Without this,
        // a stale progress chunk can arrive right after the panel has
        // already reset to 0% and snap the bar back to a leftover value.
        if (proc.stdout) proc.stdout.removeAllListeners('data');
        if (proc.stderr) proc.stderr.removeAllListeners('data');
        if (ffmpegProc && ffmpegProc.stderr) ffmpegProc.stderr.removeAllListeners('data');

        killProcessTree(proc);
        killProcessTree(ffmpegProc);

        // A cancelled render is fully abandoned — clean up whatever
        // frames/audio had been rendered so far rather than leaving them
        // on disk.
        cleanupTempFiles(config);
    };

    var stdoutBuf  = '';
    var stderrBuf  = '';
    var lastFrame  = 0;

    proc.stdout.on('data', function (chunk) {
        var text = chunk.toString();
        stdoutBuf += text;

        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var match = lines[i].match(/\((\d+)\):/);
            if (match && config.totalFrames > 0) {
                var frameNum = parseInt(match[1], 10);
                if (frameNum > lastFrame) {
                    lastFrame = frameNum;

                    var elapsedMs       = Date.now() - progressState.aeStartTime;
                    var compSecondsDone = Math.min(frameNum / config.framerate, config.duration);
                    var fraction        = config.duration > 0 ? (compSecondsDone / config.duration) : 0;

                    if (fraction > 0) {
                        // Extrapolate the AE phase's total duration from
                        // how much comp-time we've covered so far, at the
                        // rate we've covered it. FFmpeg hasn't reported
                        // anything yet at this point, so — rather than
                        // inventing a number — assume it takes roughly as
                        // long as rendering has; this neutral prior gets
                        // overwritten with FFmpeg's real measured rate the
                        // instant that phase starts reporting (see
                        // runFFmpeg below), so early inaccuracy in this
                        // guess self-corrects instead of compounding.
                        var t1Estimate    = elapsedMs / fraction;
                        var t2Estimate    = t1Estimate;
                        var totalEstimate = t1Estimate + t2Estimate;
                        var rawPercent    = totalEstimate > 0 ? (elapsedMs / totalEstimate) * 100 : 0;
                        var etaMs         = Math.max(0, totalEstimate - elapsedMs);

                        progressCallback(clampMonotonic(progressState, rawPercent), 'ae', etaMs);
                    }
                }
            }
        }
    });

    proc.stderr.on('data', function (chunk) {
        stderrBuf += chunk.toString();
    });

    proc.on('error', function (err) {
        fireCallback(new Error('aerender process error: ' + err.message));
    });

    proc.on('exit', function (code) {
        if (callbackFired) return;

        if (code !== 0) {
            var errorLines = (stdoutBuf + '\n' + stderrBuf)
                .split('\n')
                .filter(function(l) { return l.trim(); })
                .slice(-20)
                .join('\n');
            return fireCallback(new Error(
                'aerender exited with code ' + code + '.\n\n' +
                (errorLines || '(no output captured)')
            ));
        }

        var hasFrames = fs.existsSync(config.frameDir) &&
                        fs.readdirSync(config.frameDir).length > 0;
        if (!hasFrames) {
            return fireCallback(new Error(
                'aerender reported success but no rendered frames were found in:\n' +
                config.frameDir
            ));
        }

        if (!fs.existsSync(config.audioTempPath)) {
            return fireCallback(new Error(
                'aerender reported success but the audio file was not found at:\n' +
                config.audioTempPath
            ));
        }

        // AE is genuinely done now — this is no longer an estimate, so
        // lock it in as the exact known duration of phase 1. Everything
        // FFmpeg reports from here on is weighed against this real number.
        progressState.aeElapsedFinal = Date.now() - progressState.aeStartTime;

        ffmpegProc = runFFmpeg(config, progressState, progressCallback, fireCallback);
    });

    return proc;
}

function runFFmpeg(config, progressState, progressCallback, callback) {
    var ffmpegPath = path.join(config.extensionPath, 'bin', 'ffmpeg.exe');

    if (!fs.existsSync(ffmpegPath)) {
        cleanupTempFiles(config);
        callback(new Error('ffmpeg.exe not found at:\n' + ffmpegPath));
        return null;
    }

    var seqInfo = scanFrameSequence(config.frameDir, config.framePrefix);
    if (!seqInfo) {
        cleanupTempFiles(config);
        callback(new Error('No rendered frames found in:\n' + config.frameDir));
        return null;
    }

    var imageSeqPattern = path.join(
        config.frameDir,
        config.framePrefix + '%0' + seqInfo.padWidth + 'd.png'
    );

    var videoFlags = (Array.isArray(config.ffmpegFlags) && config.ffmpegFlags.length > 0)
        ? config.ffmpegFlags
        : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p'];

    // Two inputs: the lossless PNG sequence (video) and the lossless WAV
    // (audio), rendered concurrently by After Effects as two output modules
    // of the same render-queue item. FFmpeg does the one and only lossy
    // encode pass here, muxing both into the final MP4.
    var args = [
        '-y',
        '-framerate',    String(config.framerate),
        '-start_number', String(seqInfo.startNumber),
        '-i',            imageSeqPattern,
        '-i',            config.audioTempPath
    ]
        .concat(videoFlags)
        .concat([
            '-map',      '0:v:0',
            '-map',      '1:a:0',
            '-c:a',      'aac',
            '-b:a',      '192k',
            '-ac',       '2',
            '-movflags', '+faststart',
            config.outputPath
        ]);

    var proc;
    try {
        proc = spawn(ffmpegPath, args, { windowsHide: false });
    } catch (e) {
        cleanupTempFiles(config);
        callback(new Error('Failed to launch FFmpeg: ' + e.message));
        return null;
    }

    var done             = false;
    var ffmpegErrBuf     = '';
    var processedSeconds = 0;

    function finish(err) {
        if (done) return;
        done = true;
        cleanupTempFiles(config);
        callback(err || null);
    }

    proc.stderr.on('data', function (chunk) {
        var text = chunk.toString();
        ffmpegErrBuf += text;

        var timeMatch  = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/);
        var speedMatch = text.match(/speed=\s*([\d.]+)x/);

        if (timeMatch && config.duration > 0) {
            var hours   = parseInt(timeMatch[1], 10);
            var minutes = parseInt(timeMatch[2], 10);
            var seconds = parseInt(timeMatch[3], 10);
            processedSeconds = hours * 3600 + minutes * 60 + seconds;

            if (progressState.ffmpegStartTime === null) {
                progressState.ffmpegStartTime = Date.now();
            }
            var ffmpegElapsedMs = Date.now() - progressState.ffmpegStartTime;
            var t1Final         = progressState.aeElapsedFinal || 0;

            var speed = speedMatch ? parseFloat(speedMatch[1]) : NaN;
            var t2Estimate;
            if (!isNaN(speed) && speed > 0) {
                // FFmpeg's own real-time factor: comp-seconds processed per
                // wall-clock second. This is measured, not guessed, so it's
                // the most accurate estimate available for this phase —
                // and it corrects the symmetric prior phase 1 assumed.
                t2Estimate = (config.duration / speed) * 1000;
            } else {
                // speed= hasn't appeared yet (first line or two) —
                // extrapolate from progress made so far in this phase,
                // same technique phase 1 uses, rather than guessing.
                var localFraction = Math.min(processedSeconds / config.duration, 1);
                t2Estimate = localFraction > 0 ? (ffmpegElapsedMs / localFraction) : t1Final;
            }

            var totalElapsedMs  = t1Final + ffmpegElapsedMs;
            var totalEstimateMs = t1Final + t2Estimate;
            var rawPercent      = totalEstimateMs > 0 ? (totalElapsedMs / totalEstimateMs) * 100 : 0;
            var etaMs           = Math.max(0, totalEstimateMs - totalElapsedMs);

            var ratio = Math.min(processedSeconds / config.duration, 1);
            progressCallback(
                clampMonotonic(progressState, rawPercent),
                ratio >= 0.95 ? 'ffmpeg_end' : 'ffmpeg_start',
                etaMs
            );
        }
    });

    proc.on('error', function (err) {
        finish(new Error('FFmpeg process error: ' + err.message));
    });

    proc.on('exit', function (code) {
        if (code !== 0) {
            var errorLines = ffmpegErrBuf.split('\n').slice(-30).join('\n');
            finish(new Error('FFmpeg exited with code ' + code + '.\n\n' + errorLines));
        } else {
            // Genuine completion — set directly, never estimated.
            progressState.lastPercent = 100;
            progressCallback(100, 'ffmpeg_end', 0);
            finish(null);
        }
    });

    return proc;
}

module.exports = { runAERender: runAERender };
