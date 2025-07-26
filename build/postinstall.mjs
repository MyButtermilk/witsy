import { execSync } from 'child_process';
import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// Run patch-package to apply any patches
execSync('npx patch-package');

// Helper function to copy files while ensuring destination directories exist
function copyAsset(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

try {
  // Copy VAD model and worklet files from vad-web package into public/vad so they're bundled into the app.
  const vadBase = join('node_modules', '@ricky0123', 'vad-web');
  copyAsset(join(vadBase, 'silero_vad.onnx'), join('public', 'vad', 'silero_vad.onnx'));
  copyAsset(join(vadBase, 'vad.worklet.bundle.min.js'), join('public', 'vad', 'vad.worklet.bundle.min.js'));

  // Copy ONNXRuntime Web WASM files for offline runtime support
  const ortBase = join('node_modules', 'onnxruntime-web', 'dist');
  copyAsset(join(ortBase, 'ort-wasm.wasm'), join('public', 'vad', 'ort-wasm.wasm'));
  copyAsset(join(ortBase, 'ort-wasm-simd.wasm'), join('public', 'vad', 'ort-wasm-simd.wasm'));
} catch (err) {
  console.warn('VAD asset copy failed', err);
}
