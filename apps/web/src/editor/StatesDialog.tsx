import { useState } from 'react';
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  addState,
  removeState,
  renameState,
  setStateSample,
  type Command,
  type Screen,
} from '@rnjb/core';
import { Button, Dialog, DialogContent, DialogTrigger, IconButton, Input, cx } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { CommitInput } from './CommitInput.tsx';
import { parseSampleJson, sampleToJson } from './state-sample.ts';

interface StatesDialogProps {
  screen: Screen;
  stateId: string | undefined;
  editable: boolean;
  onRun: (command: Command) => void;
  onSelectState: (stateId: string | undefined) => void;
}

/** Create, rename, delete screen states and edit the sample data of the selected one (§9.3). */
export function StatesDialog({
  screen,
  stateId,
  editable,
  onRun,
  onSelectState,
}: StatesDialogProps) {
  const i18n = useT();
  const [newName, setNewName] = useState('');
  const [sampleError, setSampleError] = useState<string | undefined>();
  const selected = screen.states.find((state) => state.id === stateId) ?? screen.states[0];

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    onRun(
      addState(screen.id, name, (id) => {
        onSelectState(id);
      }),
    );
    setNewName('');
  };

  const remove = (id: string) => {
    onRun(removeState(screen.id, id));
    if (selected?.id === id) {
      onSelectState(screen.states.find((state) => state.id !== id)?.id);
    }
  };

  const applySample = (text: string) => {
    if (!selected) return;
    const parsed = parseSampleJson(text);
    if (!parsed.ok) {
      setSampleError(
        parsed.reason === 'syntax'
          ? i18n.t('editor.topbar.sampleSyntax')
          : i18n.t('editor.topbar.sampleNotObject'),
      );
      return;
    }
    setSampleError(undefined);
    if (sampleToJson(parsed.sample) !== sampleToJson(selected.sample)) {
      onRun(setStateSample(screen.id, selected.id, parsed.sample));
    }
  };

  return (
    <Dialog onOpenChange={() => setSampleError(undefined)}>
      <DialogTrigger asChild>
        <IconButton
          label={i18n.t('editor.topbar.manageStates')}
          icon={<SlidersHorizontal size={15} />}
        />
      </DialogTrigger>
      <DialogContent
        title={i18n.t('editor.topbar.statesTitle', { screen: screen.name })}
        description={i18n.t('editor.topbar.statesHint')}
        closeLabel={i18n.t('common.close')}
        width={520}
      >
        <ul className="mb-3 flex flex-col gap-1">
          {screen.states.map((state) => (
            <li
              key={state.id}
              className={cx(
                'flex items-center gap-2 rounded-md px-1.5 py-1',
                state.id === selected?.id && 'bg-accent-subtle',
              )}
            >
              <button
                type="button"
                aria-pressed={state.id === selected?.id}
                aria-label={state.name}
                onClick={() => {
                  setSampleError(undefined);
                  onSelectState(state.id);
                }}
                className="size-2 shrink-0 rounded-full border border-line-strong aria-pressed:border-accent aria-pressed:bg-accent"
              />
              <div className="min-w-0 flex-1">
                {editable ? (
                  <CommitInput
                    label={i18n.t('editor.topbar.stateRename', { name: state.name })}
                    value={state.name}
                    mono
                    onCommit={(name) => onRun(renameState(screen.id, state.id, name.trim()))}
                  />
                ) : (
                  <span className="font-mono text-xs">{state.name}</span>
                )}
              </div>
              {editable && (
                <IconButton
                  label={i18n.t('editor.topbar.stateRemove', { name: state.name })}
                  icon={<Trash2 size={14} />}
                  onClick={() => remove(state.id)}
                />
              )}
            </li>
          ))}
        </ul>

        {editable && (
          <form
            className="mb-4 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <Input
              size="sm"
              mono
              aria-label={i18n.t('editor.topbar.stateName')}
              placeholder={i18n.t('editor.topbar.stateName')}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={newName.trim() === ''}>
              <Plus size={13} aria-hidden />
              {i18n.t('editor.topbar.stateAdd')}
            </Button>
          </form>
        )}

        {selected && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rnjb-state-sample" className="text-xs font-medium text-fg-muted">
              {i18n.t('editor.topbar.stateSample')} ·{' '}
              <span className="font-mono">{selected.name}</span>
            </label>
            <textarea
              id="rnjb-state-sample"
              key={`${selected.id}:${sampleToJson(selected.sample)}`}
              rows={9}
              spellCheck={false}
              readOnly={!editable}
              aria-invalid={sampleError ? true : undefined}
              aria-describedby={sampleError ? 'rnjb-state-sample-error' : undefined}
              defaultValue={sampleToJson(selected.sample)}
              onBlur={(event) => applySample(event.target.value)}
              className="w-full resize-y rounded-md border border-line bg-surface p-2 font-mono text-xs aria-invalid:border-danger"
            />
            {sampleError && (
              <p id="rnjb-state-sample-error" role="alert" className="text-xs text-danger">
                {sampleError}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
