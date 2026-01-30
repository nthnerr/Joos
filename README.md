# JOOS

**JOOS** is a simple, high-performance MP4 exporter for Adobe After Effects. It bridges the After Effects Render Queue with FFmpeg to deliver professional H.264 files without the extra steps.

---

## Why use JOOS?

* **Fast Pipeline:** Replaces the manual workflow of exporting a massive AVI/ProRes file and then using Handbrake or other software to convert it to MP4.
* **One-Click Workflow:** Go from your timeline to a finished MP4 in a single action.
* **Nine Quality Presets:** Choose from nine quality levels to match your needs.
* **Built-in Upscaling:** Optional 2x or 4x upscaling using high-quality Lanczos algorithm.

## Installation

### Step 1: Enable Debug Mode (Required)

Since JOOS is not digitally signed, you need to enable debug mode once:

* **Windows:** Right-click `Enable_JOOS_Debug.bat` and select "Run as administrator"
* **macOS:** Right-click `Enable_JOOS_Debug.command` and select "Open"

You only need to do this once. It stays enabled permanently.

### Step 2: Install Extension

Copy the `com.joos.export` folder to your CEP extensions directory:

* **Windows:** `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`
* **macOS:** `C:\Users\[NAME]\AppData\Roaming\Adobe\CEP\extensions`

If the `extensions` folder doesn't exist, create it.

### Step 3: Restart After Effects

Close After Effects completely and reopen it.

### Step 4: Open JOOS

In After Effects, go to: **Window → Extensions → JOOS v1.1**

## How to Use

1. Select your **Composition** in the Project panel or Timeline.
2. Inside the **JOOS v1.1** panel, choose your **Quality** setting, and your **Upscale** setting.
3. Click **EXPORT**.
4. Choose your destination.
5. Wait for the export to complete.

## Quality Presets

JOOS offers 9 quality levels optimized for different use cases:

| Preset | CRF | Speed | Best For |
|--------|-----|-------|----------|
| **Eco** | 18 | Fastest | Quick previews, drafts |
| **Draft** | 16 | Very Fast | Internal reviews |
| **Fast** | 14 | Fast | Social media, web |
| **Standard** | 12 | Moderate | General purpose |
| **Balanced** | 10 | Balanced | Most projects (default) |
| **High** | 8 | Slow | High-quality deliverables |
| **Ultra** | 4 | Very Slow | Professional work |
| **Production** | 2 | Extremely Slow | Final masters |
| **Lossless** | 0 | Slowest | Archival quality |

*Lower CRF = Higher Quality. Speed refers to encoding time.*
*Higher CRF options might create files that cannot be displayed on non-professional media players. Use VLC Media Player to circumvent this issue.*

## Technical Specs

* **Format:** AVI // MP4 (H.264 / AAC)
* **Encoding:** FFmpeg with libx264
* **Upscaling:** Lanczos algorithm 
* **Color Space:** YUV 4:2:0
* **Platform:** Compatible with Windows and macOS

---
*Created by [nthnerr](https://github.com/nthnerr)*
