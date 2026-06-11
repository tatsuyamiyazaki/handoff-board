import { rolesForDepartment, type Department, type Role } from '@handoff/shared';

interface RoleFieldProps {
  /** 選択中の部署。候補の絞り込みに使う。 */
  department: Department;
  /** 選択中の role。未選択は空文字。 */
  value: Role | '';
  onChange: (value: Role | '') => void;
}

/**
 * ロールを選ぶフィールド（ADR-0006）。選択中の department に属するロールだけを候補に出す。
 * 表示可否（AI owner かつ department 選択済み）は呼び出し側が制御する。
 */
export function RoleField({ department, value, onChange }: RoleFieldProps) {
  return (
    <label className="field">
      <span>ロール</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Role | '')}>
        <option value="">未割当</option>
        {rolesForDepartment(department).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </label>
  );
}
