'use strict';

var spawn = require('child_process').spawn;
var execSync = require('child_process').execSync;
var path  = require('path');
var fs    = require('fs');

var AE_PROGRESS_START     = 5;
var AE_PROGRESS_END       = 80;
var FFMPEG_PROGRESS_START = 80;
var FFMPEG_PROGRESS_END   = 98;

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

function deleteFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {}
}

function cleanupTempFiles(config) {
    deleteFile(config.aviTempPath);
}

function runAERender(config, progressCallback, callback) {
    var aerenderPath = findAERenderPath();
    if (!aerenderPath) {
        callback(new Error(
            'Could not find aerender.exe.\n' +
            'Ensure After Effects is installed under C:\\Program Files\\Adobe.'
        ));
        return null;
    }

    progressCallback(AE_PROGRESS_START, 'ae');

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
        
        if (proc && !proc.killed) {
            try { proc.kill('SIGKILL'); } catch (e) {}
        }
        if (ffmpegProc && !ffmpegProc.killed) {
            try { ffmpegProc.kill('SIGKILL'); } catch (e) {}
        }
        
        callback(err);
    }

    proc.killAll = function() {
        if (proc && !proc.killed) {
            try { proc.kill('SIGKILL'); } catch (e) {}
        }
        if (ffmpegProc && !ffmpegProc.killed) {
            try { ffmpegProc.kill('SIGKILL'); } catch (e) {}
        }
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
                    var ratio = Math.min(frameNum / config.totalFrames, 1);
                    var pct   = AE_PROGRESS_START +
                                Math.floor(ratio * (AE_PROGRESS_END - AE_PROGRESS_START));
                    progressCallback(pct, 'ae');
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

        if (!fs.existsSync(config.aviTempPath)) {
            return fireCallback(new Error(
                'aerender reported success but the AVI was not found at:\n' +
                config.aviTempPath
            ));
        }

        progressCallback(AE_PROGRESS_END, 'ffmpeg_start');
        ffmpegProc = runFFmpeg(config, progressCallback, fireCallback);
    });

    return proc;
}

function runFFmpeg(config, progressCallback, callback) {
    var ffmpegPath = path.join(config.extensionPath, 'bin', 'ffmpeg.exe');

    if (!fs.existsSync(ffmpegPath)) {
        cleanupTempFiles(config);
        callback(new Error('ffmpeg.exe not found at:\n' + ffmpegPath));
        return null;
    }

    var videoFlags = (Array.isArray(config.ffmpegFlags) && config.ffmpegFlags.length > 0)
        ? config.ffmpegFlags
        : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p'];

    var args = ['-y', '-i', config.aviTempPath]
        .concat(videoFlags)
        .concat([
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

        var timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/);
        if (timeMatch && config.duration > 0) {
            var hours   = parseInt(timeMatch[1], 10);
            var minutes = parseInt(timeMatch[2], 10);
            var seconds = parseInt(timeMatch[3], 10);
            processedSeconds = hours * 3600 + minutes * 60 + seconds;

            var ratio = Math.min(processedSeconds / config.duration, 1);
            var pct   = FFMPEG_PROGRESS_START +
                        Math.floor(ratio * (FFMPEG_PROGRESS_END - FFMPEG_PROGRESS_START));
            progressCallback(pct, ratio >= 0.95 ? 'ffmpeg_end' : 'ffmpeg_start');
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
            progressCallback(100, 'ffmpeg_end');
            finish(null);
        }
    });

    return proc;
}

module.exports = { runAERender: runAERender };
