export async function transcribeSeifyAudio(audio: string) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OpenRouter مش متوصل.");
  const buffer = Buffer.from(audio, "base64");
  if (buffer.length < 44 || buffer.length > 1_125_000 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("التسجيل الصوتي غير صالح.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      model: "openrouter/free", provider: { data_collection: "deny", require_parameters: true },
      messages: [{ role: "user", content: [
        { type: "text", text: "Transcribe spoken Egyptian Arabic exactly. Output only the transcript in Arabic, no notes or translation. If there is no speech, output [silence]." },
        { type: "input_audio", input_audio: { data: audio, format: "wav" } },
      ] }], max_tokens: 450,
    }),
  });
  if (!response.ok) throw new Error("خدمة تحويل الصوت مش متاحة دلوقتي. جرّب تاني أو اكتب رسالتك.");
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const transcript = result.choices?.[0]?.message?.content?.trim();
  if (!transcript || transcript === "[silence]") throw new Error("ماسمعتش كلام واضح. قرّب للمايك وجرّب تاني.");
  return { text: transcript.slice(0, 1200) };
}
