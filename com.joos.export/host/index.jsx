"use strict";

var ERROR_CODES = {
  NO_COMPOSITION: "E001",
  PROJECT_NOT_SAVED: "E002",
  CANCELLED: "E003",
  NO_AERENDER: "E004",
};

function writeDebugLog(message) {
  try {
    var extScript = new File($.fileName);
    var extFolder = extScript.parent;
    var debugFile = new File(extFolder.fsName + "/.debug");
    debugFile.encoding = "UTF-8";
    debugFile.open("a");
    var timestamp = new Date().toISOString();
    debugFile.writeln("[" + timestamp + "] [JSX] " + message);
    debugFile.close();
  } catch (e) {}
}

function joos_get_export_info() {
  try {
    writeDebugLog("=== EXPORT SETUP STARTED ===");
    var activeComp = app.project.activeItem;
    if (!activeComp || !(activeComp instanceof CompItem)) {
      writeDebugLog("ERROR: No composition selected");
      return JSON.stringify({
        status: "error",
        code: ERROR_CODES.NO_COMPOSITION,
        message:
          "Please select a composition before exporting.\n\nHow to fix:\n• Click a composition in the Project panel\n• Or select one in the Timeline",
      });
    }

    if (!app.project.file) {
      writeDebugLog("ERROR: Project not saved");
      return JSON.stringify({
        status: "error",
        code: ERROR_CODES.PROJECT_NOT_SAVED,
        message:
          "Save your project before exporting.\n\nQuick action:\n• Press Ctrl+S to save\n• Or go to File → Save Project",
      });
    }

    writeDebugLog("Composition: " + activeComp.name);
    writeDebugLog("Resolution: " + activeComp.width + "x" + activeComp.height);
    writeDebugLog("Frame Rate: " + activeComp.frameRate + " fps");
    writeDebugLog("Duration: " + activeComp.duration.toFixed(2) + "s");
    writeDebugLog("Project: " + app.project.file.fsName);

    var outputFile = File.saveDialog(
      "Save MP4 as...",
      activeComp.name + ".mp4",
    );
    if (!outputFile) {
      writeDebugLog("Export cancelled by user");
      return JSON.stringify({
        status: "error",
        code: ERROR_CODES.CANCELLED,
        message: "Export cancelled",
      });
    }

    var outputPath = outputFile.fsName;
    if (!outputPath.match(/\.mp4$/i)) {
      outputPath += ".mp4";
      outputFile = new File(outputPath);
    }

    var timestamp = new Date().getTime();
    var tempFolderPath = outputFile.parent.fsName + "/joos_temp_" + timestamp;
    var tempFolder = new Folder(tempFolderPath);

    if (!tempFolder.exists && !tempFolder.create()) {
      writeDebugLog("ERROR: Could not create temp folder: " + tempFolderPath);
      return JSON.stringify({
        status: "error",
        message:
          "Failed to create temporary export folder.\n\nPossible causes:\n• Insufficient disk space\n• No write permissions\n• Folder path: " +
          tempFolderPath,
      });
    }

    var aerenderPath = findAerenderPath();
    if (!aerenderPath) {
      writeDebugLog("ERROR: aerender not found");
      return JSON.stringify({
        status: "error",
        code: ERROR_CODES.NO_AERENDER,
        message:
          "Cannot find After Effects renderer (aerender.exe).\n\nWhat to try:\n• Restart After Effects\n• Reinstall After Effects if issue persists",
      });
    }

    var aviPath = tempFolderPath + "/intermediate.avi";
    writeDebugLog("Output file: " + outputPath);
    writeDebugLog("Temp folder: " + tempFolderPath);
    writeDebugLog("aerender path: " + aerenderPath);

    var setupResult = setupRenderQueue(activeComp, aviPath);

    if (!setupResult.success) {
      writeDebugLog("ERROR: Render queue setup failed - " + setupResult.error);
      return JSON.stringify({
        status: "error",
        message:
          "Failed to configure render queue.\n\nWhat to try:\n• Close and reopen this panel\n• Check your composition settings\n\nError details: " +
          setupResult.error,
      });
    }

    app.project.save();
    writeDebugLog("Setup completed successfully");

    return JSON.stringify({
      status: "success",
      projectPath: app.project.file.fsName,
      compName: activeComp.name,
      width: activeComp.width,
      height: activeComp.height,
      frameRate: activeComp.frameRate,
      duration: activeComp.duration,
      outputFile: outputPath,
      tempFolder: tempFolderPath,
      aviFile: aviPath,
      aerenderPath: aerenderPath,
    });
  } catch (e) {
    writeDebugLog(
      "ERROR: Unexpected error - " + e.toString() + " (Line: " + e.line + ")",
    );
    return JSON.stringify({
      status: "error",
      message:
        "Something went wrong during export setup.\n\nWhat to try:\n• Try exporting again\n• Restart After Effects\n• Check the .debug file for details\n\nError: " +
        e.toString() +
        " (Line " +
        e.line +
        ")",
    });
  }
}

function setupRenderQueue(comp, aviPath) {
  try {
    while (app.project.renderQueue.numItems > 0) {
      app.project.renderQueue.item(1).remove();
    }

    var renderItem = app.project.renderQueue.items.add(comp);
    renderItem.applyTemplate("Best Settings");

    var om = renderItem.outputModule(1);

    try {
      var settings = om.getSettings(GetSettingsFormat.SPEC);
      settings["Format"] = "AVI";
      settings["Include Audio"] = false;

      if (settings.hasOwnProperty("Video Output")) {
        settings["Video Output"] = true;
      }

      om.setSettings(settings);
      om.file = new File(aviPath);
      writeDebugLog("Applied AVI settings via Property Injection");
    } catch (e) {
      writeDebugLog("WARNING: Failed to set AVI settings - " + e.toString());
      om.format = "AVI";
      om.file = new File(aviPath);
    }

    renderItem.render = true;

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function findAerenderPath() {
  var isWin = $.os.toLowerCase().indexOf("windows") !== -1;
  var isMac = $.os.toLowerCase().indexOf("mac") !== -1;

  if (isWin) {
    var binName = "aerender.exe";
    var aeFolder = new File(app.path).parent;

    var supportFiles = new Folder(aeFolder.fsName + "/Support Files");
    if (supportFiles.exists) {
      var aerender = new File(supportFiles.fsName + "/" + binName);
      if (aerender.exists) return aerender.fsName;
    }

    var aerender = new File(aeFolder.fsName + "/" + binName);
    if (aerender.exists) return aerender.fsName;

    var parentFolder = aeFolder.parent;
    if (parentFolder) {
      aerender = new File(parentFolder.fsName + "/" + binName);
      if (aerender.exists) return aerender.fsName;
    }
  } else if (isMac) {
    var binName = "aerender";
    var macOSFolder = new File(app.path).parent;

    var aerender = new File(macOSFolder.fsName + "/" + binName);
    if (aerender.exists) return aerender.fsName;

    var contentsFolder = macOSFolder.parent;
    if (contentsFolder) {
      aerender = new File(contentsFolder.fsName + "/MacOS/" + binName);
      if (aerender.exists) return aerender.fsName;
    }
  }

  return null;
}

function showError(title, message) {
  var dialog = new Window("dialog", "JOOS v1.1");
  dialog.alignChildren = ["fill", "top"];
  dialog.spacing = 0;
  dialog.margins = 0;

  var mainPanel = dialog.add("panel");
  mainPanel.alignChildren = ["fill", "top"];
  mainPanel.spacing = 15;
  mainPanel.margins = 20;

  var titleGroup = mainPanel.add("group");
  titleGroup.alignChildren = ["left", "center"];
  titleGroup.spacing = 8;

  var iconText = titleGroup.add("statictext", undefined, "⚠");
  iconText.graphics.font = ScriptUI.newFont("Arial", "BOLD", 18);

  var titleText = titleGroup.add("statictext", undefined, title);
  titleText.graphics.font = ScriptUI.newFont("Arial", "BOLD", 14);

  var messageText = mainPanel.add("statictext", undefined, message, {
    multiline: true,
  });
  messageText.graphics.font = ScriptUI.newFont("Arial", "REGULAR", 12);
  messageText.preferredSize.width = 400;

  var divider = mainPanel.add("panel");
  divider.preferredSize.height = 1;
  divider.alignment = ["fill", "top"];

  var buttonGroup = mainPanel.add("group");
  buttonGroup.alignment = ["center", "top"];
  buttonGroup.spacing = 10;

  var okButton = buttonGroup.add("button", undefined, "OK", { name: "ok" });
  okButton.preferredSize.width = 120;
  okButton.preferredSize.height = 32;

  okButton.onClick = function () {
    dialog.close();
  };

  dialog.show();
}
