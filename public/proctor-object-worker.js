/* Heavy object inference stays off the interview UI/audio-control thread. */
let detector;
self.onmessage = async ({data}) => {
  const {id, type, frame, timestamp} = data;
  try {
    if (type === "init") {
      const vision = await import("/vendor/mediapipe/vision_bundle.mjs");
      const fileset = await vision.FilesetResolver.forVisionTasks("/vendor/mediapipe/wasm");
      fileset.wasmLoaderPath += "?v=proctor-log-routing-20261010";
      let failure;
      // Quantized CPU inference avoids silent GPU-delegate misses and uses
      // substantially less model memory than the float32 Lite2 asset.
      for (const modelAssetPath of ["/vendor/mediapipe/efficientdet_lite2_int8.tflite", "/vendor/mediapipe/efficientdet_lite2.tflite"]) {
        try {
          detector = await vision.ObjectDetector.createFromOptions(fileset, {
            baseOptions: {modelAssetPath, delegate: "CPU"},
            runningMode: "VIDEO", maxResults: 20, scoreThreshold: .08,
            categoryAllowlist: ["person", "cell phone"],
          });
          break;
        } catch (error) { failure = error; }
      }
      if (!detector) throw failure;
      self.postMessage({id, result: true});
    } else if (type === "detect" && detector) {
      const result = detector.detectForVideo(frame, timestamp);
      self.postMessage({id, result});
    } else {
      throw new Error("Object detector is not ready.");
    }
  } catch (error) {
    self.postMessage({id, error: String(error?.message || error)});
  } finally {
    frame?.close();
  }
};
