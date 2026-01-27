(function () {
  const cs = new CSInterface();
  const path = require("path");

  function writeDebugLog(message) {
    const escapedMessage = message
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
    cs.evalScript('writeDebugLog("[JS] ' + escapedMessage + '")');
  }

  function showError(title, message) {
    writeDebugLog("ERROR: " + title + " - " + message);
    const escapedTitle = title
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
    const escapedMessage = message
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
    cs.evalScript(
      'showError("' + escapedTitle + '", "' + escapedMessage + '")',
    );
  }

  window.addEventListener("error", function (event) {
    event.preventDefault();
    const errorMsg =
      event.error?.message || event.message || "An unexpected error occurred.";
    writeDebugLog("JavaScript Error: " + errorMsg);
    showError("JavaScript Error", errorMsg);
    return true;
  });

  window.addEventListener("unhandledrejection", function (event) {
    event.preventDefault();
    const reason =
      event.reason?.message || event.reason || "An unexpected error occurred.";
    writeDebugLog("Promise Rejection: " + reason);
    showError("Unhandled Promise Rejection", reason);
    return true;
  });

  window.alert = function (message) {
    const parts = message.split("\n\n");
    if (parts.length > 1) {
      showError(parts[0], parts.slice(1).join("\n\n"));
    } else {
      showError("Alert", message);
    }
  };

  const qualityLevels = [
    { name: "Eco", crf: 18, preset: "ultrafast" },
    { name: "Draft", crf: 16, preset: "superfast" },
    { name: "Fast", crf: 14, preset: "veryfast" },
    { name: "Standard", crf: 12, preset: "faster" },
    { name: "Balanced", crf: 10, preset: "medium" },
    { name: "High", crf: 8, preset: "slow" },
    { name: "Ultra", crf: 4, preset: "slower" },
    { name: "Production", crf: 2, preset: "veryslow" },
    { name: "Lossless", crf: 0, preset: "placebo" },
  ];

  function init() {
    const exportBtn = document.getElementById("export-btn");
    const qualitySlider = document.getElementById("quality-slider");
    const qualityName = document.getElementById("quality-name");
    const progressFill = document.getElementById("progress-fill");
    const progressPct = document.getElementById("progress-pct");
    const statusMsg = document.getElementById("status-msg");

    qualitySlider.addEventListener("input", () => {
      const level = qualityLevels[qualitySlider.value - 1];
      qualityName.textContent = level.name;
    });

    const authorLink = document.getElementById("author-link");
    if (authorLink) {
      authorLink.onclick = (e) => {
        e.preventDefault();
        cs.openURLInDefaultBrowser("https://github.com/nthnerr");
      };
    }

    exportBtn.onclick = () => {
      writeDebugLog("=== EXPORT BUTTON CLICKED ===");
      exportBtn.disabled = true;
      statusMsg.textContent = "Preparing export...";
      progressFill.style.width = "0%";
      progressPct.textContent = "0%";

      cs.evalScript("joos_get_export_info()", (result) => {
        let info;

        try {
          info = JSON.parse(result);
          writeDebugLog("Received export info from After Effects");
        } catch (e) {
          writeDebugLog(
            "Failed to parse JSON from After Effects: " + e.toString(),
          );
          showError(
            "Communication Error",
            "Failed to communicate with After Effects.\n\nWhat to try:\n• Close and reopen this panel\n• Restart After Effects",
          );
          resetUI();
          return;
        }

        if (info.status === "error") {
          if (info.code !== "E003") {
            let errorTitle = "Export Setup Failed";
            if (info.code === "E001") {
              errorTitle = "No Composition Selected";
            } else if (info.code === "E002") {
              errorTitle = "Project Not Saved";
            } else if (info.code === "E004") {
              errorTitle = "Renderer Not Found";
            }
            showError(errorTitle, info.message);
          }
          resetUI();
          return;
        }

        if (!info.aerenderPath || !info.outputFile) {
          showError(
            "Configuration Error",
            "Export settings are incomplete.\n\nWhat to try:\n• Try exporting again\n• Restart After Effects\n• Check your composition",
          );
          resetUI();
          return;
        }

        const settings = {
          projectPath: info.projectPath,
          compName: info.compName,
          width: info.width,
          height: info.height,
          frameRate: info.frameRate,
          duration: info.duration,
          outputFile: info.outputFile,
          tempFolder: info.tempFolder,
          aviFile: info.aviFile,
          aerenderPath: info.aerenderPath,
          crf: qualityLevels[qualitySlider.value - 1].crf,
          preset: qualityLevels[qualitySlider.value - 1].preset,
          upscale: parseInt(
            document.querySelector('input[name="upscale"]:checked').value,
          ),
        };

        let AsyncRenderer;
        try {
          AsyncRenderer = require(
            path.join(
              cs.getSystemPath(SystemPath.EXTENSION),
              "node",
              "async-renderer.js",
            ),
          );
          writeDebugLog("AsyncRenderer module loaded successfully");
        } catch (e) {
          writeDebugLog("Failed to load AsyncRenderer: " + e.toString());
          showError(
            "Module Load Error",
            "Failed to load export renderer.\n\nWhat to try:\n• Reinstall JOOS extension\n• Check installation files\n• Restart After Effects",
          );
          resetUI();
          return;
        }

        const renderer = new AsyncRenderer();

        renderer.on("progress", (data) => {
          const progress = Math.min(100, Math.max(0, data.progress));
          progressFill.style.width = progress + "%";
          progressPct.textContent = Math.round(progress) + "%";
          statusMsg.textContent = (data.message || "Processing") + "...";
        });

        renderer
          .exportComposition(settings)
          .then(() => {
            writeDebugLog("Export completed successfully!");
            statusMsg.textContent = "Export complete!";
            progressFill.style.width = "100%";
            progressPct.textContent = "100%";
            setTimeout(() => resetUI(), 3000);
          })
          .catch((err) => {
            const errorMsg = err.message || err.toString();
            writeDebugLog("Export failed: " + errorMsg);
            showError("Export Failed", errorMsg);
            statusMsg.textContent = "Export failed...";
            progressFill.style.width = "0%";
            progressPct.textContent = "0%";
            setTimeout(() => resetUI(), 1000);
          });
      });
    };

    function resetUI() {
      exportBtn.disabled = false;
      progressFill.style.width = "0%";
      progressPct.textContent = "0%";
      statusMsg.textContent = "Ready to export...";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
