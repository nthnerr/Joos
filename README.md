# JOOS

**JOOS** is a simple, high-performance MP4 exporter for Adobe After Effects. It bridges the After Effects Render Queue with FFmpeg to deliver professional H.264 files without the extra steps.

[Download Latest Release](https://github.com/nthnerr/Joos/releases)

---

## Why use JOOS?

* **No Adobe Media Encoder:** Skip the heavy background processes and "Connecting to Dynamic Link" delays.
* **Faster Pipeline:** Replaces the manual workflow of exporting a massive AVI/ProRes file and then using Handbrake or other software to convert it to MP4.
* **One-Click Workflow:** Go from your timeline to a finished MP4 in a single action.
* **Automatic Cleanup:** Intermediate master files are deleted automatically once the MP4 is ready.

## Installation

1. **Download** and extract the latest JOOS zip file.
2. **Move** the `JOOS.jsx` file and the `bin` folder into your ScriptUI Panels folder:
    * **Windows:** `...\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels`
    * **macOS:** `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels`
3. **Restart After Effects** and open the tool via **Window > JOOS.jsx**.

## How to Use

1. Select your **Composition** in the Project panel.
2. Click **START EXPORT**.
3. Choose your destination. 
4. The status will return to **SYSTEM READY** once the MP4 is finished.

## Technical Specs
* **Format:** MP4 (H.264 / AAC)
* **Quality:** High Profile (CRF 18)
* **Platform:** Compatible with Windows and macOS.

---
*Created by [nthnerr](https://github.com/nthnerr/Joos)*
