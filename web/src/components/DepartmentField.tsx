import { DEPARTMENTS, type Department } from '@handoff/shared';

interface DepartmentFieldProps {
  /** 選択中の department。未選択は空文字。 */
  value: Department | '';
  onChange: (value: Department | '') => void;
}

/**
 * AI部署を選ぶフィールド（ADR-0006）。AI 系 owner のときだけ表示する前提で、
 * 表示可否は呼び出し側が制御する。`未割当`（null 相当）を先頭に持つ。
 */
export function DepartmentField({ value, onChange }: DepartmentFieldProps) {
  return (
    <label className="field">
      <span>AI部署</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Department | '')}>
        <option value="">未割当</option>
        {DEPARTMENTS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}
