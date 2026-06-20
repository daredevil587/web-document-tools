import { useState, useRef, useCallback } from 'react';
import { compressImage, FREE_FILE_LIMIT_MB } from '../../lib/compress-image';
import { formatBytes, triggerDownload } from '../../lib/utils';

type State = 'upload' | 'ready' | 'processing' | 'done' | 'error';
const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export default function CompressImageTool() {
  const [state, setState] = useState<State>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [quality, setQuality] = useState(0.8);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<{ blob: Blob; origSize: number; newSize: number } | null>(null);
  const [compressedPreview, setCompressedPreview] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) { setErrorMsg('Please select a JPG, PNG, or WebP image.'); setState('error'); return; }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) { setErrorMsg(`File exceeds ${FREE_FILE_LIMIT_MB} MB limit.`); setState('error'); return; }
    setFile(f);
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
      const res = await compressImage(file, quality, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setResult({ blob: res.blob, origSize: res.originalSize, newSize: res.compressedSize });
      const reader = new FileReader();
      reader.onload = e => setCompressedPreview(e.target!.result as string);
      reader.readAsDataURL(res.blob);
      setState('done');
      triggerDownload(res.blob, 'compressed-' + file.name);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not compress image.');
      setState('error');
    }
  };

  const reset = () => { setFile(null); setPreview(''); setCompressedPreview(''); setResult(null); setErrorMsg(''); setState('upload'); };
  const savings = result ? Math.round((1 - result.newSize / result.origSize) * 100) : 0;

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
                <img src={preview} alt="Preview" style={{ maxWidth:'160px', maxHeight:'160px', borderRadius:'8px', border:'1px solid var(--border)', objectFit:'contain' }} />
                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>Original · {formatBytes(file.size)}</p>
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
                <label style={{ fontSize:'0.88rem', fontWeight:'700', display:'block', marginBottom:'8px' }}>
                  Quality: <span style={{ color:'var(--primary)' }}>{Math.round(quality * 100)}%</span>
                </label>
                <input
                  type="range" min={20} max={100} value={Math.round(quality * 100)}
                  onChange={e => setQuality(Number(e.target.value) / 100)}
                  style={{ width:'100%', accentColor:'var(--primary)' }}
                />
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>
                  <span>Smaller file</span>
                  <span>Higher quality</span>
                </div>
              </div>

              <button className="btn-action" onClick={run}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Compress Image
              </button>
            </div>
          </div>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Compressing…</h3>
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
          <h3>Compression Complete!</h3>

          {compressedPreview && (
            <div style={{ display:'flex', gap:'20px', justifyContent:'center', margin:'12px 0 16px', flexWrap:'wrap' }}>
              <div style={{ textAlign:'center' }}>
                <img src={preview} alt="Original" style={{ width:'120px', height:'120px', objectFit:'contain', borderRadius:'8px', border:'1px solid var(--border)' }} />
                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>Original</p>
              </div>
              <div style={{ textAlign:'center' }}>
                <img src={compressedPreview} alt="Compressed" style={{ width:'120px', height:'120px', objectFit:'contain', borderRadius:'8px', border:'1px solid var(--border)' }} />
                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px' }}>Compressed</p>
              </div>
            </div>
          )}

          <div className="result-meta">
            <div className="result-meta-item"><strong>{formatBytes(result.origSize)}</strong><small>Original</small></div>
            <div className="result-meta-divider"/>
            <div className="result-meta-item"><strong>{formatBytes(result.newSize)}</strong><small>Compressed</small></div>
            <div className="result-meta-divider"/>
            <div className="result-meta-item">
              <strong style={{ color: savings > 0 ? '#22c55e' : '#f59e0b' }}>{savings > 0 ? `-${savings}%` : '~0%'}</strong>
              <small>Saved</small>
            </div>
          </div>

          <div className="success-actions">
            <button className="btn-download" onClick={() => file && result && triggerDownload(result.blob, 'compressed-' + file.name)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              Download Compressed Image
            </button>
            <button className="btn-another" onClick={reset}>Compress Another Image</button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ef4444"/><line x1="12" y1="8" x2="12" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="16" r="1.2" fill="#fff"/></svg>
          </div>
          <h3>Compression Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-another" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
