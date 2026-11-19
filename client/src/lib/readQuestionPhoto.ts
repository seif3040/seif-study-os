import { createWorker, OEM, PSM, type Worker as OCRWorker } from "tesseract.js";
import workerPath from "tesseract.js/dist/worker.min.js?url";
import corePath from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import { questionFromText } from "@shared/questionPhoto";

async function imageCanvas(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const dimension = Math.max(image.naturalWidth, image.naturalHeight);
  if (!dimension) throw new Error("تعذّر فتح الصورة.");
  const scale = Math.min(2, Math.max(1500, Math.min(2200, dimension)) / dimension);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("المتصفح ما قدرش يجهّز الصورة.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function readQuestionPhoto(source: string, onProgress: (progress: number) => void) {
  const abort = new AbortController();
  let worker: OCRWorker | undefined;
  let timeout = 0;
  let fail!: (reason: unknown) => void;
  const failure = new Promise<never>((_, reject) => {
    fail = reject;
    timeout = window.setTimeout(() => reject(new Error("قراءة الصورة خدت وقت طويل. جرّب تقص الصورة حوالين السؤال.")), 45_000);
  });

  try {
    const image = await Promise.race([imageCanvas(source), failure]);
    const setup = createWorker("ara+eng", OEM.LSTM_ONLY, {
      langPath: new URL("/assets/question-ocr", window.location.origin).href,
      workerPath: new URL(workerPath, window.location.href).href,
      corePath: new URL(corePath, window.location.href).href,
      workerBlobURL: false,
      cacheMethod: "none",
      logger: message => {
        if (message.status === "recognizing text") onProgress(Math.round(message.progress * 100));
      },
      errorHandler: () => fail(new Error("تعذّرت قراءة الصورة على الجهاز. جرّب صورة أوضح.")),
    }).then(created => {
      if (abort.signal.aborted) void created.terminate();
      else worker = created;
      return created;
    });
    const recognizer = await Promise.race([setup, failure]);
    await Promise.race([recognizer.setParameters({ tessedit_pageseg_mode: PSM.AUTO }), failure]);
    const { data } = await Promise.race([recognizer.recognize(image), failure]);
    return questionFromText(data.text);
  } finally {
    abort.abort();
    window.clearTimeout(timeout);
    await worker?.terminate();
  }
}
