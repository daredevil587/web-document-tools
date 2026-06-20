import { useState, useRef, useCallback } from 'react';
import { convertImage, FREE_FILE_LIMIT_MB } from '../../lib/convert-image';
import { formatBytes, triggerDownload } from '../../lib/utils';

type State = 'upload' | 'ready' | 'processing' | 'done' | 'error';
type Format = 'jpeg' | 'png' | 'webp';
const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

const FORMAT_LABELS: Record<Format, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' };

export default function ConvertImageTool() {
  const [state, setState] = useState<State>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [targetFormat, setTargetFormat] = useState<Format>('webp');
  const [quality, setQuality] = useState(0.88);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<{ blob: Blob; originalSize: number; convertedSize: number; ext: string } | null>(null);
  const [convertedPreview, setConvertedPreview] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) { setErrorMsg('Please select a JPG, PNG, or WebP image.'); setState('error'); return; }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) { setErrorMsg(`File exceeds ${FREE_FILE_LIMIT_MB} MB.`); setState('error'); return; }
    setFile(f);
    // Auto-select a different format than the source
    const srcExt = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (srcExt === 'png') setTargetFormat('webp');
    else if (srcExt === 'webp') setTargetFormat('jpeg');
    else setTargetFormat('webp');
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target!.result as string);
    reader.readAsDataURL(f);
    setState('ready');
  }, []);

  const run = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    try {
      const res = await convertImage(file, targetFormat, quality, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setResult(res);
      const reader = new FileReader();
      reader.onload = e => setConvertedPreview(e.target!.result as string);
      reader.readAsDataURL(res.blob);
      setState('done');
      const stem = file.name.replace(/\.[^.]+$/, '');
      triggerDownload(res.blob, `${stem}.${res.ext}`);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not convert image.');
      setState('error');
    }
  };

  const reset = () => { setFile(null); setPreview(''); setConvertedPreview(''); setResult(null); setErrorMsg(''); setState('upload'); };
  const srcType = file?.type.replace('image/', '').replace('jpeg','jpg') ?? '';
  const needsQuality = targetFormat !== 'png';

  return (
    <div>
      {state === 'upload' && (
        <div
          className={`upload-area${dragOver ? ' dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <div className="upload-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="#6366f1" strokeWidth="2"/>
              <circle cx="8.5" cy="8.5" r="1.5" stroke="#6366f1" strokeWidth="2"/>
              <polyline points="21 15 16 10 5 21" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>Drag &amp; Drop your image here</h3>
          <p className="upload-sub">JPG, PNG, WebP accepted</p>
          <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button className="btn-upload" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>Choose Image</button>
          <p className="file-limit">Supports: JPG, PNG, WebP · Max size: {FREE_FILE_LIMIT_MB} MB</p>
        </div>
      )}

      {state === 'ready' && file && (
        <div>
          <div style={{ display:'flex', gap:'16px', alignItems:'flex-start', marginBottom:'20px', flexWrap:'wrap' }}>
            {preview && (
              <div style={{ flexShrink:0, textAlign:'center' }}>
                <img src={preview} alt="Preview" style={{ maxWidth:'140px', maxHeight:'140px', borderRadius:'8px', border:'1px solid var(--border)', objectFit:'contain' }} />
                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>{srcType.toUpperCase()} · {formatBytes(file.size)}</p>
              </div>
            )}
            <div style={{ flex:1, minWidth:'200px' }}>
              <div className="file-item" style={{ marginBottom:'16px' }}>
                <div className="file-item-icon">🖼️</div>
                <div className="file-item-info">
                  <div className="file-item-name">{file.name}</div>
                  <div className="file-item-size">{formatBytes(file.size)}</div>
                </div>
                <button className="btn-remove-file" onClick={reset}>✕</button>
              </div>

              <div style={{ marginBottom:'16px' }}>
                <label style={{ fontSize:'0.88rem', fontWeight:'700', display:'block', marginBottom:'8px' }}>Convert to:</label>
                <div style={{ display:'flex', gap:'8px' }}>
                  {(['jpeg','png','webp'] as Format[]).map(fmt => (
                    <button
                      key={fmt}
                      className={`toolbar-btn${targetFormat === fmt ? ' active' : ''}`}
                      onClick={() => setTargetFormat(fmt)}
                      style={{ flex:1 }}
                    >
                      {FORMAT_LABELS[fmt]}
                    </button>
                  ))}
                </div>
              </div>

              {needsQuality && (
                <div style={{ marginBottom:'16px' }}>
                  <label style={{ fontSize:'0.88rem', fontWeight:'700', display:'block', marginBottom:'8px' }}>
                    Quality: <span style={{ color:'var(--primary)' }}>{Math.round(quality * 100)}%</span>
                  </label>
                  <input type="range" min={50} max={100} value={Math.round(quality * 100)}
                    onChange={e => setQuality(Number(e.target.value) / 100)}
                    style={{ width:'100%', accentColor:'var(--primary)' }} />
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>
                    <span>Smaller file</span><span>Higher quality</span>
                  </div>
                </div>
              )}

              <button className="btn-action" onClick={run}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Convert to {FORMAT_LABELS[targetFormat]}
              </button>
            </div>
          </div>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Converting…</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${progress}%` }}/></div>
          <div className="progress-footer"><span>Please wait</span><span className="progress-pct">{progress}%</span></div>
        </div>
      )}

      {state === 'done' && result && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e"/><polyline points="7.5 12 10.5 15 16.5 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3>Conversion Complete!</h3>

          {convertedPreview && (
            <div style={{ display:'flex', gap:'20px', justifyContent:'center', margin:'12px 0 16px', flexWrap:'wrap' }}>
              <div style={{ textAlign:'center' }}>
                <img src={preview} alt="Original" style={{ width:'110px', height:'110px', objectFit:'contain', borderRadius:'8px', border:'1px solid var(--border)' }} />
                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>{srcType.toUpperCase()}</p>
              </div>
              <div style={{ textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', color:'var(--text-muted)' }}>→</div>
              <div style={{ textAlign:'center' }}>
                <img src={convertedPreview} alt="Converted" style={{ width:'110px', height:'110px', objectFit:'contain', borderRadius:'8px', border:'1px solid var(--border)' }} />
                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>{FORMAT_LABELS[targetFormat]}</p>
              </div>
            </div>
          )}

          <div className="result-meta">
            <div className="result-meta-item"><strong>{formatBytes(result.originalSize)}</strong><small>Original</small></div>
            <div className="result-meta-divider"/>
            <div className="result-meta-item"><strong>{formatBytes(result.convertedSize)}</strong><small>{FORMAT_LABELS[targetFormat]}</small></div>
            <div className="result-meta-divider"/>
            <div className="result-meta-item">
              <strong style={{ color: result.convertedSize < result.originalSize ? '#22c55e' : '#f59e0b' }}>
                {result.convertedSize < result.originalSize
                  ? `-${Math.round((1 - result.convertedSize / result.originalSize) * 100)}%`
                  : `+${Math.round((result.convertedSize / result.originalSize - 1) * 100)}%`}
              </strong>
              <small>Size diff</small>
            </div>
          </div>

          <div className="success-actions">
            <button className="btn-download" onClick={() => file && result && triggerDownload(result.blob, file.name.replace(/\.[^.]+$/, '') + '.' + result.ext)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              Download {FORMAT_LABELS[targetFormat]}
            </button>
            <button className="btn-another" onClick={reset}>Convert Another Image</button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ef4444"/><line x1="12" y1="8" x2="12" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="16" r="1.2" fill="#fff"/></svg>
          </div>
          <h3>Conversion Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-another" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
