# VRM Studio

A high-performance, web-based VRM viewer and utility suite designed for 3D humanoid avatars. VRM Studio provides a professional-grade interface for visualizing, posing, and debugging VRM models with real-time feedback.

![VRM Studio Interface](https://raw.githubusercontent.com/vrm-c/vrm-specification/master/vrm.png) *(Placeholder image reminder: Replace with actual screenshot)*

## ✨ Key Features

### 🔍 Advanced VRM Viewing
- **Full Version Support**: seamless support for both VRM 0.0 (Legacy) and VRM 1.0 (Standard).
- **Auto-Migration**: Built-in logic to safely migrate and preview models in the VRM 1.0 environment.
- **Hierarchy Explorer**: Deep-tree inspection of the model's bone structure and nodes.
- **Metadata Viewer**: Quick access to model license, authoring info, and usage rights.

### 🎭 Motion & Animation (VRMA)
- **VRMA Integration**: Full playback support for `.vrma` (VRM Animation) files.
- **Motion Player**: Play/Pause, speed control (0.25x to 2.0x), and frame seeking.
- **Preset Library**: Quickly test your model with standard idle and breathe animations.

### 🦴 Kinematics & Posing (FK/IK)
- **Hybrid Controls**: Toggle between **Inverse Kinematics (IK)** and **Forward Kinematics (FK)** for precise bone manipulation.
- **Pose Presets**: Instantly apply common poses (T-Pose, A-Pose, Standing, etc.).
- **Pose Import**: Load custom `.json` pose data to snapshot specific configurations.

### 👄 Face & Expression
- **Live Lip-sync**: Real-time microphone capture for phoneme-based lip-sync (A/I/U/E/O).
- **LookAt System**: Procedural eye and head tracking with mouse interaction.
- **Expression Editor**: Granular slider controls for all model blendshapes.

### 🍃 Physics & Environment
- **SpringBone Debugger**: Real-time tuning of Gravity, Drag, and Wind fields for secondary animation.
- **Physics Visualization**: Toggle Collider and Bone X-Ray mode for vertex/physics debugging.
- **Lighting Studio**: Fine-tune Ambient and Directional lighting intensity.
- **Diagnostic Tools**: Live FPS tracker, Triangle count, Draw calls, and Memory usage stats.

### 🛠 Tools & Export
- **Capture Studio**: High-resolution screenshot capture with transparent background support.
- **VRM 1.0 Export**: Download models as optimized VRM 1.0 files.
- **Green Screen Mode**: Dedicated pure-color background presets for video compositing.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Latest LTS)
- [pnpm](https://pnpm.io/) (Project uses pnpm for package management)

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

### Development
Start the local development server:
```bash
pnpm run dev
```

### Build
Generate a production-ready build:
```bash
pnpm run build
```

## 🧰 Utilities

### VRM Pose Converter (0.0 to 1.0)
Due to differences in coordinate systems (VRM 0.0 faces `-Z`, VRM 1.0 faces `+Z`), legacy custom pose `.json` files will appear physically twisted/broken when applied to VRM 1.0 models. 

You can batch-convert old `vrmVersion: "0"` poses inside the project by running:
```bash
node scripts/fix_poses.js
```
*Tip: To convert a custom directory, run `node scripts/fix_poses.js path/to/your/poses`.*

## 🛠 Technology Stack
- **Engine**: [Three.js](https://threejs.org/)
- **VRM Support**: [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) & [@pixiv/three-vrm-animation](https://github.com/pixiv/three-vrm-animation)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide](https://lucide.dev/)

## 📜 License
This project is licensed under the ISC License.

---
*Created with ❤️ for the VRM Community.*
