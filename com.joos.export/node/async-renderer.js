const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const path = require("path");
const fs = require("fs");
const DebugLogger = require("./debug-logger");

class AsyncRenderer extends EventEmitter {
  constructor() {
    super();
    this.tempFolder = null;
    this.startTime = null;
    this.debug = new DebugLogger();
  }

  async exportComposition(settings) {
    this.startTime = Date.now();
    this.tempFolder = settings.tempFolder;

    this.debug.log("=== EXPORT STARTED ===");
    this.debug.settings(settings);

    console.log("[JOOS] Starting export...");
    console.log(`[JOOS] Composition: ${settings.compName}`);
    console.log(`[JOOS] Resolution: ${settings.width}x${settings.height}`);
    console.log(`[JOOS] Duration: ${settings.duration.toFixed(2)}s`);

    try {
      console.log("[JOOS] Step 1: Rendering AVI...");
      this.emit("progress", {
        message: "Starting After Effects render",
        progress: 0,
      });
      await this.runAerender(settings);
      this.debug.log("AVI render completed successfully");
      console.log("[JOOS] AVI render completed");

      console.log("[JOOS] Step 2: Verifying AVI...");
      if (!fs.existsSync(settings.aviFile)) {
        this.debug.error(
          "AVI file not found",
          new Error(`Expected: ${settings.aviFile}`),
        );
        throw new Error(
          "Render failed - AVI file was not created.\n\nWhat to try:\n• Check your composition settings\n• Ensure sufficient disk space\n• Verify render queue configuration\n\nExpected file:\n" +
            settings.aviFile,
        );
      }

      const aviStats = fs.statSync(settings.aviFile);
      const aviSizeMB = (aviStats.size / 1024 / 1024).toFixed(2);
      this.debug.log(`AVI file size: ${aviSizeMB} MB`);
      console.log(`[JOOS] AVI created: ${aviSizeMB} MB`);

      console.log("[JOOS] Step 3: Converting to MP4...");
      console.log(
        `[JOOS] CRF: ${settings.crf}, Preset: ${settings.preset}, Upscale: ${settings.upscale}x`,
      );

      this.emit("progress", { message: "Converting to MP4", progress: 65 });
      await this.runFFmpeg(settings);
      this.debug.log("FFmpeg conversion completed successfully");
      console.log("[JOOS] Conversion completed");

      console.log("[JOOS] Step 4: Verifying output...");
      if (!fs.existsSync(settings.outputFile)) {
        this.debug.error(
          "MP4 file not found",
          new Error(`Expected: ${settings.outputFile}`),
        );
        throw new Error(
          "Encoding failed - MP4 file was not created.\n\nPossible causes:\n• Insufficient disk space\n• Invalid output path\n• FFmpeg encoding error\n\nExpected file:\n" +
            settings.outputFile,
        );
      }

      const outputStats = fs.statSync(settings.outputFile);
      const outputSizeMB = (outputStats.size / 1024 / 1024).toFixed(2);
      this.debug.log(`MP4 file size: ${outputSizeMB} MB`);
      console.log(`[JOOS] Output created: ${outputSizeMB} MB`);

      console.log("[JOOS] Step 5: Cleaning up...");
      this.emit("progress", { message: "Cleaning up", progress: 98 });
      await this.cleanup(settings.aviFile);
      console.log("[JOOS] Cleanup complete");

      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      this.debug.log(`=== EXPORT COMPLETED in ${elapsed}s ===`);
      console.log(`[JOOS] Export completed in ${elapsed}s`);
      console.log(`[JOOS] Final size: ${outputSizeMB} MB`);

      this.emit("progress", { message: "Export complete", progress: 100 });
      return { status: "success" };
    } catch (error) {
      this.debug.error("Export failed", error);
      console.error("[JOOS] Export failed:", error.message);
      await this.cleanup(settings.aviFile);
      throw error;
    }
  }

  runAerender(settings) {
    return new Promise((resolve, reject) => {
      this.debug.log(`Starting aerender: ${settings.aerenderPath}`);
      if (!fs.existsSync(settings.aerenderPath)) {
        this.debug.error(
          "aerender.exe not found",
          new Error(settings.aerenderPath),
        );
        return reject(
          new Error(
            "Cannot find After Effects renderer.\n\nWhat to try:\n• Restart After Effects\n• Reinstall After Effects\n\nExpected path:\n" +
              settings.aerenderPath,
          ),
        );
      }

      if (!fs.existsSync(this.tempFolder)) {
        this.debug.error("Temp folder not found", new Error(this.tempFolder));
        return reject(
          new Error(
            "Temporary folder not found.\n\nWhat to try:\n• Export again\n• Check folder permissions\n\nMissing folder:\n" +
              this.tempFolder,
          ),
        );
      }

      const expectedFrames = Math.ceil(settings.duration * settings.frameRate);
      const args = [
        "-project",
        settings.projectPath,
        "-comp",
        settings.compName,
      ];
      this.debug.log(`Expected frames: ${expectedFrames}`);

      const proc = spawn(settings.aerenderPath, args, {
        windowsHide: false,
      });

      let stdout = "";
      let stderr = "";
      let lastProgress = 5;
      let lastFrame = 0;

      this.emit("progress", {
        message: "After Effects rendering",
        progress: 5,
      });

      proc.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;

        const match = text.match(/\((\d+)\):/);
        if (match) {
          const frameNum = parseInt(match[1], 10);
          if (frameNum > lastFrame) {
            lastFrame = frameNum;
            const progress = Math.min(100, (frameNum / expectedFrames) * 100);
            const scaledProgress = 5 + progress * 0.6;

            if (scaledProgress > lastProgress + 0.1) {
              lastProgress = scaledProgress;
              this.emit("progress", {
                message: `Rendering: ${frameNum} of ${expectedFrames} frames`,
                progress: scaledProgress,
              });
            }
          }
        }
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          this.emit("progress", {
            message: "After Effects render complete",
            progress: 65,
          });
          resolve();
        } else {
          const lastLines = (stdout + "\n" + stderr)
            .split("\n")
            .filter((l) => l.trim())
            .slice(-15)
            .join("\n");

          this.debug.error(
            `aerender failed with code ${code}`,
            new Error(`Frames: ${lastFrame}/${expectedFrames}\n${lastLines}`),
          );
          reject(
            new Error(
              "After Effects render failed.\n\n" +
                `Progress: ${lastFrame} of ${expectedFrames} frames\n` +
                `Exit code: ${code}\n\n` +
                "What to try:\n• Check composition settings\n• Ensure sufficient RAM\n• Try a shorter composition\n\n" +
                "Last output:\n" +
                lastLines,
            ),
          );
        }
      });

      proc.on("error", (err) => {
        this.debug.error("Failed to launch aerender", err);
        reject(
          new Error(
            "Failed to start After Effects renderer.\n\nWhat to try:\n• Close other After Effects instances\n• Restart your computer\n• Reinstall After Effects\n\nError: " +
              err.message,
          ),
        );
      });
    });
  }

  runFFmpeg(settings) {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === "win32";
      const binFolder = path.join(path.dirname(__dirname), "bin");
      const ffmpegPath = path.join(binFolder, isWin ? "ffmpeg.exe" : "ffmpeg");

      this.debug.log(`Starting FFmpeg: ${ffmpegPath}`);
      if (!fs.existsSync(ffmpegPath)) {
        this.debug.error("FFmpeg not found", new Error(ffmpegPath));
        return reject(
          new Error(
            "FFmpeg encoder not found.\n\nWhat to try:\n• Reinstall JOOS extension\n• Check installation files\n\nExpected path:\n" +
              ffmpegPath,
          ),
        );
      }

      const outputWidth = settings.width * settings.upscale;
      const outputHeight = settings.height * settings.upscale;
      const needsUpscale = settings.upscale > 1;

      const args = [
        "-y",
        "-i",
        settings.aviFile,
        "-c:v",
        "libx264",
        "-crf",
        settings.crf.toString(),
        "-preset",
        settings.preset,
      ];

      if (needsUpscale) {
        args.push("-vf", `scale=${outputWidth}:${outputHeight}:flags=lanczos`);
      }

      args.push(
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        settings.outputFile,
      );

      const proc = spawn(ffmpegPath, args, {
        windowsHide: false,
      });

      let stderr = "";
      let lastProgress = 65;
      let processedSeconds = 0;

      proc.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;

        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseInt(timeMatch[3], 10);
          processedSeconds = hours * 3600 + minutes * 60 + seconds;

          const progress = Math.min(
            100,
            (processedSeconds / settings.duration) * 100,
          );
          const scaledProgress = 65 + progress * 0.33;

          if (scaledProgress > lastProgress + 0.1) {
            lastProgress = scaledProgress;
            this.emit("progress", {
              message: `Encoding: ${processedSeconds.toFixed(1)}s of ${settings.duration.toFixed(1)}s`,
              progress: scaledProgress,
            });
          }
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          this.emit("progress", { message: "Encoding complete", progress: 98 });
          resolve();
        } else {
          const errorLines = stderr.split("\n").slice(-10).join("\n");
          this.debug.error(
            `FFmpeg failed with code ${code}`,
            new Error(
              `Processed: ${processedSeconds.toFixed(1)}s/${settings.duration.toFixed(1)}s\n${errorLines}`,
            ),
          );
          reject(
            new Error(
              "Video encoding failed.\n\n" +
                `Progress: ${processedSeconds.toFixed(1)}s of ${settings.duration.toFixed(1)}s\n` +
                `Settings: CRF=${settings.crf}, Preset=${settings.preset}, Upscale=${settings.upscale}x\n` +
                `Exit code: ${code}\n\n` +
                "What to try:\n• Lower quality setting\n• Disable upscaling\n• Check disk space\n\n" +
                "FFmpeg output:\n" +
                errorLines,
            ),
          );
        }
      });

      proc.on("error", (err) => {
        this.debug.error("Failed to launch FFmpeg", err);
        reject(
          new Error(
            "Failed to start video encoder.\n\nWhat to try:\n• Reinstall JOOS extension\n• Close other video encoding apps\n• Restart your computer\n\nError: " +
              err.message,
          ),
        );
      });
    });
  }

  async cleanup(aviFile) {
    return new Promise((resolve) => {
      try {
        if (fs.existsSync(aviFile)) {
          try {
            fs.unlinkSync(aviFile);
          } catch (e) {
            console.error(`[JOOS] Could not delete AVI: ${e.message}`);
          }
        }

        if (this.tempFolder && fs.existsSync(this.tempFolder)) {
          try {
            const files = fs.readdirSync(this.tempFolder);
            for (const file of files) {
              try {
                fs.unlinkSync(path.join(this.tempFolder, file));
              } catch (e) {}
            }
            fs.rmdirSync(this.tempFolder);
          } catch (e) {
            console.error(`[JOOS] Could not delete temp folder: ${e.message}`);
          }
        }

        resolve();
      } catch (e) {
        console.error(`[JOOS] Cleanup error: ${e.message}`);
        resolve();
      }
    });
  }
}

module.exports = AsyncRenderer;
