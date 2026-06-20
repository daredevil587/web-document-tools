// FREE_FILE_LIMIT_MB — future Pro gate
export const FREE_FILE_LIMIT_MB = 50;

export interface PageImage {
  dataUrl: string;
  pageNum: number;
  filename: string;
}

export async function pdfToImages(
  file: File,
  scale: number = 2,
  onProgress: (pct: number, msg: string) => void
): Promise<PageImage[]> {
  onProgress(5, 'Loading PDF renderer…');

  // Lazy-load pdfjs — only when this tool is actually used
  const pdfjsLib = await import('pdfjs-dist');

  // Use a pinned CDN worker URL that matches the installed version
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  onProgress(15, 'Reading PDF…');
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  const results: PageImage[] = [];
  const base = file.name.replace(/\.pdf$/i, '');

  for (let i = 1; i <= pdf.numPages; i++) {
    const pct = 15 + Math.round(((i - 1) / pdf.numPages) * 80);
    onProgress(pct, `Rendering page ${i} of ${pdf.numPages}…`);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const canvasContext = canvas.getContext('2d')!;

    // Support both new canvas API (v4+) and legacy canvasContext API
    const renderTask = (page.render as any)({ canvas, viewport, canvasContext });
    await renderTask.promise;

    results.push({
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      pageNum: i,
      filename: pdf.numPages === 1 ? `${base}.jpg` : `${base}-page-${i}.jpg`,
    });
  }

  onProgress(100, 'Done');
  return results;
}
