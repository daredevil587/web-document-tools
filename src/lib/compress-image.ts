// FREE_FILE_LIMIT_MB — future Pro gate
export const FREE_FILE_LIMIT_MB = 20;

export interface CompressResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  filename: string;
}

export async function compressImage(
  file: File,
  quality: number = 0.8,
  onProgress: (pct: number, msg: string) => void
): Promise<CompressResult> {
  onProgress(10, 'Loading compression library…');
  const imageCompression = (await import('browser-image-compression')).default;

  onProgress(30, 'Compressing…');
  const compressed = await imageCompression(file, {
    maxSizeMB: quality > 0.7 ? 1 : 0.5,
    maxWidthOrHeight: 4096,
    useWebWorker: true,
    fileType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
    initialQuality: quality,
    onProgress: (p) => onProgress(30 + Math.round(p * 0.65), 'Compressing…'),
  });

  onProgress(100, 'Done');
  return {
    blob: compressed,
    originalSize: file.size,
    compressedSize: compressed.size,
    filename: file.name,
  };
}
