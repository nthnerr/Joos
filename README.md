# Joos

Joos is a CEP extension for Adobe After Effects that renders a composition and automates the FFmpeg transcode step into an H.264/MP4 output. The extension bridges After Effects render output and FFmpeg encoding without requiring an intermediate manual transcode pass.

## Architecture

* Host: Adobe After Effects via CEP
* Render engine: After Effects `aerender.exe`
* Encode pipeline: FFmpeg
* Video codec: `libx264`
* Audio codec: AAC
* Pixel format: `yuv420p`
* Optional scaling: Lanczos resampling at 2K or 4K

## Installation

### 1. Enable unsigned extensions
Joos requires the Adobe CEP debug mode to be enabled.

* Windows: run `debug.bat` as Administrator.

### 2. Deploy the extension
Copy the `Joos` directory into the Adobe CEP extensions folder:

* Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`

If the `extensions` directory does not exist, create it first.

## Usage

1. Open After Effects and launch Joos from Window > Extensions > Joos.
2. Select the target composition.
3. Choose the quality preset and optional upscale.
4. Run the export. Joos initiates the render, encodes the output with FFmpeg, and writes the final MP4 file.

## Quality presets

The UI presets map directly to FFmpeg CRF values.

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

CRF values below 10 can produce very high bitrate output and may exceed the decoding limits of some consumer playback hardware. VLC or similar software is recommended for review.

