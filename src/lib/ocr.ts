import { createWorker } from 'tesseract.js';

export const FREE_FILE_LIMIT_MB = 30; // Max size for OCR processing to keep memory usage low

/**
 * Recognizes text in a standard image file (PNG, JPG, WebP) client-side.
 */
export async function runImageOcr(
  file: File,
  lang: string,
  onProgress: (pct: number, msg: string) => void
): Promise<string> {
  onProgress(5, 'Initializing OCR engine…');
  
  // Create worker with progress logging
  const worker = await createWorker({
    logger: m => {
      if (m.status === 'recognizing text') {
        const progressPct = 10 + Math.round(m.progress * 85);
        onProgress(progressPct, `Recognizing text (${Math.round(m.progress * 100)}%)…`);
      } else {
        onProgress(8, `Initializing: ${m.status}…`);
      }
    }
  });

  try {
    onProgress(10, `Loading language data (${lang})…`);
    await worker.loadLanguage(lang);
    await worker.initialize(lang);

    onProgress(15, 'Running text recognition…');
    const { data: { text } } = await worker.recognize(file);
    
    onProgress(100, 'Done');
    return text;
  } catch (err: any) {
    throw new Error(err?.message ?? 'OCR recognition failed.');
  } finally {
    await worker.terminate();
  }
}

/**
 * Recognizes text in a PDF document page-by-page client-side.
 * Renders pages using pdfjs-dist and runs Tesseract recognition on each canvas.
 */
export async function runPdfOcr(
  file: File,
  lang: string,
  onProgress: (pct: number, msg: string) => void
): Promise<string> {
  onProgress(2, 'Loading PDF renderer…');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const numPages = pdf.numPages;

  onProgress(5, 'Initializing OCR engine…');
  const worker = await createWorker();

  try {
    onProgress(7, `Loading language data (${lang})…`);
    await worker.loadLanguage(lang);
    await worker.initialize(lang);

    let combinedText = '';

    for (let i = 1; i <= numPages; i++) {
      const pageBasePct = 10 + Math.round(((i - 1) / numPages) * 90);
      onProgress(pageBasePct, `Rendering page ${i} of ${numPages}…`);

      // Render page to canvas with high resolution scale for better OCR accuracy
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.8 }); 
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const canvasContext = canvas.getContext('2d')!;
      await (page.render as any)({ canvas, viewport: vp, canvasContext }).promise;

      onProgress(pageBasePct + 3, `Extracting text from page ${i} of ${numPages}…`);
      const { data: { text } } = await worker.recognize(canvas);
      
      combinedText += `--- Page ${i} ---\n\n${text}\n\n`;
    }

    onProgress(100, 'Done');
    return combinedText.trim();
  } catch (err: any) {
    throw new Error(err?.message ?? 'PDF OCR recognition failed.');
  } finally {
    await worker.terminate();
  }
}
