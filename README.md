# Joos

Joos is a CEP-based extension for Adobe After Effects that automates the export pipeline from the Render Queue to FFmpeg. It streamlines the creation of H.264/MP4 files by eliminating intermediary manual transcodes.

---

## Technical Architecture

* **Host:** Adobe After Effects (CEP)
* **Transcoder:** FFmpeg
* **Encoder:** `libx264` (H.264) / AAC
* **Chroma Subsampling:** YUV 4:2:0
* **Scaling:** Lanczos Resampling (optional 2x/4x)

## Installation

### 1. Enable Unsigned Extensions
Joos requires `PlayerDebugMode` to be enabled for the Adobe CEP environment.

* **Windows:** Execute `debug.bat` as Administrator.

### 2. Deployment
Move the `Joos` directory to the CEP extensions folder:

* **Windows:** `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`

*Note: Create the `extensions` directory if it is not present.*

## Usage

1. Initialize the extension: **Window > Extensions > Joos**.
2. Select target **Composition**.
3. Configure **CRF** (Constant Rate Factor) and **Scaling** parameters.
4. Execute **EXPORT** to trigger the background render and transcode process.

## Encoding Parameters

The following table maps the UI presets to their respective FFmpeg CRF values.

| Preset | CRF | Profile |
| :--- | :--- | :--- |
| Eco | 24 | Fastest |
| Bad | 21 | Very Fast |
| Poor | 18 | Fast |
| Low | 15 | Medium |
| Fair | 12 | Medium |
| Good | 9 | Slow |
| Great | 6 | Very Slow |
| Excellent | 3 | Slower |
| Lossless | 0 | Placebo |

**Note:** CRF values < 10 result in high-bitrate files that may exceed the decoding capabilities of standard hardware players. Use VLC or similar software for playback.

