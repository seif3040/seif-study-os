import type { ExamQuestion } from "./mistakeBooklet";

type Point = { x: number; y: number };
type Marker = Point & { size: number };

export const answerSheetLayout = { width: 440, height: 600, rows: 18, rowStart: 53, rowStep: 30, firstChoice: 106, choiceStep: 53 };

export function readBookletMarks(canvas: HTMLCanvasElement, rows: ExamQuestion[]) {
  const { width, height } = canvas;
  const context = canvas.getContext("2d");
  if (!context || !rows.length) return {};
  const rgba = context.getImageData(0, 0, width, height).data;
  const pixels = new Uint8Array(width * height);
  for (let index = 0; index < pixels.length; index++) {
    const offset = index * 4;
    pixels[index] = Number(rgba[offset] * 0.3 + rgba[offset + 1] * 0.59 + rgba[offset + 2] * 0.11 < 112);
  }

  const visited = pixels.slice();
  const markers: Marker[] = [];
  const minimum = Math.max(5, Math.floor(Math.min(width, height) * 0.009));
  const maximum = Math.min(width, height) * 0.11;
  for (let start = 0; start < visited.length; start++) {
    if (!visited[start]) continue;
    visited[start] = 0;
    const component = [start];
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (let i = 0; i < component.length; i++) {
      const position = component[i];
      const x = position % width;
      const y = Math.floor(position / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const neighbors = [x > 0 ? position - 1 : -1, x < width - 1 ? position + 1 : -1, position - width, position + width];
      for (const next of neighbors) {
        if (!visited[next]) continue;
        visited[next] = 0;
        component.push(next);
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (Math.min(w, h) < minimum || Math.max(w, h) > maximum || Math.min(w, h) / Math.max(w, h) < 0.65) continue;
    if (component.length / (w * h) > 0.82) markers.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, size: Math.sqrt(w * h) });
  }

  const [tl, tr, bl, br] = [
    (p: Point) => p.x + p.y, (p: Point) => width - p.x + p.y,
    (p: Point) => p.x + height - p.y, (p: Point) => width - p.x + height - p.y,
  ].map(distance => markers.reduce<Marker | undefined>((best, candidate) =>
    !best || distance(candidate) < distance(best) ? candidate : best, undefined));
  if (!tl || !tr || !bl || !br || new Set([tl, tr, bl, br]).size !== 4) return {};
  const sizes = [tl.size, tr.size, bl.size, br.size];
  if (Math.max(...sizes) > Math.min(...sizes) * 1.75
    || Math.min(tr.x - tl.x, br.x - bl.x) < width * 0.3
    || Math.min(bl.y - tl.y, br.y - tr.y) < height * 0.45) return {};

  const layout = answerSheetLayout;
  function darkness(x: number, y: number) {
    let filled = 0;
    let count = 0;
    for (let dy = -5; dy <= 5; dy += 2) for (let dx = -5; dx <= 5; dx += 2) {
      if (dx * dx + dy * dy > 28) continue;
      const u = (x + dx - 10) / (layout.width - 20);
      const v = (y + dy - 10) / (layout.height - 20);
      const project = (key: keyof Point) => (1 - v) * ((1 - u) * tl![key] + u * tr![key]) + v * ((1 - u) * bl![key] + u * br![key]);
      filled += pixels[Math.round(project("y")) * width + Math.round(project("x"))] ?? 0;
      count++;
    }
    return filled / count;
  }

  const answers: Record<string, string> = {};
  rows.forEach((item, row) => {
    const marked = item.options.map((option, index) => ({
      option, score: darkness(layout.firstChoice + layout.choiceStep * index, layout.rowStart + layout.rowStep * row),
    })).sort((a, b) => b.score - a.score);
    if (marked[0]?.score >= 0.55 && marked[0].score - (marked[1]?.score ?? 0) >= 0.3) answers[item.id] = marked[0].option;
  });
  return answers;
}
