import { createContext, useContext, type ReactNode } from 'react';

/** ダイアログの datalist 候補（project/milestone の既存値）。空配列が既定。 */
export interface LabelOptions {
  projects: string[];
  milestones: string[];
}

// 既定値を持たせ、Provider 無しでも throw しない（単体ダイアログテストは候補[]で動く）。
const LabelOptionsContext = createContext<LabelOptions>({ projects: [], milestones: [] });

export function LabelOptionsProvider({
  value,
  children,
}: {
  value: LabelOptions;
  children: ReactNode;
}) {
  return <LabelOptionsContext.Provider value={value}>{children}</LabelOptionsContext.Provider>;
}

/** ダイアログから既存の project/milestone 候補を取得する。 */
export function useLabelOptions(): LabelOptions {
  return useContext(LabelOptionsContext);
}
