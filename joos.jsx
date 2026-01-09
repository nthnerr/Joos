// Joos STABLE V1.0.37

(function(thisObj) {
    "use strict";

    var win = (thisObj instanceof Panel) 
        ? thisObj 
        : new Window("palette", "JOOS", undefined, { resizable: true });

    // UI
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 20;
    win.margins = [30, 35, 30, 35];

    var header = win.add("group");
    header.orientation = "column";
    header.alignChildren = ["center", "top"];
    header.spacing = 2;
    
    var title = header.add("statictext", undefined, "JOOS");
    title.graphics.font = ScriptUI.newFont("sans", "BOLD", 22);
    
    var version = header.add("statictext", undefined, "STABLE V1.0.37");
    version.graphics.foregroundColor = win.graphics.newPen(win.graphics.PenType.SOLID_COLOR, [0.45, 0.45, 0.45, 1], 1);

    win.add("panel").alignment = "fill";

    var exportBtn = win.add("button", undefined, "START EXPORT");
    exportBtn.preferredSize.height = 55;
    exportBtn.graphics.font = ScriptUI.newFont("sans", "BOLD", 14);

    var monitorArea = win.add("group");
    monitorArea.orientation = "column";
    monitorArea.alignChildren = ["fill", "center"];
    monitorArea.spacing = 15;
    monitorArea.margins = [0, 5, 0, 0];

    var statusText = monitorArea.add("statictext", undefined, "SYSTEM IDLE", { alignment: "center" });
    statusText.graphics.font = ScriptUI.newFont("sans", "REGULAR", 11);
    
    var pBar = monitorArea.add("progressbar", undefined, 0, 100);
    pBar.preferredSize.height = 10;

    // LOGIC AND HELPERS
    var CONFIG = {
        internalPath: null,
        isWin: $.os.toLowerCase().indexOf('windows') !== -1,
        templateName: "JOOS_LOSSLESS_ENC"
    };

    var Utils = {
        getBinary: function() {
            try {
                var scriptFile = new File($.fileName);
                if (!scriptFile.exists) return null;
                var binName = CONFIG.isWin ? "/bin/ffmpeg.exe" : "/bin/ffmpeg";
                var f = new File(scriptFile.parent.fsName + binName);
                return f.exists ? f.fsName : null;
            } catch (e) { return null; }
        },

        updateUI: function(val, msg) {
            pBar.value = val;
            statusText.text = msg.toUpperCase();
            win.layout.layout(true);
        },

        cleanup: function(file) {
            if (file && file.exists) {
                try { file.remove(); } catch (e) { /* Locked by OS */ }
            }
        }
    };

    function ensureTemplate() {
        var dummyComp = app.project.items.addComp("JOOS_TEMP_AUTOGEN", 16, 16, 1, 1, 1);
        var rqItem = app.project.renderQueue.items.add(dummyComp);
        var om = rqItem.outputModule(1);
        var exists = false;
        for (var i = 0; i < om.templates.length; i++) {
            if (om.templates[i] === CONFIG.templateName) { exists = true; break; }
        }
        if (!exists) {
            om.applyTemplate("Lossless");
            om.saveAsTemplate(CONFIG.templateName);
        }
        rqItem.remove();
        dummyComp.remove();
        return CONFIG.templateName;
    }

    function runProcess() {
        var activeComp = app.project.activeItem;
        
        if (!activeComp || !(activeComp instanceof CompItem)) {
            alert("JOOS: Please select a valid Composition.");
            return;
        }

        CONFIG.internalPath = Utils.getBinary();
        if (!CONFIG.internalPath) {
            alert("JOOS ERROR: System binary missing in /bin/ directory.");
            return;
        }

        var targetFile = File.saveDialog("EXPORT FINAL MP4", activeComp.name + ".mp4");
        if (!targetFile) return;

        exportBtn.enabled = false;
        var masterFile = null;

        try {
            Utils.updateUI(5, "PREPARING PIPELINE...");
            
            var masterExt = CONFIG.isWin ? "_JTEMP.avi" : "_JTEMP.mov";
            masterFile = new File(targetFile.fsName.replace(/\.mp4$/i, "") + masterExt);

            var rqItem = app.project.renderQueue.items.add(activeComp);
            var om = rqItem.outputModule(1);
            om.applyTemplate(ensureTemplate());
            om.file = masterFile;

            Utils.updateUI(20, "RENDERING MASTER...");
            app.project.renderQueue.render();

            Utils.updateUI(80, "ENCODING MP4...");
            var args = [
                '"' + CONFIG.internalPath + '"',
                '-y -i "' + masterFile.fsName + '"',
                '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p',
                '-c:a aac -b:a 192k -movflags +faststart',
                '"' + targetFile.fsName + '"'
            ].join(" ");

            var result = system.callSystem(args);

            if (targetFile.exists) {
                Utils.cleanup(masterFile);
                Utils.updateUI(100, "EXPORT COMPLETE");
                alert("JOOS: Process finished successfully.");
            } else {
                throw new Error("Target file not generated. Check permissions.");
            }

        } catch (err) {
            alert("JOOS SYSTEM ERROR:\n" + err.toString());
            Utils.updateUI(0, "PROCESS HALTED");
        } finally {
            exportBtn.enabled = true;

            $.sleep(1500);
            Utils.updateUI(0, "SYSTEM READY");
        }
    }

    // BOOTSTRAP
    exportBtn.onClick = runProcess;
    win.onResizing = win.onResize = function() { this.layout.resize(); };

    win.layout.layout(true);
    if (win instanceof Window) win.show();

    // LAUNCH VERIFICATION
    if (Utils.getBinary()) {
        Utils.updateUI(0, "SYSTEM READY");
    } else {
        Utils.updateUI(0, "BINARY ERROR");
    }

})(this);
