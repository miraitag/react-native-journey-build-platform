import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@rnjb/ui';
import { useDialogs } from '../app/dialogs-store.ts';
import { useT } from '../app/preferences.ts';
import { readTeamConfig } from '../app/TeamImportDialog.tsx';
import { useService } from '../services/service-store.ts';

const HIDDEN_KEY = 'rnjb.firstSteps.hidden';

const readHidden = (): boolean => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * First use (§10.6): the setup steps in order, each with its state and the action that does it.
 * Hidden once the required steps are done, or when the user hides it.
 */
export function FirstSteps() {
  const i18n = useT();
  const show = useDialogs((state) => state.show);
  const open = useDialogs((state) => state.open);
  const status = useService((state) => state.status);
  const settings = useService((state) => state.settings);
  const entries = useService((state) => state.index?.entries.length ?? 0);
  const [teamLibraries, setTeamLibraries] = useState<number | undefined>();
  const [hidden, setHidden] = useState(readHidden);
  const workspace = Boolean(settings?.workspacePath);

  // Re-read when a dialog closes: the team import may have just written the file.
  useEffect(() => {
    if (!workspace || open !== undefined) return;
    let cancelled = false;
    void readTeamConfig().then(
      (team) => !cancelled && setTeamLibraries(team.libraries.length),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [workspace, open]);

  if (status !== 'online' || !settings || hidden) return null;
  const steps: {
    key: 'workspace' | 'team' | 'libraries' | 'remotes' | 'journey';
    done: boolean;
    optional?: boolean;
    action: () => void;
  }[] = [
    { key: 'workspace', done: workspace, action: () => show('settings') },
    { key: 'team', done: (teamLibraries ?? 0) > 0, action: () => show('team') },
    {
      key: 'libraries',
      done: Object.keys(settings.librarySources).length > 0,
      action: () => show('settings'),
    },
    {
      key: 'remotes',
      done: settings.remoteSources.length > 0,
      optional: true,
      action: () => show('settings'),
    },
    { key: 'journey', done: entries > 0, action: () => show('create') },
  ];
  if (steps.every((step) => step.done || step.optional)) return null;
  const next = steps.find((step) => !step.done);

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_KEY, 'true');
    } catch {
      // Without storage it simply shows again next time.
    }
  };

  return (
    <section
      aria-labelledby="first-steps-title"
      className="flex flex-col gap-3 rounded-lg bg-panel px-5 py-4 shadow-[0_0_0_1px_var(--line-subtle)]"
    >
      <div className="flex items-center gap-3">
        <h2 id="first-steps-title" className="mr-auto text-sm font-semibold">
          {i18n.t('firstSteps.title')}
        </h2>
        <Button size="sm" variant="ghost" onClick={hide}>
          {i18n.t('firstSteps.hide')}
        </Button>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-2xs ${
                step.done ? 'bg-accent text-on-accent' : 'bg-hover text-fg-muted'
              }`}
            >
              {step.done ? <Check size={12} /> : index + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className={step.done ? 'text-fg-muted line-through' : ''}>
                {i18n.t(`firstSteps.${step.key}.title`)}
                {step.optional && ` · ${i18n.t('firstSteps.optional')}`}
                <span className="sr-only">
                  {' '}
                  {i18n.t(step.done ? 'firstSteps.done' : 'firstSteps.pending')}
                </span>
              </span>
              {!step.done && (
                <span className="text-xs text-fg-muted">
                  {i18n.t(`firstSteps.${step.key}.body`)}
                </span>
              )}
            </span>
            {!step.done && (step.key === 'workspace' || workspace) && (
              <Button
                size="sm"
                variant={step === next ? 'primary' : 'secondary'}
                onClick={step.action}
              >
                {i18n.t(`firstSteps.${step.key}.action`)}
              </Button>
            )}
            {step.key === 'journey' && !step.done && workspace && (
              <Button size="sm" variant="ghost" onClick={() => show('import')}>
                {i18n.t('firstSteps.journey.import')}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
