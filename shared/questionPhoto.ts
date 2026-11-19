const optionPrefix = /^(?:[(（]\s*([أابجدهـA-Fa-f])\s*[)）]|([أابجدهـA-Fa-f])\s*[-–.:،)])[ \t]*/;
const answerPrefix = /^(?:الإجابة\s+الصحيحة|الاجابة\s+الصحيحة|الإجابة\s+النموذجية|الاجابة\s+النموذجية|Correct\s+answer|Answer\s+key)\s*[:：–-]\s*/i;
const normalizeLabel = (value: string) => value.toLowerCase().replace("أ", "ا");

export function questionFromText(text: string) {
  const question: string[] = [];
  const choices: { label: string; text: string }[] = [];
  let answer = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (answerPrefix.test(line)) {
      answer = line.replace(answerPrefix, "").trim();
      continue;
    }
    const option = line.match(optionPrefix);
    const missedSeparator = choices.length ? line.match(/^([أابجدهـ])\s+(.+)$/) : null;
    const label = option ? normalizeLabel(option[1] || option[2]) : missedSeparator ? normalizeLabel(missedSeparator[1]) : "";
    if (option || (missedSeparator && !choices.some(choice => choice.label === label))) {
      const choice = option ? line.slice(option[0].length).trim() : missedSeparator![2].trim();
      if (choice) choices.push({ label, text: choice });
    } else if (choices.length) {
      choices[choices.length - 1].text += " " + line;
    } else {
      question.push(line);
    }
  }
  const options = Array.from(new Set(choices.map(choice => choice.text.slice(0, 250)))).slice(0, 6);
  if (options.length < 2) {
    return { question: text.split(/\r?\n/).filter(line => !answerPrefix.test(line.trim())).join("\n").trim().slice(0, 1500), options: [], answer: answer.slice(0, 1200) };
  }
  const answerLabel = normalizeLabel(answer.replace(/[\s().:،\-]/g, ""));
  const marked = options.includes(answer) ? answer : choices.find(choice => choice.label === answerLabel)?.text.slice(0, 250);
  return { question: question.join("\n").slice(0, 1500), options, answer: marked && options.includes(marked) ? marked : "" };
}
