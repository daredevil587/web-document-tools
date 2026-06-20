export const FREE_FILE_LIMIT_MB = 50;

export interface RedactionRect {
  id: string;
  x: number; // 0..1 ratio of page width
  y: number; // 0..1 ratio of page height
  w: number; // 0..1 ratio of page width
  h: number; // 0..1 ratio of page height
}

export interface RenderedPage {
  pageIdx: number;      // 0-based
  dataUrl: string;
  pdfWidth: number;     // PDF space points
  pdfHeight: number;
}

/**
 * Renders all PDF pages as JPEG thumbnails for visual redaction selection.
 */
export async function renderRedactPageThumbs(
  file: File,
  onProgress: (pct: number, msg: string) => void
): Promise<RenderedPage[]> {
  onProgress(5, 'Loading PDF renderer…');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pct = 10 + Math.round(((i - 1) / pdf.numPages) * 85);
    onProgress(pct, `Loading page ${i} of ${pdf.numPages}…`);

    const page = await pdf.getPage(i);
    // Moderate scale for editor rendering
    const vp = page.getViewport({ scale: 1.0 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const canvasContext = canvas.getContext('2d')!;
    await (page.render as any)({ canvas, viewport: vp, canvasContext }).promise;

    pages.push({
      pageIdx: i - 1,
      dataUrl: canvas.toDataURL('image/jpeg', 0.8),
      pdfWidth: page.view[2] - page.view[0],
      pdfHeight: page.view[3] - page.view[1],
    });
  }

  onProgress(100, 'Done');
  return pages;
}

/**
 * Creates a redacted PDF.
 * Pages with redactions are rendered, blacked out on a canvas, flattened to JPEGs, and added to the output.
 * Pages without redactions are copied directly to preserve vector text quality and file size.
 */
export async function redactPdf(
  file: File,
  redactions: Record<number, RedactionRect[]>, // pageIdx (0-based) → redaction rectangles list
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(5, 'Loading libraries…');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const { PDFDocument } = await import('pdf-lib');
  
  onProgress(15, 'Reading original PDF…');
  const bytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  
  const outDoc = await PDFDocument.create();
  const numPages = pdf.numPages;

  for (let i = 0; i < numPages; i++) {
    const pageNum = i + 1;
    const pageBasePct = 20 + Math.round((i / numPages) * 70);
    const rects = redactions[i] ?? [];

    if (rects.length > 0) {
      onProgress(pageBasePct, `Sanitizing & flattening page ${pageNum} of ${numPages}…`);
      
      // Render page at high resolution scale for print readability in final PDF
      const page = await pdf.getPage(pageNum);
      const scale = 2.2;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d')!;
      
      // Render base page to canvas
      await (page.render as any)({ canvas, viewport: vp, canvasContext: ctx }).promise;

      // Draw solid black redaction rectangles on top of the rendered canvas pixels
      ctx.fillStyle = '#000000';
      rects.forEach(rect => {
        const rx = rect.x * canvas.width;
        const ry = rect.y * canvas.height;
        const rw = rect.w * canvas.width;
        const rh = rect.h * canvas.height;
        ctx.fillRect(rx, ry, rw, rh);
      });

      // Export canvas to JPEG
      const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const base64 = jpgDataUrl.split(',')[1];
      const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      // Create new page in output doc matching original page dimensions
      const originalPage = srcDoc.getPage(i);
      const { width, height } = originalPage.getSize();
      const newPage = outDoc.addPage([width, height]);

      // Draw the flattened redacted image covering the entire new page
      const embeddedImg = await outDoc.embedJpg(imgBytes);
      newPage.drawImage(embeddedImg, { x: 0, y: 0, width, height });
    } else {
      onProgress(pageBasePct, `Copying page ${pageNum} of ${numPages}…`);
      // Copy the original page directly to keep vector clarity and selectable text
      const [copiedPage] = await outDoc.copyPages(srcDoc, [i]);
      outDoc.addPage(copiedPage);
    }
  }

  onProgress(95, 'Compiling secure PDF…');
  const savedBytes = await outDoc.save();
  onProgress(100, 'Done');
  
  return new Blob([savedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
