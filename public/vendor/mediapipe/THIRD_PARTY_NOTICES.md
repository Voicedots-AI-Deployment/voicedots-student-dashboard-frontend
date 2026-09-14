# MediaPipe Tasks Vision assets

- Package: `@mediapipe/tasks-vision`
- Pinned version: `1.0.1`
- Source: `https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.0.1`
- License: Apache-2.0 (see `LICENSE-APACHE-2.0.txt`)
- Included runtime files: SIMD and non-SIMD JavaScript/WebAssembly loaders
- Included models:
  - Google MediaPipe Face Landmarker float16 model, version 1
  - Google MediaPipe Object Detector, EfficientDet-Lite0 (int8), version 1 —
    used only for its "person" category, as a backstop that counts bodies
    (not faces) so someone facing away from the camera is still detected

These files are vendored so browser-side person detection does not depend on
access to jsDelivr or Google Storage during an interview.
