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

function installOutputModuleTemplate() {
    if (templateExists('joosOutput')) return true;

    var templateFile = new File(JOOS_EXTENSION_ROOT + '/assets/outputModule.aep');
    if (!templateFile.exists) return false;

    var importedRQItem  = null;
    var importedComp    = null;
    var sentinel        = '__joos_import_' + (new Date()).getTime() + '__';
    var itemCountBefore = app.project.numItems;

    try {
        var opts = new ImportOptions(templateFile);
        opts.importAs = ImportAsType.PROJECT;
        app.project.importFile(opts);

        importedRQItem = app.project.renderQueue.item(
            app.project.renderQueue.numItems
        );
        if (!importedRQItem) return false;

        for (var i = app.project.numItems; i > itemCountBefore; i--) {
            var itm = app.project.item(i);
            if (itm && (itm instanceof CompItem)) {
                itm.name     = sentinel;
                importedComp = itm;
            }
        }

        importedRQItem.outputModule(1).saveAsTemplate('joosOutput');
        return true;

    } catch (e) {
        return false;
    } finally {
        try { if (importedRQItem) importedRQItem.remove(); } catch (e) {}
        try { if (importedComp)   importedComp.remove();   } catch (e) {}
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

function joos_export(ffmpegFlagsJson) {
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

        if (!installOutputModuleTemplate()) {
            return joosStringify({
                success: false,
                error: 'Failed to install the Joos output-module template.\n' +
                       'Ensure assets/outputModule.aep exists in:\n' +
                       JOOS_EXTENSION_ROOT
            });
        }

        var outputFile = File.saveDialog('Save exported video as\u2026', 'MP4 Video:*.mp4');
        if (!outputFile) {
            clearRenderQueue();
            return joosStringify({ success: false, error: 'Export cancelled.' });
        }

        var outputPath = outputFile.fsName;
        if (!outputPath.match(/\.mp4$/i)) outputPath += '.mp4';

        var ts          = (new Date()).getTime();
        var outputDir   = outputFile.parent.fsName;
        var aviTempFile = new File(outputDir + '\\joos_temp_' + ts + '.avi');

        var rqItem = app.project.renderQueue.items.add(comp);
        rqItem.outputModule(1).applyTemplate('joosOutput');
        rqItem.outputModule(1).file = aviTempFile;

        var rqIndex     = rqItem.index;
        var projectPath = app.project.file.fsName;

        app.project.save();

        return joosStringify({
            success:       true,
            projectPath:   projectPath,
            outputPath:    outputPath,
            outputDir:     outputDir,
            aviTempPath:   aviTempFile.fsName,
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
