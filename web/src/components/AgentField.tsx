import { AGENTS, type Agent } from '@handoff/shared';

interface AgentFieldProps {
  /** 選択中の agent。未割当は空文字。 */
  value: Agent | '';
  onChange: (value: Agent | '') => void;
}

/**
 * 担当 AI を選ぶフィールド（ADR-0004）。AI 系 owner のときだけ表示する前提で、
 * 表示可否は呼び出し側が制御する。`未割当`（null 相当）を先頭に持つ。
 */
export function AgentField({ value, onChange }: AgentFieldProps) {
  return (
    <label className="field">
      <span>AI（担当）</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Agent | '')}>
        <option value="">未割当</option>
        {AGENTS.map((a) => (
          <option key={a} value={a}>
            {a.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
