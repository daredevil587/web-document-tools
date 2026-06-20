import { useState, useRef, useCallback } from 'react';
import { renderPageThumbs, extractPages, FREE_FILE_LIMIT_MB, type PageInfo } from '../../lib/split-pdf';
import { triggerDownload } from '../../lib/utils';

type State = 'upload' | 'loading' | 'select' | 'processing' | 'done' | 'error';

export default function SplitPdfTool() {
  const [state, setState] = useState<State>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
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
    setProgress(0);
    try {
      const thumbs = await renderPageThumbs(f, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setPages(thumbs);
      setState('select');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not load PDF.');
      setState('error');
    }
  }, []);

  const togglePage = (idx: number) => {
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p));
  };
  const selectAll = () => setPages(prev => prev.map(p => ({ ...p, selected: true })));
  const selectNone = () => setPages(prev => prev.map(p => ({ ...p, selected: false })));

  const selectedCount = pages.filter(p => p.selected).length;

  const run = async () => {
    if (!file || selectedCount === 0) return;
    setState('processing');
    setProgress(0);
    try {
      const selected = pages.filter(p => p.selected).map(p => p.pageNum);
      const blob = await extractPages(file, selected, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setResultBlob(blob);
      setState('done');
      const name = file.name.replace(/\.pdf$/i, '');
      triggerDownload(blob, `${name}-extracted.pdf`);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not extract pages.');
      setState('error');
    }
  };

  const reset = () => { setFile(null); setPages([]); setResultBlob(null); setErrorMsg(''); setState('upload'); };

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
              <line x1="9" y1="13" x2="15" y2="13" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
              <line x1="9" y1="17" x2="12" y2="17" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
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
          <h3>{state === 'loading' ? 'Loading pages…' : 'Extracting pages…'}</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${progress}%` }}/></div>
          <div className="progress-footer"><span>Please wait</span><span className="progress-pct">{progress}%</span></div>
        </div>
      )}

      {state === 'select' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', marginBottom:'14px' }}>
            <div style={{ flex:1, minWidth:'180px' }}>
              <strong style={{ fontSize:'0.95rem' }}>{pages.length} pages</strong>
              <span style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginLeft:'8px' }}>Click pages to select/deselect</span>
            </div>
            <button className="toolbar-btn" onClick={selectAll}>Select All</button>
            <button className="toolbar-btn" onClick={selectNone}>Clear</button>
            <button
              className="btn-action"
              style={{ padding:'9px 22px', fontSize:'0.88rem', marginLeft:'auto' }}
              onClick={run}
              disabled={selectedCount === 0}
            >
              Extract {selectedCount} Page{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
          <div className="split-page-grid">
            {pages.map((p, i) => (
              <button
                key={i}
                className={`split-page-thumb${p.selected ? ' selected' : ''}`}
                onClick={() => togglePage(i)}
                title={`Page ${p.pageNum} — click to ${p.selected ? 'deselect' : 'select'}`}
              >
                <img src={p.thumbDataUrl} alt={`Page ${p.pageNum}`} draggable={false} />
                <span className="split-page-num">{p.pageNum}</span>
                {p.selected && (
                  <span className="split-page-check">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="#6366f1"/>
                      <polyline points="7.5 12 10.5 15 16.5 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            className="btn-action"
            style={{ marginTop:'4px', width:'100%' }}
            onClick={run}
            disabled={selectedCount === 0}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#fff" strokeWidth="2"/><polyline points="14 2 14 8 20 8" stroke="#fff" strokeWidth="2"/></svg>
            Extract {selectedCount} Page{selectedCount !== 1 ? 's' : ''} to PDF
          </button>
          {selectedCount === 0 && <p style={{ textAlign:'center', fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'8px' }}>Click at least one page thumbnail to extract it</p>}
          <button className="btn-another" style={{ marginTop:'10px', width:'100%' }} onClick={reset}>Choose Different PDF</button>
        </div>
      )}

      {state === 'done' && resultBlob && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e"/><polyline points="7.5 12 10.5 15 16.5 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3>Pages Extracted!</h3>
          <p>{selectedCount} page{selectedCount !== 1 ? 's' : ''} saved to a new PDF.</p>
          <div className="success-actions">
            <button className="btn-download" onClick={() => file && triggerDownload(resultBlob, file.name.replace(/\.pdf$/i,'') + '-extracted.pdf')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              Download PDF
            </button>
            <button className="btn-another" onClick={reset}>Split Another PDF</button>
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
