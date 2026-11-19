import { answerSheetLayout } from "./readBookletMarks";
import { mistakeSchema, type StudyResources } from "@shared/studyResources";

export type Mistake = StudyResources["mistakes"][number];
export type ExamQuestion = Pick<Mistake, "id" | "subjectId" | "lessonId" | "question" | "kind" | "options" | "answer">;
export type Booklet = { code: string; date: string; questions: ExamQuestion[] };

export const letters = "ABCDEF";

export function readBooklets(key: string): Booklet[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item): item is Booklet => typeof item?.code === "string"
      && typeof item.date === "string" && Array.isArray(item.questions) && item.questions.length > 0
      && item.questions.every((question: unknown) => mistakeSchema.safeParse(question).success));
  } catch {
    return [];
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
}[char] ?? char));

export function bookletHtml(booklet: Booklet) {
  const questions = booklet.questions.map((item, index) => ({
    ...item,
    number: index + 1,
  }));
  const choices = questions.filter(item => item.kind === "choice");
  const layout = answerSheetLayout;
  const sheets = Array.from({ length: Math.ceil(choices.length / layout.rows) }, (_, i) => choices.slice(i * layout.rows, (i + 1) * layout.rows));
  const corners = [[10, 10], [layout.width - 10, 10], [10, layout.height - 10], [layout.width - 10, layout.height - 10]];
  const at = (left: number, top: number) => ' style="left:' + left + 'px;top:' + top + 'px"';
  const articles = questions.map(item => [
    '<article><strong class="number">' + item.number + '</strong><div class="question" dir="auto">' + escapeHtml(item.question) + '</div>',
    item.kind === "choice"
      ? '<ul>' + item.options.map((option, i) => '<li><bdi class="letter">' + letters[i] + '</bdi><span dir="auto">' + escapeHtml(option) + '</span></li>').join("") + '</ul>'
      : '<div class="lines"></div><div class="lines"></div><div class="lines"></div>',
    '</article>',
  ].join("")).join("");
  const answerPages = sheets.map((sheet, index) => [
    '<section class="answer-sheet"><div class="frame"><p class="brand" dir="ltr">Seif Study OS</p>',
    '<h2>ورقة الإجابة · ' + (index + 1) + ' من ' + sheets.length + '</h2>',
    '<p>ظلّل دايرة واحدة بقلم غامق قدام كل سؤال. لما تصوّر، خلّي الأربع مربعات السودا باينة.</p>',
    '<p>كود الملزمة <bdi>' + escapeHtml(booklet.code) + '</bdi></p>',
    '<div class="answers" dir="ltr" style="width:' + layout.width + 'px;height:' + layout.height + 'px">',
    corners.map(([x, y]) => '<i class="marker"' + at(x, y) + '></i>').join(""),
    Array.from(letters, (letter, i) => '<b class="cell"' + at(layout.firstChoice + layout.choiceStep * i, 24) + '>' + letter + '</b>').join(""),
    sheet.map((item, row) => {
      const y = layout.rowStart + layout.rowStep * row;
      return '<b class="cell"' + at(47, y) + '>' + item.number + '</b>' + item.options.map((_, i) =>
        '<span class="bubble"' + at(layout.firstChoice + layout.choiceStep * i, y) + '></span>').join("");
    }).join(""),
    '</div></div></section>',
  ].join("")).join("");
  return [
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">',
    '<title>ملزمة كشكول الأخطاء – ' + escapeHtml(booklet.code) + '</title>',
    '<style>',
    '@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#142820;font:14px/1.6 Arial,sans-serif}',
    'h1,h2,p{margin:0 0 10px}h1{font-size:40px}h2{font-size:22px}.brand{color:#375e48;font-size:15px;font-weight:bold}',
    '.frame{border:2px solid #375e48;padding:10mm}.cover{break-after:page}.cover .frame{min-height:240mm;display:flex;flex-direction:column;justify-content:center}',
    '.cover .name{margin-top:24mm}.question{white-space:pre-wrap;overflow-wrap:anywhere;font-weight:bold}',
    'article{position:relative;border-top:1px solid #9fb5a9;padding:4mm 12mm 4mm 0;break-inside:avoid}',
    '.number{position:absolute;inset-inline-start:0;top:4mm}.letter{display:inline-block;min-width:8mm}',
    'ul{list-style:none;margin:2mm 0 0;padding:0}li{overflow-wrap:anywhere}.lines{height:8mm;border-bottom:1px solid #b9c6bf}',
    '.answer-sheet{break-before:page}.answers{position:relative;font:15px/1 Arial,sans-serif;margin:5mm auto 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.answers>*{position:absolute;transform:translate(-50%,-50%)}.marker{width:16px;height:16px;background:#000}',
    '.bubble{width:18px;height:18px;border:1.5px solid #333;border-radius:50%}',
    '</style><body>',
    '<section class="cover"><div class="frame"><p class="brand" dir="ltr">Seif Study OS</p><h1>ملزمة كشكول الأخطاء</h1>',
    '<p>' + questions.length + ' سؤال · ' + escapeHtml(booklet.date) + '</p>',
    '<p>كود الملزمة <bdi>' + escapeHtml(booklet.code) + '</bdi></p>',
    '<p class="name">الاسم __________________________________</p></div></section>',
    '<main><h2>الأسئلة</h2>' + articles + '</main>',
    answerPages,
    '</body></html>',
  ].join("");
}

export function printBooklet(booklet: Booklet) {
  const frame = document.createElement("iframe");
  frame.title = "معاينة طباعة ملزمة الأخطاء";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0";
  frame.onload = () => {
    const preview = frame.contentWindow;
    if (!preview) { frame.remove(); return; }
    preview.addEventListener("afterprint", () => frame.remove(), { once: true });
    preview.print();
  };
  frame.srcdoc = bookletHtml(booklet);
  document.body.append(frame);
}
