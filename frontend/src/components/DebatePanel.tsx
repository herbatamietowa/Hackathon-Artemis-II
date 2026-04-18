import type { AgentTurn } from '../types';

interface Props {
  debateHistory: AgentTurn[];
  status: string;
}

export function DebatePanel({ debateHistory, status }: Props) {
  // Color scheme based on outcome
  const statusColors = {
    CONSENSUS: { badge: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Agreed ✓' },
    CONTESTED: { badge: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: 'Debated' },
    USER_OVERRIDE: { badge: '#2563eb', bg: '#eff6ff', border: '#93c5fd', label: 'User Input' },
  };

  const colors = statusColors[status as keyof typeof statusColors] || statusColors.CONSENSUS;

  // Extract key bullet points from message
  const extractBullets = (message: string): string[] => {
    // Split by sentences and filter meaningful ones
    const sentences = message
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && s.length < 200);
    
    // Return first 2-3 key sentences
    return sentences.slice(0, 3);
  };

  // Get agent-specific colors and icons
  const getAgentStyle = (agentName: string) => {
    switch (agentName) {
      case 'User':
        return { icon: '👤', color: '#6366f1' };
      case 'Cost Specialist':
        return { icon: '💰', color: '#0891b2' };
      case 'Sustainability Director':
        return { icon: '🌱', color: '#059669' };
      default:
        return { icon: '🤖', color: '#6b7280' };
    }
  };

  if (!debateHistory || debateHistory.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        padding: '12px 16px',
      }}
    >
      {/* Status header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span
          style={{
            background: colors.badge,
            color: '#fff',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {colors.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Debate Summary</span>
      </div>

      {/* Debate turns */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {debateHistory.map((turn, idx) => {
          const style = getAgentStyle(turn.agent_name);
          const bullets = extractBullets(turn.message);

          return (
            <div
              key={idx}
              style={{
                borderLeft: `3px solid ${style.color}`,
                paddingLeft: 12,
                paddingTop: 4,
                paddingBottom: 4,
              }}
            >
              {/* Agent name + verdict */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{style.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: style.color }}>
                  {turn.agent_name}
                </span>
                {turn.verdict && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: turn.verdict === 'APPROVED' ? '#16a34a' : '#d97706',
                      marginLeft: 'auto',
                      background:
                        turn.verdict === 'APPROVED' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(217, 119, 6, 0.1)',
                      padding: '1px 6px',
                      borderRadius: 3,
                    }}
                  >
                    {turn.verdict}
                  </span>
                )}
              </div>

              {/* Bullet points */}
              {bullets.length > 0 ? (
                <ul
                  style={{
                    margin: '0 0 0 16px',
                    paddingLeft: 0,
                    fontSize: 13,
                    color: '#374151',
                    lineHeight: 1.5,
                  }}
                >
                  {bullets.map((bullet, bulletIdx) => (
                    <li key={bulletIdx} style={{ marginBottom: 4 }}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : (
                // Fallback: show full message if extraction didn't work
                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                  {turn.message.substring(0, 280)}
                  {turn.message.length > 280 ? '...' : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1px solid ${colors.border}`,
          fontSize: 12,
          color: '#6b7280',
          fontStyle: 'italic',
        }}
      >
        💡 Add a custom argument above to reopen the debate with new considerations.
      </div>
    </div>
  );
}
