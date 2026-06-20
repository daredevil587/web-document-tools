export const FREE_FILE_LIMIT_MB = 20;

type ConvertFormat = 'jpeg' | 'png' | 'webp';

export async function convertImage(
  file: File,
  targetFormat: ConvertFormat,
  quality: number,
  onProgress: (pct: number, msg: string) => void
): Promise<{ blob: Blob; originalSize: number; convertedSize: number; ext: string }> {
  onProgress(10, 'Reading image…');

  const bitmap = await createImageBitmap(file);
  onProgress(50, 'Converting…');

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);

  onProgress(80, 'Encoding…');
  const mimeType = targetFormat === 'jpeg' ? 'image/jpeg'
    : targetFormat === 'webp' ? 'image/webp'
    : 'image/png';

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('Conversion failed')),
      mimeType,
      targetFormat !== 'png' ? quality : undefined
    );
  });

  const ext = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
  onProgress(100, 'Done');
  return { blob, originalSize: file.size, convertedSize: blob.size, ext };
}
