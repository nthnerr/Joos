# JOOS

**JOOS** is a simple, fast MP4 exporter for Adobe After Effects. It uses FFmpeg to export high-quality H.264 videos directly from your Render Queue, skipping the need for Adobe Media Encoder.

[Download Latest Release](https://github.com/nthnerr/Joos/releases)

---

## Features
* **One-Click Export:** Create MP4s without leaving After Effects.
* **No Media Encoder Needed:** Uses a built-in engine for faster, lighter processing.
* **Auto-Cleanup:** Automatically deletes temporary files after the export is finished.
* **Cross-Platform:** Works on both Windows and macOS.

## Installation

1. **Download** and extract the latest JOOS zip file.
2. **Move** the `JOOS.jsx` file and the `bin` folder into your After Effects ScriptUI Panels folder:
    * **Windows:** `...\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels`
    * **macOS:** `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels`
3. **Restart After Effects** and open the tool via **Window > JOOS.jsx**.

## How to Use

1. Select your **Composition** in the Project panel.
2. Click **START EXPORT**.
3. Choose where to save your file.
4. The status will return to **SYSTEM READY** once the export is done.

## Technical Specs
* **Format:** MP4 (H.264 / AAC)
* **Quality:** High Profile (CRF 18)
* **Settings:** Balanced for high visual fidelity and efficient file sizes.

---
*Created by [nthnerr](https://github.com/nthnerr/Joos)*
