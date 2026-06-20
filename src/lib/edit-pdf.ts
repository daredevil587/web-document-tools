export const FREE_FILE_LIMIT_MB = 50;

export interface TextAnnotation {
  id: string;
  type: 'text';
  pageIdx: number;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export interface ImageAnnotation {
  id: string;
  type: 'image';
  pageIdx: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

export type Annotation = TextAnnotation | ImageAnnotation;

export interface RenderedPage {
  pageIdx: number;
  dataUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  pdfWidth: number;
  pdfHeight: number;
  scale: number;
}

export interface FormField {
  name: string;
  fieldType: string;
  value: string;
}

// A text block extracted from the PDF that the user can edit in place
export interface TextItem {
  id: string;
  pageIdx: number;
  originalText: string;
  currentText: string;
  color: string;        // sampled from rendered canvas, e.g. "rgb(0,0,0)"
  // Canvas-space coordinates (at render scale)
  canvasX: number;
  canvasY: number;      // top of the text div in canvas px
  canvasWidth: number;
  canvasFontSize: number;
  // PDF-space coordinates (points)
  pdfX: number;
  pdfY: number;         // baseline y from bottom of page
  pdfWidth: number;
  pdfFontSize: number;
}

export async function renderPages(
  file: File,
  scale = 1.8,
  onProgress: (pct: number, msg: string) => void
): Promise<RenderedPage[]> {
  onProgress(5, 'Loading PDF renderer…');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const rendered: RenderedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pct = 10 + Math.round(((i - 1) / pdf.numPages) * 85);
    onProgress(pct, `Rendering page ${i} of ${pdf.numPages}…`);

    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale });
    const vp1 = page.getViewport({ scale: 1 });

    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const canvasContext = canvas.getContext('2d')!;
    await (page.render as any)({ canvas, viewport: vp, canvasContext }).promise;

    rendered.push({
      pageIdx: i - 1,
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      canvasWidth: vp.width,
      canvasHeight: vp.height,
      pdfWidth: vp1.width,
      pdfHeight: vp1.height,
      scale,
    });
  }

  onProgress(100, 'Ready to edit');
  return rendered;
}

export async function extractTextItems(
  file: File,
  pages: RenderedPage[]
): Promise<TextItem[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const items: TextItem[] = [];

  // One offscreen canvas reused per page to sample pixel colors
  const samplingCanvas = document.createElement('canvas');
  const samplingCtx = samplingCanvas.getContext('2d')!;
  let samplingData: Uint8ClampedArray | null = null;
  let samplingWidth = 0;
  let samplingHeight = 0;

  for (let pi = 0; pi < pdf.numPages; pi++) {
    const pg = pages[pi];
    if (!pg) continue;

    // Load this page's rendered image for color sampling
    samplingData = null;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = pg.dataUrl;
      });
      samplingCanvas.width = pg.canvasWidth;
      samplingCanvas.height = pg.canvasHeight;
      samplingCtx.drawImage(img, 0, 0);
      samplingWidth = pg.canvasWidth;
      samplingHeight = pg.canvasHeight;
      samplingData = samplingCtx.getImageData(0, 0, samplingWidth, samplingHeight).data;
    } catch { /* color sampling unavailable — fall back to default */ }

    const page = await pdf.getPage(pi + 1);
    const textContent = await page.getTextContent();

    for (const raw of textContent.items) {
      if (!('str' in raw) || !raw.str || !raw.str.trim()) continue;

      const t = raw.transform; // [a, b, c, d, e, f]
      const pdfFontSize = Math.abs(t[3]) || Math.abs(t[0]) || 10;
      const pdfX = t[4];
      const pdfY = t[5]; // baseline y from bottom of page
      const pdfWidth = (raw.width ?? 0) > 0 ? raw.width! : pdfFontSize * raw.str.length * 0.55;

      const scale = pg.scale;
      const canvasX = pdfX * scale;
      const baselineCanvas = (pg.pdfHeight - pdfY) * scale;
      const canvasY = baselineCanvas - pdfFontSize * scale * 0.9;
      const canvasWidth = pdfWidth * scale;
      const canvasFontSize = pdfFontSize * scale;

      if (canvasFontSize < 5) continue;

      // Sample the actual rendered text color from the page image
      const color = samplingData
        ? sampleDarkestPixel(samplingData, samplingWidth, samplingHeight, canvasX, canvasY, canvasFontSize)
        : '#1a1a1a';

      items.push({
        id: crypto.randomUUID(),
        pageIdx: pi,
        originalText: raw.str,
        currentText: raw.str,
        color,
        canvasX,
        canvasY,
        canvasWidth,
        canvasFontSize,
        pdfX,
        pdfY,
        pdfWidth,
        pdfFontSize,
      });
    }
  }

  return items;
}

// Find the darkest pixel inside the text bounding box — that's the glyph color.
function sampleDarkestPixel(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  fontSize: number
): string {
  let darkestLum = 256;
  let dr = 26, dg = 26, db = 26; // default near-black fallback

  // Scan a grid of sample points inside the cap-height zone
  const xStart = Math.max(0, Math.round(x + 1));
  const xEnd   = Math.min(imgW - 1, Math.round(x + fontSize * 1.5));
  const yStart = Math.max(0, Math.round(y + fontSize * 0.1));
  const yEnd   = Math.min(imgH - 1, Math.round(y + fontSize * 0.75));
  const xStep  = Math.max(1, Math.round((xEnd - xStart) / 8));
  const yStep  = Math.max(1, Math.round((yEnd - yStart) / 4));

  for (let sy = yStart; sy <= yEnd; sy += yStep) {
    for (let sx = xStart; sx <= xEnd; sx += xStep) {
      const i = (sy * imgW + sx) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < darkestLum) { darkestLum = lum; dr = r; dg = g; db = b; }
    }
  }

  // If darkest pixel is still near-white, no readable glyph found → default
  if (darkestLum > 190) return '#1a1a1a';
  return `rgb(${dr},${dg},${db})`;
}

export async function detectFormFields(file: File): Promise<FormField[]> {
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    return form.getFields().map(f => ({
      name: f.getName(),
      fieldType: f.constructor.name.replace(/^PDF/, '').replace(/Field$/, ''),
      value: '',
    }));
  } catch {
    return [];
  }
}

export async function saveEdited(
  file: File,
  annotations: Annotation[],
  textItems: TextItem[],
  formValues: Record<string, string>,
  pages: RenderedPage[],
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(10, 'Loading PDF library…');
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pdfPages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Fill AcroForm fields
  if (Object.keys(formValues).length > 0) {
    onProgress(20, 'Filling form fields…');
    try {
      const form = pdfDoc.getForm();
      for (const [name, value] of Object.entries(formValues)) {
        try {
          const field = form.getField(name);
          const typeName = field.constructor.name;
          if (typeName === 'PDFTextField') {
            (field as { setText(v: string): void }).setText(value);
          } else if (typeName === 'PDFCheckBox') {
            if (value === 'true') (field as { check(): void }).check();
          }
        } catch { /* field type mismatch — skip */ }
      }
    } catch { /* no form */ }
  }

  // Apply edited text items (white-out original, draw new)
  const modifiedItems = textItems.filter(t => t.currentText !== t.originalText);
  if (modifiedItems.length > 0) {
    onProgress(35, `Applying ${modifiedItems.length} text edit(s)…`);
    for (const item of modifiedItems) {
      const page = pdfPages[item.pageIdx];
      if (!page) continue;

      // Cover original text with a white rectangle — generous margins so nothing leaks through
      page.drawRectangle({
        x: item.pdfX - 2,
        y: item.pdfY - item.pdfFontSize * 0.3,
        width: item.pdfWidth + 4,
        height: item.pdfFontSize * 1.35,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });

      // Draw replacement text (skip if user cleared it)
      if (item.currentText.trim()) {
        page.drawText(item.currentText, {
          x: item.pdfX,
          y: item.pdfY,
          size: item.pdfFontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  onProgress(55, 'Applying annotations…');

  // Apply new annotations (added by user via toolbar)
  for (const ann of annotations) {
    const page = pdfPages[ann.pageIdx];
    const pg = pages[ann.pageIdx];
    if (!page || !pg) continue;

    const { scale, pdfHeight } = pg;

    if (ann.type === 'text') {
      const pdfX = ann.x / scale;
      const pdfY = pdfHeight - ann.y / scale - ann.fontSize * 0.85;

      const hex = ann.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;

      page.drawText(ann.text || '', {
        x: Math.max(0, pdfX),
        y: Math.max(0, pdfY),
        size: ann.fontSize,
        font,
        color: rgb(r, g, b),
      });
    } else if (ann.type === 'image') {
      const pdfX = ann.x / scale;
      const pdfW = ann.width / scale;
      const pdfH = ann.height / scale;
      const pdfY = pdfHeight - ann.y / scale - pdfH;

      const imgBytes = dataUrlToBytes(ann.dataUrl);
      const isPng = ann.dataUrl.startsWith('data:image/png');
      const embeddedImg = isPng
        ? await pdfDoc.embedPng(imgBytes)
        : await pdfDoc.embedJpg(imgBytes);

      page.drawImage(embeddedImg, {
        x: Math.max(0, pdfX),
        y: Math.max(0, pdfY),
        width: pdfW,
        height: pdfH,
      });
    }
  }

  onProgress(90, 'Saving PDF…');
  const saved = await pdfDoc.save();
  onProgress(100, 'Done');
  return new Blob([saved.buffer as ArrayBuffer], { type: 'application/pdf' });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
