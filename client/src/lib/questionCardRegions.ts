type Band = { start: number; end: number; green: boolean };

export function questionCardRegions(canvas: HTMLCanvasElement) {
  const { width, height } = canvas;
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  const color = (x: number, y: number) => pixels.subarray((y * width + Math.floor(width * x)) * 4, (y * width + Math.floor(width * x)) * 4 + 3);
  const bands: Band[] = [];
  let band: Band | undefined;
  for (let y = 0; y < height; y++) {
    const margin = color(0.022, y);
    const center = color(0.36, y);
    const distinct = center.every(value => value > 200) &&
      Math.max(...Array.from(center, (value, index) => Math.abs(value - margin[index]))) >= 3;
    if (distinct) {
      band ??= { start: y, end: y, green: false };
      band.end = y + 1;
      if (center[1] - center[0] > 12 && center[1] > center[2]) band.green = true;
    } else if (band) {
      bands.push(band);
      band = undefined;
    }
  }

  const substantial = bands.filter(item => item.end - item.start >= height * 0.055);
  const marked = substantial.findIndex(item => item.green);
  if (marked < 0) return;
  const reference = substantial[marked];
  const rowHeight = reference.end - reference.start;
  let first = marked;
  let last = marked;
  const adjacent = (a: Band, b: Band) => b.start - a.end < rowHeight * 0.55 &&
    [a, b].every(row => Math.abs(row.end - row.start - rowHeight) < rowHeight * 0.23);
  while (first > 0 && adjacent(substantial[first - 1], substantial[first])) first--;
  while (last + 1 < substantial.length && adjacent(substantial[last], substantial[last + 1])) last++;
  if (last - first < 2 || last - first > 5) return;

  const headerLimit = substantial[first].start - rowHeight * 2;
  let top = -1;
  let bottom = -1;
  for (let y = Math.floor(height * 0.025); y < headerLimit; y++) {
    let dark = 0;
    for (let x = Math.floor(width * 0.24); x < width * 0.926; x++) {
      const offset = (y * width + x) * 4;
      if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 180) dark++;
    }
    if (dark > width * 0.003) {
      if (bottom >= 0 && y - bottom > rowHeight * 0.22) break;
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0 || bottom - top < 4) return;
  const gap = Math.ceil(rowHeight * 0.08);
  return {
    header: { start: Math.max(0, top - gap), end: bottom + gap },
    options: substantial.slice(first, last + 1),
    answer: marked - first,
  };
}

export function cropQuestionLine(source: HTMLCanvasElement, band: { start: number; end: number }) {
  let left = Math.round(source.width * 0.17);
  const right = Math.round(source.width * 0.926);
  const width = right - left;
  const sourceContext = source.getContext("2d")!;
  const rowHeight = band.end - band.start;
  const sample = sourceContext.getImageData(left, band.start, right - left, rowHeight);
  let minX = sample.width;
  let maxX = -1;
  let minY = rowHeight;
  let maxY = -1;
  for (let y = Math.floor(rowHeight * 0.12); y < rowHeight * 0.88; y++) {
    for (let x = 0; x < sample.width; x++) {
      const pixel = (y * sample.width + x) * 4;
      const red = sample.data[pixel], green = sample.data[pixel + 1], blue = sample.data[pixel + 2];
      if (red * 0.3 + green * 0.59 + blue * 0.11 > 166) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const found = maxX >= minX && maxY >= minY;
  if (found) left += Math.max(0, minX - 5);
  const croppedWidth = found ? Math.min(sample.width, maxX + 6) - Math.max(0, minX - 5) : width;
  const top = found ? Math.max(0, minY - 5) : 0;
  const height = (found ? Math.min(rowHeight, maxY + 6) : rowHeight) - top;
  const crop = document.createElement("canvas");
  crop.width = croppedWidth * 2 + 24;
  crop.height = height * 2 + 16;
  const context = crop.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, crop.width, crop.height);
  context.drawImage(source, left, band.start + top, croppedWidth, height, 12, 8, croppedWidth * 2, height * 2);
  const pixels = context.getImageData(0, 0, crop.width, crop.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.min(255, Math.max(0, (pixels.data[i] * 0.3 + pixels.data[i + 1] * 0.59 + pixels.data[i + 2] * 0.11 - 80) * 1.8));
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return crop;
}
