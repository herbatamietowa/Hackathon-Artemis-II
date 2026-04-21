import { useRef, useState } from 'react';
import { api } from '../api/client';
import type { UploadDataResponse } from '../types';

export function DataUploadPanel({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      setError('Only .xlsx files are supported.');
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.uploadData(file);
      setResult(res);
      onUploadSuccess?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDownloadSample = async () => {
    const res = await api.downloadSampleFactory();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mock_factory_NW16.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
        borderRadius: 12, padding: '20px 24px', color: '#fff',
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>Import Data</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Upload an Excel file (.xlsx) to add new rows to the dataset — new factories, materials, capacity data, etc.
          Sheets are matched by prefix and new rows are appended to the existing data.
        </p>
      </div>

      {/* Sample download */}
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#14532d', marginBottom: 3 }}>🧪 Try with mock data</div>
          <div style={{ fontSize: 13, color: '#166534' }}>
            Download a sample file that adds <strong>NW16 (Nordic Hub)</strong> — a new factory with 3 work centers,
            5 materials, and capacity data for 2026.
          </div>
        </div>
        <button
          onClick={handleDownloadSample}
          style={{
            padding: '9px 18px', borderRadius: 7, border: 'none',
            background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          ⬇ Download sample (NW16)
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#4338ca' : '#c7d2fe'}`,
          borderRadius: 12, padding: '40px 24px', textAlign: 'center',
          background: dragOver ? '#eef2ff' : '#f5f3ff',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        {uploading ? (
          <div style={{ fontSize: 15, color: '#4338ca', fontWeight: 600 }}>⏳ Uploading and merging data…</div>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#3730a3', marginBottom: 4 }}>
              Drop your .xlsx here or click to browse
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              Sheets are merged by name prefix — only rows are added, existing data is preserved
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#14532d', marginBottom: 10 }}>
            ✓ Upload successful — dataset updated &amp; cache refreshed
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.sheets_merged.map(sheet => (
              <div key={sheet} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#dcfce7', borderRadius: 6, padding: '7px 12px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>{sheet}</span>
                <span style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>
                  +{result.rows_added[sheet].toLocaleString()} rows
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
            Switch tabs to see updated factories, materials, and capacity data.
          </div>
        </div>
      )}

      {/* Format reference */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}>📋 Supported sheets</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {[
            { id: '2_1', name: 'Work Center Capacity Weekly', tip: 'P01_{PLANT}_{WC} rows, week columns' },
            { id: '2_5', name: 'WC Schedule limits', tip: 'Plant, WC-Description, OEE (in %)' },
            { id: '2_6', name: 'Tool material master', tip: 'Sap code, Plant, Material Status' },
            { id: '2_3', name: 'SAP MasterData', tip: 'Sap code, Description, Standard Cost in EUR' },
            { id: '1_1', name: 'Export Plates', tip: 'Plate Factory, Connector, monthly demand' },
            { id: '1_2', name: 'Gaskets', tip: 'Gasket Factory, Connector, monthly demand' },
          ].map(s => (
            <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 2 }}>{s.id}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{s.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{s.tip}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
