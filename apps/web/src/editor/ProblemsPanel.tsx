import type { ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { IconButton, cx } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import type { Problem, ProblemSeverity } from './problems.ts';

const ICONS: Record<ProblemSeverity, ReactNode> = {
  error: <CircleAlert size={14} className="text-danger" />,
  warning: <TriangleAlert size={14} className="text-warning-fg" />,
  info: <Info size={14} className="text-info" />,
};

export function ProblemsPanel({
  problems,
  onClose,
  onSelectScreen,
}: {
  problems: Problem[];
  onClose: () => void;
  onSelectScreen: (screenId: string) => void;
}) {
  const i18n = useT();
  const errors = problems.filter((problem) => problem.severity === 'error').length;
  const warnings = problems.filter((problem) => problem.severity === 'warning').length;

  const describe = (problem: Problem): string => {
    if (problem.text.type === 'message') return i18n.t(problem.text.key, problem.text.params);
    const { message, action } = i18n.error(problem.text.code, problem.text.params);
    return `${message} ${action}`;
  };

  return (
    <section
      aria-label={i18n.t('editor.problems.title')}
      className="flex h-[200px] shrink-0 flex-col border-t border-line-subtle bg-panel"
    >
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-line-subtle pr-1 pl-3">
        <h2 className="text-xs font-semibold">{i18n.t('editor.problems.title')}</h2>
        <span className="tabular text-2xs text-fg-muted">
          {i18n.t('editor.problems.summary', { errors, warnings })}
        </span>
        <div className="flex-1" />
        <IconButton label={i18n.t('common.close')} icon={<X size={14} />} onClick={onClose} />
      </header>
      {problems.length === 0 ? (
        <p className="px-3 py-3 text-xs text-fg-muted">{i18n.t('editor.problems.none')}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto py-1">
          {problems.map((problem) => {
            const content = (
              <>
                <span aria-hidden className="mt-0.5 shrink-0">
                  {ICONS[problem.severity]}
                </span>
                <span className="min-w-0 flex-1">{describe(problem)}</span>
                {problem.text.type === 'error' && (
                  <span className="shrink-0 font-mono text-2xs text-fg-subtle">
                    {problem.text.code}
                  </span>
                )}
              </>
            );
            const className = 'flex w-full items-start gap-2 px-3 py-1 text-left text-xs';
            const { screenId } = problem;
            return (
              <li key={problem.id}>
                {screenId ? (
                  <button
                    type="button"
                    onClick={() => onSelectScreen(screenId)}
                    className={cx(className, 'hover:bg-hover')}
                  >
                    {content}
                  </button>
                ) : (
                  <div className={className}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
