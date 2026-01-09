# JOOS

### STABLE V1.0.37

**JOOS** is a minimalist, high-performance MP4 export utility for Adobe After Effects. It streamlines the production pipeline by bridging the After Effects Render Queue with the FFmpeg encoding engine, delivering professional H.264/AAC output through a single-action interface.

---

## Architecture

The JOOS pipeline is designed for stability and visual fidelity. It automates a dual-stage process: generating a high-bitrate master file via an internal script-generated template, followed by a surgical-grade H.264 encode. This "Static Binary" approach bypasses the overhead of external media encoders.

## Features

* **Unified Workspace:** Execute renders without background processes or external applications.
* **Symmetric Monitoring:** Real-time system diagnostics and progress tracking integrated into the UI.
* **Automated Cleanup:** Script-level logic for immediate removal of intermediate master files.
* **Platform Agnostic:** Single-script compatibility for macOS and Windows environments.

---

## Deployment

For stability, JOOS utilizes a local binary architecture. The release package is distributed as a compressed archive containing the script and its dependencies.

### Directory Specification

```text
JOOS_Distribution/
├── JOOS.jsx
└── bin/
    ├── ffmpeg.exe (Windows)
    └── ffmpeg (macOS)

```

### Installation

1. Download the latest release `JOOS from Releases. 
2. Extract the `JOOS` archive.
3. Move the `JOOS.jsx` file and the `bin` folder to your ScriptUI Panels directory:
* **Windows:** `...\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels`
* **macOS:** `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels`


4. Access the interface in Adobe After Effects via **Window > JOOS.jsx**.

---

## Usage

1. Select a **Composition** in the After Effects Project panel.
2. Click **START EXPORT**.
3. Designate the output destination.
4. The system will return to **SYSTEM READY** status upon successful completion.

## Technical Standards

* **Codec:** libx264 | High Profile
* **Audio:** AAC | 192kbps | 48kHz
* **Color:** yuv420p
* **Efficiency:** CRF 18 | Slow Preset
