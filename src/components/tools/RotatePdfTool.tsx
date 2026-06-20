import { useState, useRef, useCallback } from 'react';
import { renderRotatePageThumbs, rotatePdfPages, FREE_FILE_LIMIT_MB, type RotatePage } from '../../lib/rotate-pdf';
import { triggerDownload } from '../../lib/utils';

type State = 'upload' | 'loading' | 'select' | 'processing' | 'done' | 'error';

export default function RotatePdfTool() {
  const [state, setState] = useState<State>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<RotatePage[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (f.type !== 'application/pdf') { setErrorMsg('Please select a PDF file.'); setState('error'); return; }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) { setErrorMsg(`File exceeds ${FREE_FILE_LIMIT_MB} MB.`); setState('error'); return; }
    setFile(f);
    setState('loading');
    try {
      const thumbs = await renderRotatePageThumbs(f, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setPages(thumbs);
      setState('select');
    } catch (e: any) { setErrorMsg(e?.message ?? 'Could not load PDF.'); setState('error'); }
  }, []);

  const rotate = (idx: number, deg: 90 | 180 | 270) => {
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, rotation: (p.rotation + deg) % 360 } : p));
  };
  const rotateAll = (deg: 90 | 270) => {
    setPages(prev => prev.map(p => ({ ...p, rotation: (p.rotation + deg) % 360 })));
  };

  const changed = pages.filter(p => p.rotation !== 0).length;

  const run = async () => {
    if (!file) return;
    setState('processing');
    const rotMap: Record<number, number> = {};
    pages.forEach(p => { if (p.rotation !== 0) rotMap[p.pageNum] = p.rotation; });
    try {
      const blob = await rotatePdfPages(file, rotMap, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setResultBlob(blob);
      setState('done');
      triggerDownload(blob, file.name.replace(/\.pdf$/i, '') + '-rotated.pdf');
    } catch (e: any) { setErrorMsg(e?.message ?? 'Could not rotate PDF.'); setState('error'); }
  };

  const reset = () => { setFile(null); setPages([]); setResultBlob(null); setErrorMsg(''); setState('upload'); };

  const ROT_LABEL: Record<number, string> = { 0: '0°', 90: '90°', 180: '180°', 270: '270°' };

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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round"/>
              <polyline points="14 2 14 8 20 8" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M4.5 9a7.5 7.5 0 0 1 7.5-7.5" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
              <polyline points="2 9 4.5 9 4.5 6.5" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>Drag &amp; Drop your PDF here</h3>
          <p className="upload-sub">or click to browse</p>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button className="btn-upload" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>Choose PDF File</button>
          <p className="file-limit">Supports: PDF · Max size: {FREE_FILE_LIMIT_MB} MB</p>
        </div>
      )}

      {(state === 'loading' || state === 'processing') && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>{state === 'loading' ? 'Loading pages…' : 'Applying rotations…'}</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${progress}%` }}/></div>
          <div className="progress-footer"><span>Please wait</span><span className="progress-pct">{progress}%</span></div>
        </div>
      )}

      {state === 'select' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'14px' }}>
            <strong style={{ fontSize:'0.95rem', flex:1, minWidth:'120px' }}>{pages.length} pages</strong>
            <button className="toolbar-btn" onClick={() => rotateAll(90)} title="Rotate all 90° clockwise">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 2v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              All 90° CW
            </button>
            <button className="toolbar-btn" onClick={() => rotateAll(270)} title="Rotate all 90° counter-clockwise">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{transform:'scaleX(-1)'}}><path d="M21 2v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              All 90° CCW
            </button>
            <button
              className="btn-action"
              style={{ padding:'9px 22px', fontSize:'0.88rem' }}
              onClick={run}
              disabled={changed === 0}
            >
              Save PDF ({changed > 0 ? `${changed} rotated` : 'no changes'})
            </button>
          </div>
          <div className="split-page-grid">
            {pages.map((p, i) => (
              <div key={i} className="rotate-page-card">
                <div className="rotate-page-img-wrap">
                  <img
                    src={p.thumbDataUrl}
                    alt={`Page ${p.pageNum}`}
                    draggable={false}
                    style={{ transform: `rotate(${p.rotation}deg)`, transition: 'transform 0.3s' }}
                  />
                </div>
                <div className="rotate-page-footer">
                  <span className="rotate-page-num">P{p.pageNum}</span>
                  {p.rotation !== 0 && <span className="rotate-badge">{ROT_LABEL[p.rotation]}</span>}
                  <div className="rotate-btns">
                    <button className="rotate-btn" title="Rotate 90° counter-clockwise" onClick={() => rotate(i, 270)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{transform:'scaleX(-1)'}}><path d="M21 2v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <button className="rotate-btn" title="Rotate 90° clockwise" onClick={() => rotate(i, 90)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 2v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn-action"
            style={{ marginTop:'8px', width:'100%' }}
            onClick={run}
            disabled={changed === 0}
          >
            Save Rotated PDF
          </button>
          {changed === 0 && <p style={{ textAlign:'center', fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'8px' }}>Click the rotate buttons on each page to rotate it</p>}
          <button className="btn-another" style={{ marginTop:'10px', width:'100%' }} onClick={reset}>Choose Different PDF</button>
        </div>
      )}

      {state === 'done' && resultBlob && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e"/><polyline points="7.5 12 10.5 15 16.5 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3>PDF Rotated!</h3>
          <p>Rotated {changed} page{changed !== 1 ? 's' : ''} and saved.</p>
          <div className="success-actions">
            <button className="btn-download" onClick={() => file && triggerDownload(resultBlob, file.name.replace(/\.pdf$/i,'') + '-rotated.pdf')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              Download PDF
            </button>
            <button className="btn-another" onClick={reset}>Rotate Another PDF</button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ef4444"/><line x1="12" y1="8" x2="12" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="16" r="1.2" fill="#fff"/></svg>
          </div>
          <h3>Error</h3>
          <p>{errorMsg}</p>
          <button className="btn-another" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
