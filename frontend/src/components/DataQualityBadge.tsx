interface Props {
  excludedRows: number;
  flagCount: number;
  reconstructedRows: number;
}

export function DataQualityBadge({ excludedRows, flagCount, reconstructedRows }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge label="Reconstructed" value={reconstructedRows} color="#3b82f6" />
      <Badge label="Flagged" value={flagCount} color="#f59e0b" />
      <Badge label="Excluded" value={excludedRows} color="#6b7280" />
    </div>
  );
}

function Badge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: 20,
      padding: '2px 10px',
      fontSize: 12,
      color: '#374151',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}: <strong>{value}</strong>
    </span>
  );
}
