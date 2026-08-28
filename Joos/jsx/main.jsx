try {
    var _joosExternalLib = new ExternalObject('lib:PlugPlugExternalObject');
} catch (e) {}

if (typeof JOOS_EXTENSION_ROOT === 'undefined') {
    JOOS_EXTENSION_ROOT = '';
}

function joosStringify(val) {
    var t = typeof val;
    if (val === null)    return 'null';
    if (t === 'boolean') return val ? 'true' : 'false';
    if (t === 'number')  return isFinite(val) ? String(val) : 'null';
    if (t === 'string') {
        return '"' + val
            .replace(/\\/g, '\\\\')
            .replace(/"/g,  '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t') + '"';
    }
    if (val instanceof Array) {
        var aOut = [];
        for (var ai = 0; ai < val.length; ai++) aOut.push(joosStringify(val[ai]));
        return '[' + aOut.join(',') + ']';
    }
    if (t === 'object') {
        var oOut = [];
        for (var key in val) {
            if (val.hasOwnProperty(key))
                oOut.push(joosStringify(String(key)) + ':' + joosStringify(val[key]));
        }
        return '{' + oOut.join(',') + '}';
    }
    return 'null';
}

function clearRenderQueue() {
    var rq = app.project.renderQueue;
    for (var i = rq.numItems; i >= 1; i--) {
        try { rq.item(i).remove(); } catch (e) {}
    }
}

function templateExists(templateName) {
    var tempComp   = null;
    var tempRQItem = null;
    try {
        tempComp   = app.project.items.addComp('__joos_check__', 1920, 1080, 1, 1, 30);
        tempRQItem = app.project.renderQueue.items.add(tempComp);
        var templates = tempRQItem.outputModule(1).templates;
        for (var i = 0; i < templates.length; i++) {
            if (templates[i] === templateName) return true;
        }
        return false;
    } catch (e) {
        return false;
    } finally {
        try { if (tempRQItem) tempRQItem.remove(); } catch (e) {}
        try { if (tempComp)   tempComp.remove();   } catch (e) {}
    }
}

var JOOS_VIDEO_TEMPLATE = 'joosVideoOutput';
var JOOS_AUDIO_TEMPLATE = 'joosAudioOutput';

// outputModule.aep is expected to contain exactly two render-queue items,
// in this order:
//   1) video config — Output Module format "PNG Sequence", Audio Output off
//   2) audio config — Output Module format "WAV", Video Output off,
//      Audio Output on (recommended: 48kHz / 16-bit / Stereo PCM)
// Each is registered as a reusable output-module template so later exports
// can just call outputModule.applyTemplate(name) without re-importing.
function installOutputModuleTemplates() {
    if (templateExists(JOOS_VIDEO_TEMPLATE) && templateExists(JOOS_AUDIO_TEMPLATE)) {
        return true;
    }

    var templateFile = new File(JOOS_EXTENSION_ROOT + '/assets/outputModule.aep');
    if (!templateFile.exists) return false;

    var importedRQItems = [];
    var importedComps   = [];
    var sentinel         = '__joos_import_' + (new Date()).getTime() + '__';
    var itemCountBefore  = app.project.numItems;
    var rqCountBefore    = app.project.renderQueue.numItems;

    try {
        var opts = new ImportOptions(templateFile);
        opts.importAs = ImportAsType.PROJECT;
        app.project.importFile(opts);

        for (var r = rqCountBefore + 1; r <= app.project.renderQueue.numItems; r++) {
            importedRQItems.push(app.project.renderQueue.item(r));
        }

        for (var i = app.project.numItems; i > itemCountBefore; i--) {
            var itm = app.project.item(i);
            if (itm && (itm instanceof CompItem)) {
                itm.name = sentinel;
                importedComps.push(itm);
            }
        }

        if (importedRQItems.length < 2) return false;

        if (!templateExists(JOOS_VIDEO_TEMPLATE)) {
            importedRQItems[0].outputModule(1).saveAsTemplate(JOOS_VIDEO_TEMPLATE);
        }
        if (!templateExists(JOOS_AUDIO_TEMPLATE)) {
            importedRQItems[1].outputModule(1).saveAsTemplate(JOOS_AUDIO_TEMPLATE);
        }

        return templateExists(JOOS_VIDEO_TEMPLATE) && templateExists(JOOS_AUDIO_TEMPLATE);

    } catch (e) {
        return false;
    } finally {
        for (var rr = 0; rr < importedRQItems.length; rr++) {
            try { importedRQItems[rr].remove(); } catch (e) {}
        }
        for (var cc = 0; cc < importedComps.length; cc++) {
            try { importedComps[cc].remove(); } catch (e) {}
        }
    }
}

function joos_cleanup() {
    try {
        clearRenderQueue();
        
        for (var i = app.project.numItems; i >= 1; i--) {
            try {
                var itm = app.project.item(i);
                if (itm && itm.name && itm.name.indexOf('__joos_') === 0) {
                    itm.remove();
                }
            } catch (e) {}
        }
        
        app.project.save();
    } catch (e) {}
}

// Used by settings.js to key the "remember last used settings per project"
// feature. Returns path: null (not an error) for an unsaved project, since
// that's a normal state, not a failure.
function joos_getProjectPath() {
    try {
        if (app.project && app.project.file) {
            return joosStringify({ success: true, path: app.project.file.fsName });
        }
        return joosStringify({ success: true, path: null });
    } catch (e) {
        return joosStringify({ success: false, error: e.toString() });
    }
}

// Used by settings.js's Export Defaults > Default Output Folder "Browse…"
// button. A folder picker has to run here rather than in the CEF/Node side,
// since there's no native folder-picker API available there.
function joos_selectOutputFolder() {
    try {
        var folder = Folder.selectDialog('Choose a default output folder\u2026');
        if (!folder) {
            return joosStringify({ success: false, cancelled: true });
        }
        return joosStringify({ success: true, path: folder.fsName });
    } catch (e) {
        return joosStringify({ success: false, error: e.toString() });
    }
}

function joos_export(ffmpegFlagsJson, defaultFolder) {
    try {
        if (!app.project || !app.project.file) {
            return joosStringify({
                success: false,
                error: 'Please save your project before exporting.'
            });
        }

        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return joosStringify({
                success: false,
                error: 'Please select a composition in the Project or Timeline panel.'
            });
        }

        var ffmpegFlags;
        try {
            ffmpegFlags = eval('(' + ffmpegFlagsJson + ')');
            if (!(ffmpegFlags instanceof Array)) throw new Error('not an array');
        } catch (e) {
            return joosStringify({
                success: false,
                error: 'Internal error: malformed ffmpegFlags — ' + e.toString()
            });
        }

        clearRenderQueue();

        if (!installOutputModuleTemplates()) {
            return joosStringify({
                success: false,
                error: 'Failed to install the Joos output-module templates.\n' +
                       'Ensure assets/outputModule.aep exists in:\n' +
                       JOOS_EXTENSION_ROOT +
                       '\nand contains a video (PNG Sequence) and an audio (WAV) output module.'
            });
        }

        // Seed the save dialog's starting folder + suggested filename via
        // the instance method File.saveDlg() — the static File.saveDialog()
        // has no way to pre-select a folder at all. Falls back through:
        // configured default folder (if it still exists) -> the project's
        // own folder -> the user's Documents folder.
        var seedFolderPath = (defaultFolder && defaultFolder.length > 0 && new Folder(defaultFolder).exists)
            ? defaultFolder
            : (app.project.file.parent ? app.project.file.parent.fsName : Folder.myDocuments.fsName);
        var seedFileName = (comp.name || 'export') + '.mp4';
        var seedFile      = new File(seedFolderPath + '\\' + seedFileName);

        var outputFile = seedFile.saveDlg('Save exported video as\u2026', 'MP4 Video:*.mp4');
        if (!outputFile) {
            clearRenderQueue();
            return joosStringify({ success: false, error: 'Export cancelled.' });
        }

        var outputPath = outputFile.fsName;
        if (!outputPath.match(/\.mp4$/i)) outputPath += '.mp4';

        var ts        = (new Date()).getTime();
        var outputDir = outputFile.parent.fsName;

        var frameFolder = new Folder(outputDir + '\\joos_frames_' + ts);
        if (!frameFolder.exists && !frameFolder.create()) {
            clearRenderQueue();
            return joosStringify({
                success: false,
                error: 'Failed to create temp frames folder:\n' + frameFolder.fsName
            });
        }

        var framePrefix   = 'frame_';
        var framePattern  = frameFolder.fsName + '\\' + framePrefix + '[#####].png';
        var audioTempFile = new File(outputDir + '\\joos_audio_' + ts + '.wav');

        var rqItem = app.project.renderQueue.items.add(comp);

        // Output module 1: lossless PNG sequence, no audio.
        rqItem.outputModule(1).applyTemplate(JOOS_VIDEO_TEMPLATE);
        rqItem.outputModule(1).file = new File(framePattern);

        // Output module 2: lossless WAV audio, no video.
        var audioOM = rqItem.outputModules.add();
        audioOM.applyTemplate(JOOS_AUDIO_TEMPLATE);
        audioOM.file = audioTempFile;

        var rqIndex     = rqItem.index;
        var projectPath = app.project.file.fsName;

        app.project.save();

        return joosStringify({
            success:       true,
            projectPath:   projectPath,
            outputPath:    outputPath,
            outputDir:     outputDir,
            frameDir:      frameFolder.fsName,
            framePrefix:   framePrefix,
            audioTempPath: audioTempFile.fsName,
            rqIndex:       rqIndex,
            framerate:     comp.frameRate,
            duration:      comp.duration,
            totalFrames:   Math.ceil(comp.duration * comp.frameRate),
            ffmpegFlags:   ffmpegFlags,
            extensionPath: JOOS_EXTENSION_ROOT
        });

    } catch (e) {
        return joosStringify({ success: false, error: e.toString() });
    }
}
