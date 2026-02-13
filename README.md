# JOOS v1.1

JOOS is a CEP-based extension for Adobe After Effects that automates the export pipeline from the Render Queue to FFmpeg. It streamlines the creation of H.264/MP4 files by eliminating intermediary manual transcodes.

---

## Technical Architecture

* **Host:** Adobe After Effects (CEP)
* **Transcoder:** FFmpeg
* **Encoder:** `libx264` (H.264) / AAC
* **Chroma Subsampling:** YUV 4:2:0
* **Scaling:** Lanczos Resampling (optional 2x/4x)

## Installation

### 1. Enable Unsigned Extensions
JOOS requires `PlayerDebugMode` to be enabled for the Adobe CEP environment.

* **Windows:** Execute `Enable_JOOS_Debug.bat` as Administrator.
* **macOS:** Execute `Enable_JOOS_Debug.command`.

### 2. Deployment
Move the `com.joos.export` directory to the system-specific CEP extensions folder:

* **Windows:** `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`
* **macOS:** `~/Library/Application Support/Adobe/CEP/extensions` 

*Note: Create the `extensions` directory if it is not present.*

## Usage

1. Initialize the extension: **Window > Extensions > JOOS v1.1**.
2. Select target **Composition**.
3. Configure **CRF** (Constant Rate Factor) and **Scaling** parameters.
4. Execute **EXPORT** to trigger the background render and transcode process.

## Encoding Parameters

The following table maps the UI presets to their respective FFmpeg CRF values.

| Preset | CRF | Profile |
| :--- | :--- | :--- |
| Eco | 18 | Fastest |
| Draft | 16 | Very Fast |
| Fast | 14 | Fast |
| Standard | 12 | Medium |
| Balanced | 10 | Medium |
| High | 8 | Slow |
| Ultra | 4 | Very Slow |
| Production | 2 | Slower |
| Lossless | 0 | Placebo |

**Note:** CRF values < 10 result in high-bitrate files that may exceed the decoding capabilities of standard hardware players. Use VLC or similar software for playback.

---
**Developer:** [nthnerr](https://github.com/nthnerr)
