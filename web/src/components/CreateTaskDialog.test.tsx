import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { CreateTaskDialog } from './CreateTaskDialog';
import { LabelOptionsProvider } from '../lib/label-options';

const sampleTask = (over: Partial<Task> = {}): Task => ({
  id: 'new-1',
  title: '記事を書く',
  status: 'needs-ai',
  owner: 'cowork',
  priority: 'P2',
  action_type: 'other',
  handoff_note: 'お願い',
  blocked_reason: null,
  department: null,
  role: null,
  project: null,
  milestone: null,
  tags: [],
  created_by: 'creator@example.com',
  created_by_type: 'human',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('CreateTaskDialog', () => {
  it('必須未入力で送信するとバリデーションエラーを表示し、作成は呼ばれない', async () => {
    const createTask = vi.fn();
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
  });

  it('有効入力で createTask を呼び、成功時に onCreated に作成タスクを渡す', async () => {
    const created = sampleTask({ id: 'created-99' });
    const createTask = vi.fn().mockResolvedValue(created);
    const onCreated = vi.fn();
    render(<CreateTaskDialog onClose={() => {}} onCreated={onCreated} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事を書く' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it('優先度を選択でき、選んだ値を作成入力に含めて送る', async () => {
    const createTask = vi.fn().mockResolvedValue(sampleTask());
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.change(screen.getByLabelText('優先度'), { target: { value: 'P0' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ priority: 'P0' })),
    );
  });

  it('プロジェクトを入力でき、作成入力に含めて送る（ADR-0004）', async () => {
    const createTask = vi.fn().mockResolvedValue(sampleTask());
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.change(screen.getByLabelText('プロジェクト'), { target: { value: 'ニュースレター' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ project: 'ニュースレター' }),
      ),
    );
  });

  it('マイルストーンを入力でき、作成入力に含めて送る（ADR-0004）', async () => {
    const createTask = vi.fn().mockResolvedValue(sampleTask());
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.change(screen.getByLabelText('マイルストーン'), { target: { value: '6月号' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ milestone: '6月号' })),
    );
  });

  it('AI 系 owner では AI部署を選べ、作成入力に含めて送る（ADR-0006）', async () => {
    const createTask = vi.fn().mockResolvedValue(sampleTask());
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.change(screen.getByLabelText('AI部署'), { target: { value: 'engineering' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ department: 'engineering' })),
    );
  });

  it('owner=human を選ぶと AI部署欄は表示されない（不変条件のUI反映）', () => {
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('担当'), { target: { value: 'human' } });
    expect(screen.queryByLabelText('AI部署')).not.toBeInTheDocument();
  });

  it('部署を選ぶとロール欄が出て、その部署のロールだけを候補にする（ADR-0006）', () => {
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={vi.fn()} />);
    expect(screen.queryByLabelText('ロール')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('AI部署'), { target: { value: 'engineering' } });
    const roleSelect = screen.getByLabelText('ロール');
    expect(roleSelect.querySelector('option[value="code-review"]')).toBeInTheDocument();
    expect(roleSelect.querySelector('option[value="brand-voice"]')).not.toBeInTheDocument();
  });

  it('AI部署とロールを選んで作成入力に含めて送る', async () => {
    const createTask = vi.fn().mockResolvedValue(sampleTask());
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.change(screen.getByLabelText('AI部署'), { target: { value: 'engineering' } });
    fireEvent.change(screen.getByLabelText('ロール'), { target: { value: 'code-review' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ department: 'engineering', role: 'code-review' }),
      ),
    );
  });

  it('部署を変更すると選択済みロールはリセットされる（カスケード）', async () => {
    const createTask = vi.fn().mockResolvedValue(sampleTask());
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.change(screen.getByLabelText('AI部署'), { target: { value: 'engineering' } });
    fireEvent.change(screen.getByLabelText('ロール'), { target: { value: 'code-review' } });
    fireEvent.change(screen.getByLabelText('AI部署'), { target: { value: 'business' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ department: 'business', role: null }),
      ),
    );
  });

  it('既存の project/milestone を datalist 候補としてサジェストする', () => {
    render(
      <LabelOptionsProvider value={{ projects: ['ニュースレター', 'API刷新'], milestones: ['6月号'] }}>
        <CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={vi.fn()} />
      </LabelOptionsProvider>,
    );

    const projectInput = screen.getByLabelText('プロジェクト');
    const projectList = document.getElementById(projectInput.getAttribute('list') ?? '');
    expect(projectList?.querySelector('option[value="ニュースレター"]')).toBeInTheDocument();
    expect(projectList?.querySelector('option[value="API刷新"]')).toBeInTheDocument();

    const milestoneInput = screen.getByLabelText('マイルストーン');
    const milestoneList = document.getElementById(milestoneInput.getAttribute('list') ?? '');
    expect(milestoneList?.querySelector('option[value="6月号"]')).toBeInTheDocument();
  });

  it('Provider 無し（候補なし）でも project は自由入力できる', async () => {
    const createTask = vi.fn().mockResolvedValue(sampleTask());
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.change(screen.getByLabelText('プロジェクト'), { target: { value: '新規PJ' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ project: '新規PJ' })),
    );
  });

  it('サーバーエラー（例外）時はエラーを表示し onCreated を呼ばない', async () => {
    const createTask = vi.fn().mockRejectedValue(new Error('作成に失敗しました (422)'));
    const onCreated = vi.fn();
    render(<CreateTaskDialog onClose={() => {}} onCreated={onCreated} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('作成に失敗しました');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
