export const FREE_FILE_LIMIT_MB = 50;

/**
 * Converts a color PDF document page-by-page into grayscale client-side.
 * Renders pages using pdfjs-dist, converts canvas pixels to grayscale, and compiles with pdf-lib.
 */
export async function convertPdfToGrayscale(
  file: File,
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(2, 'Loading PDF renderer…');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const { PDFDocument } = await import('pdf-lib');

  onProgress(10, 'Reading original PDF…');
  const bytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  
  const outDoc = await PDFDocument.create();
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    const pageBasePct = 15 + Math.round(((i - 1) / numPages) * 75);
    onProgress(pageBasePct, `Rendering page ${i} of ${numPages}…`);

    // Render page to canvas at high resolution for quality preservation
    const page = await pdf.getPage(i);
    const scale = 2.0; 
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d')!;
    
    await (page.render as any)({ canvas, viewport: vp, canvasContext: ctx }).promise;

    onProgress(pageBasePct + 2, `Converting page ${i} to grayscale…`);
    
    // Perform pixel-level grayscale brightness conversion
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let k = 0; k < data.length; k += 4) {
      const r = data[k];
      const g = data[k + 1];
      const b = data[k + 2];
      // Standard BT.601 luma formula for gray intensity matching human eyes
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      data[k] = gray;
      data[k + 1] = gray;
      data[k + 2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);

    // Export canvas to JPEG
    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const base64 = jpgDataUrl.split(',')[1];
    const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    // Match page size in the output document
    const originalPage = srcDoc.getPage(i - 1);
    const { width, height } = originalPage.getSize();
    const newPage = outDoc.addPage([width, height]);

    // Draw the grayscale image onto the new page
    const embeddedImg = await outDoc.embedJpg(imgBytes);
    newPage.drawImage(embeddedImg, { x: 0, y: 0, width, height });
  }

  onProgress(92, 'Generating grayscale PDF document…');
  const savedBytes = await outDoc.save();
  onProgress(100, 'Done');
  
  return new Blob([savedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
