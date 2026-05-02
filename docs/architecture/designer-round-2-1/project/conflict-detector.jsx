/* global React */
const { useState: useStateCD, useEffect: useEffectCD, useRef: useRefCD } = React;

/* ——————————————————————————————————————
   LIVE CONFLICT DETECTOR
   Sample IP: Saebyeok (synthetic demo data)
   8 chars, 22 rules, 30 day timeline
———————————————————————————————————————— */

const SAEBYEOK_CANON = {
  characters: [
    { id: 'han_iseul', name: 'Han Iseul', role: 'protagonist', traits: { eye_color: 'brown', club: 'astronomy', grade: 11 } },
    { id: 'jeong_serin', name: 'Jeong Serin', role: 'co-lead', traits: { eye_color: 'hazel', club: 'astronomy', grade: 11 } },
    { id: 'yun_hana', name: 'Yun Hana', role: 'supporting', traits: { eye_color: 'brown', club: 'photo', grade: 12 } },
    { id: 'park_jio', name: 'Park Jio', role: 'supporting', traits: { eye_color: 'brown', club: 'meteorology', grade: 11 } },
    { id: 'choe_doyun', name: 'Choe Doyun', role: 'antagonist', traits: { eye_color: 'gray', club: 'none', grade: 12 } },
    { id: 'kim_minchae', name: 'Kim Minchae', role: 'supporting', traits: { eye_color: 'brown', club: 'astronomy', grade: 10 } },
  ],
  rules: [
    { id: 'r01', text: 'Astronomy club meets only on Tuesdays and Thursdays.' },
    { id: 'r02', text: 'The eclipse occurs on day 23 of the 30-day timeline.' },
    { id: 'r03', text: 'No character has access to the rooftop before day 14.' },
    { id: 'r04', text: 'Han Iseul cannot be in two locations on the same day.' },
  ],
};

/* Suggestion examples — what the user can click to try */
const PROMPTS = [
  {
    label: 'Han Iseul transfers to Class 2 on day 9.',
    text: 'Han Iseul transfers to Class 2 on day 9.',
    verdict: 'conflict',
    rule: 'character.han_iseul.class = 1',
    explain: 'Canon registers Han Iseul in Class 1 from day 1 (chapter 1, scene 3). A transfer event on day 9 needs a new rule or this fact reverts.',
  },
  {
    label: 'Han Iseul has gray eyes.',
    text: 'Han Iseul has gray eyes.',
    verdict: 'conflict',
    rule: 'character.han_iseul.eye_color = brown',
    explain: 'Canon establishes Han Iseul with brown eyes (chapter 2, scene 1). Proposed fact contradicts.',
  },
  {
    label: 'Yun Hana is in the astronomy club.',
    text: 'Yun Hana is in the astronomy club.',
    verdict: 'conflict',
    rule: 'character.yun_hana.club = photo',
    explain: 'Yun Hana belongs to the photo club. Add as a transfer event or fix the fact.',
  },
  {
    label: 'The eclipse happens on day 23.',
    text: 'The eclipse happens on day 23.',
    verdict: 'canon',
    rule: 'rule.r02',
    explain: 'Matches established rule r02. No further review needed.',
  },
  {
    label: 'Park Jio enters the rooftop on day 9.',
    text: 'Park Jio enters the rooftop on day 9.',
    verdict: 'conflict',
    rule: 'rule.r03',
    explain: 'Rooftop access is locked until day 14 by rule r03.',
  },
  {
    label: 'Jeong Serin and Han Iseul argue at the observatory.',
    text: 'Jeong Serin and Han Iseul argue at the observatory.',
    verdict: 'pending',
    rule: 'scene.new',
    explain: 'New scene fact. No conflicts detected. Author review queued.',
  },
];

function pickVerdict(text) {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  // Try matching known prompts (substring)
  for (const p of PROMPTS) {
    if (t === p.text.toLowerCase().trim()) return p;
    if (p.text.toLowerCase().includes(t.slice(0, 18)) && t.length > 12) return p;
  }
  // Heuristic — eye color words trigger eye_color check
  if (/(gray|grey|blue|green) eye/.test(t) && /han iseul|yun hana|park jio|kim minchae/.test(t)) {
    return {
      verdict: 'conflict',
      rule: 'character.eye_color',
      explain: 'Conflict with established eye color. Open canon ledger to override.',
    };
  }
  if (/rooftop/.test(t) && /day [1-9]\b|day 1[0-3]\b/.test(t)) {
    return {
      verdict: 'conflict',
      rule: 'rule.r03',
      explain: 'Rooftop is locked until day 14 by rule r03.',
    };
  }
  if (/eclipse/.test(t) && /day 23/.test(t)) {
    return {
      verdict: 'canon',
      rule: 'rule.r02',
      explain: 'Matches rule r02.',
    };
  }
  return {
    verdict: 'pending',
    rule: 'scene.new',
    explain: 'New fact. No direct conflicts found. Queued for author review.',
  };
}

function VerdictPill({ verdict }) {
  if (verdict === 'canon') {
    return (
      <span className="badge badge-canon">
        <span className="badge-dot" /> canon · validated
      </span>
    );
  }
  if (verdict === 'conflict') {
    return (
      <span className="badge badge-conflict">
        <span className="badge-dot" /> conflict
      </span>
    );
  }
  if (verdict === 'pending') {
    return (
      <span className="badge badge-pending">
        <span className="badge-dot" /> pending review
      </span>
    );
  }
  return null;
}

function ConflictDetector({ compact = false }) {
  const [text, setText] = useStateCD('Han Iseul transfers to Class 2 on day 9.');
  const [result, setResult] = useStateCD(PROMPTS[0]);
  const [thinking, setThinking] = useStateCD(false);
  const [history, setHistory] = useStateCD([
    { text: 'The eclipse happens on day 23.', ...PROMPTS[3] },
  ]);
  const debounceRef = useRefCD(null);

  useEffectCD(() => {
    if (!text.trim()) {
      setResult(null);
      setThinking(false);
      return;
    }
    setThinking(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const r = pickVerdict(text);
      setResult(r);
      setThinking(false);
    }, 520);
    return () => clearTimeout(debounceRef.current);
  }, [text]);

  function commit() {
    if (!result || !text.trim()) return;
    setHistory((h) => [{ text, ...result }, ...h].slice(0, 4));
    setText('');
    setResult(null);
  }

  function tryPrompt(p) {
    setText(p.text);
  }

  return (
    <div style={{
      background: 'var(--ink-0)',
      border: '1px solid var(--ink-100)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden',
      width: '100%',
      maxWidth: 560,
    }}>
      {/* Header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--ink-100)',
        background: 'var(--ink-50)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex', width: 8, height: 8, borderRadius: 999,
            background: 'var(--signal-canon)',
            boxShadow: '0 0 0 4px oklch(0.62 0.16 148 / 0.16)',
          }} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-700)' }}>
            canon ledger · saebyeok.demo
          </span>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: 10 }}>
          read-only · synthetic demo data
        </span>
      </div>

      {/* Input */}
      <div style={{ padding: '20px 20px 14px' }}>
        <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>
          propose a fact
        </label>
        <div style={{ position: 'relative' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(); }}
            placeholder="e.g. Han Iseul has gray eyes."
            rows={compact ? 2 : 3}
            style={{
              width: '100%',
              padding: '12px 14px',
              border: '1px solid var(--ink-200)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--ink-0)',
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              lineHeight: 1.5,
              color: 'var(--ink-900)',
              resize: 'none',
              outline: 'none',
              transition: 'border-color 160ms ease, box-shadow 160ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--ink-700)';
              e.currentTarget.style.boxShadow = '0 0 0 3px oklch(0.14 0.012 250 / 0.06)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--ink-200)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Try-this chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          <span className="eyebrow" style={{ alignSelf: 'center', marginRight: 4 }}>try</span>
          {PROMPTS.slice(0, compact ? 3 : 4).map((p) => (
            <button
              key={p.label}
              onClick={() => tryPrompt(p)}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-600)',
                background: 'var(--ink-50)',
                border: '1px solid var(--ink-200)',
                borderRadius: 999,
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--ink-100)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'var(--ink-50)'; }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Verdict */}
      <div style={{
        margin: '0 20px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--ink-100)',
        background: result?.verdict === 'conflict' ? 'var(--signal-conflict-soft)'
                  : result?.verdict === 'canon' ? 'var(--signal-canon-soft)'
                  : result?.verdict === 'pending' ? 'var(--signal-pending-soft)'
                  : 'var(--ink-50)',
        minHeight: 80,
        transition: 'background 240ms ease, border-color 240ms ease',
        borderColor: result?.verdict === 'conflict' ? 'oklch(0.85 0.10 27)'
                   : result?.verdict === 'canon' ? 'oklch(0.85 0.10 148)'
                   : result?.verdict === 'pending' ? 'oklch(0.88 0.10 85)'
                   : 'var(--ink-100)',
      }}>
        {!text.trim() && (
          <div style={{ color: 'var(--ink-500)', fontSize: 14, lineHeight: 1.5 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4 }}>
              awaiting input
            </div>
            Reconciles every fact against 8 characters, 22 rules, 30 day timeline.
          </div>
        )}
        {text.trim() && thinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-600)' }}>
            <SpinnerDot />
            <span className="mono" style={{ fontSize: 12 }}>
              reconciling · {Math.min(text.length, 22)} candidates checked
            </span>
          </div>
        )}
        {text.trim() && !thinking && result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <VerdictPill verdict={result.verdict} />
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-500)' }}>
                {result.rule}
              </span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-800)', lineHeight: 1.5 }}>
              {result.explain}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={commit}
                className="btn btn-primary-dark"
                style={{ padding: '8px 14px', fontSize: 13 }}
              >
                {result.verdict === 'conflict' ? 'open ledger' : result.verdict === 'canon' ? 'accept' : 'queue review'}
              </button>
              <button
                onClick={() => setText('')}
                className="btn btn-ghost-dark"
                style={{ padding: '8px 14px', fontSize: 13 }}
              >
                discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div style={{ padding: '14px 20px 18px' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>recent · {history.length}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.map((h, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px',
              background: 'var(--ink-50)',
              border: '1px solid var(--ink-100)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
            }}>
              <VerdictDotSmall verdict={h.verdict} />
              <span style={{ flex: 1, color: 'var(--ink-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.text}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-500)' }}>{h.rule}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpinnerDot() {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12,
      border: '2px solid var(--ink-200)',
      borderTopColor: 'var(--ink-700)',
      borderRadius: 999,
      animation: 'cd-spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes cd-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

function VerdictDotSmall({ verdict }) {
  const c = verdict === 'canon' ? 'var(--signal-canon)'
          : verdict === 'conflict' ? 'var(--signal-conflict)'
          : 'var(--signal-pending)';
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: c, flexShrink: 0 }} />;
}

window.ConflictDetector = ConflictDetector;
