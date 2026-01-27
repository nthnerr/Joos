const fs = require("fs");
const path = require("path");

class DebugLogger {
  constructor() {
    this.debugPath = path.join(__dirname, "..", ".debug");
    this.clear();
  }

  clear() {
    try {
      fs.writeFileSync(
        this.debugPath,
        "=== JOOS v1.1 Debug Log ===\n\n",
        "utf8",
      );
    } catch (e) {}
  }

  log(message) {
    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] [NODE] ${message}\n`;
      fs.appendFileSync(this.debugPath, logLine, "utf8");
    } catch (e) {}
  }

  error(message, error) {
    try {
      const timestamp = new Date().toISOString();
      let logLine = `[${timestamp}] [NODE] ERROR: ${message}\n`;
      if (error) {
        logLine += `  Details: ${error.toString()}\n`;
        if (error.stack) {
          logLine += `  Stack: ${error.stack}\n`;
        }
      }
      fs.appendFileSync(this.debugPath, logLine, "utf8");
    } catch (e) {}
  }

  settings(settings) {
    try {
      this.log("Export Settings:");
      this.log(`  Composition: ${settings.compName}`);
      this.log(`  Resolution: ${settings.width}x${settings.height}`);
      this.log(`  Frame Rate: ${settings.frameRate} fps`);
      this.log(`  Duration: ${settings.duration.toFixed(2)}s`);
      this.log(`  Quality: CRF=${settings.crf}, Preset=${settings.preset}`);
      this.log(`  Upscale: ${settings.upscale}x`);
      this.log(`  Output: ${settings.outputFile}`);
      this.log(`  AE Render: ${settings.aerenderPath}`);
    } catch (e) {}
  }
}

module.exports = DebugLogger;
