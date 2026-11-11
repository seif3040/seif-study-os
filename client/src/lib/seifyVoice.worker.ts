import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

let speech: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

self.onmessage = async (event: MessageEvent<Float32Array>) => {
  try {
    speech ??= pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", {
      revision: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7",
      device: "wasm",
      dtype: "q8",
      progress_callback: progress => {
        if (progress.status === "progress") self.postMessage({ status: "loading", progress: progress.progress });
      },
    });
    const recognize = await speech;
    self.postMessage({ status: "working" });
    const result = await recognize(event.data, { language: "ar", task: "transcribe", return_timestamps: false });
    const text = (Array.isArray(result) ? result.map(item => item.text).join(" ") : result.text).trim();
    if (!text) self.postMessage({ status: "error", text: "ماسمعتش كلام واضح. جرّب تاني." });
    else self.postMessage({ status: "done", text: text.slice(0, 1200) });
  } catch {
    speech = undefined;
    self.postMessage({ status: "error", text: "تعذّر تحميل أو تشغيل نموذج الصوت. اتأكد من الاتصال وجرّب تاني." });
  }
};
