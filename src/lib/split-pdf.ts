export const FREE_FILE_LIMIT_MB = 100;

export interface PageInfo {
  pageNum: number;   // 1-based
  thumbDataUrl: string;
  selected: boolean;
}

/** Render all pages as small thumbnails so the user can choose which to extract */
export async function renderPageThumbs(
  file: File,
  onProgress: (pct: number, msg: string) => void
): Promise<PageInfo[]> {
  onProgress(5, 'Loading PDF renderer…');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const thumbs: PageInfo[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pct = 10 + Math.round(((i - 1) / pdf.numPages) * 85);
    onProgress(pct, `Loading page ${i} of ${pdf.numPages}…`);

    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 0.4 }); // small thumbnail
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const canvasContext = canvas.getContext('2d')!;
    await (page.render as any)({ canvas, viewport: vp, canvasContext }).promise;

    thumbs.push({
      pageNum: i,
      thumbDataUrl: canvas.toDataURL('image/jpeg', 0.7),
      selected: true,
    });
  }

  onProgress(100, 'Done');
  return thumbs;
}

/** Extract selected pages into a new PDF */
export async function extractPages(
  file: File,
  selectedPages: number[],   // 1-based page numbers
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(10, 'Loading PDF library…');
  const { PDFDocument } = await import('pdf-lib');

  onProgress(30, 'Reading PDF…');
  const bytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  onProgress(50, 'Extracting pages…');
  const newDoc = await PDFDocument.create();
  const indices = selectedPages.map(n => n - 1);  // 0-based
  const copied = await newDoc.copyPages(srcDoc, indices);
  copied.forEach(p => newDoc.addPage(p));

  onProgress(90, 'Saving…');
  const saved = await newDoc.save();
  onProgress(100, 'Done');
  return new Blob([saved.buffer as ArrayBuffer], { type: 'application/pdf' });
}
