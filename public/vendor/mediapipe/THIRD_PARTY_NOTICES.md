# MediaPipe Tasks Vision assets

- Package: `@mediapipe/tasks-vision`
- Pinned version: `1.0.1`
- Source: `https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.0.1`
- License: Apache-2.0 (see `LICENSE-APACHE-2.0.txt`)
- Included runtime files: SIMD and non-SIMD JavaScript/WebAssembly loaders
- Included models:
  - Google MediaPipe Face Landmarker float16 model, version 1
  - Google MediaPipe Object Detector, EfficientDet-Lite0 (int8), version 1 —
    browser fallback for person and cell-phone detection
  - Google MediaPipe Object Detector, EfficientDet-Lite2 (float32), version 1 —
    worker fallback if quantized CPU model initialization fails
  - Google MediaPipe Object Detector, EfficientDet-Lite2 (int8), version 1 —
    primary worker model, CPU delegate, person and cell-phone categories
    Source: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/int8/1/efficientdet_lite2.tflite
    SHA-256: b3f50554cb0ea559e90328845f7d9ba4d13c8bff372914d24e06bc8bb72fa896

These files are vendored so browser-side person detection does not depend on
access to jsDelivr or Google Storage during an interview.

Local loader adjustment (10 October 2026): only known benign native XNNPACK
INFO / graph-initialization warnings are routed to console.debug. Unknown
stderr lines remain console.error. Model and inference behavior are unchanged.
