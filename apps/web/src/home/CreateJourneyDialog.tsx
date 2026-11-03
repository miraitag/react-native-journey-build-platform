import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  PLATFORM_VERSION,
  applyBasicJourney,
  cloneDocument,
  createDocument,
  deriveNames,
  normalizeSlug,
} from '@rnjb/core';
import { FORMAT_VERSION } from '@rnjb/document-schema';
import { defaultProfile, profilePrefixes } from '@rnjb/profiles';
import { Button, Dialog, DialogContent, Field, Input, Switch } from '@rnjb/ui';
import type { MessageKey } from '@rnjb/i18n';
import { selectEntries, useService } from '../services/service-store.ts';
import { localService } from '../services/local-service.ts';
import { serializeDocument } from '../services/document-client.ts';
import { useT } from '../app/preferences.ts';
import { useDialogs, type DeriveRequest } from '../app/dialogs-store.ts';
import { openText, readDocument, reportError } from '../app/open-document.ts';

const templates = defaultProfile.conventions.nameTemplates;
const prefixes = profilePrefixes(defaultProfile);
const clock = { now: () => new Date().toISOString() };

/** Suggests a slug from a display name: strips accents, keeps [a-z0-9-]. */
export const suggestSlug = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/-+$/, '')
    .slice(0, 50)
    .replace(/-+$/, '');

export function CreateJourneyDialog() {
  const open = useDialogs((state) => state.open === 'create');
  const derive = useDialogs((state) => state.derive);
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();
  const asTemplate = derive?.target === 'template';
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      {open && (
        <DialogContent
          title={
            asTemplate
              ? i18n.t('create.titleTemplate')
              : derive
                ? i18n.t('create.titleFromTemplate')
                : i18n.t('create.title')
          }
          description={i18n.t('create.description')}
          closeLabel={i18n.t('common.close')}
          width={600}
        >
          <CreateJourneyForm derive={derive} onDone={hide} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function CreateJourneyForm({
  derive,
  onDone,
}: {
  derive: DeriveRequest | undefined;
  onDone: () => void;
}) {
  const i18n = useT();
  const kind = derive?.target ?? 'journey';
  const status = useService((state) => state.status);
  const settings = useService((state) => state.settings);
  const entries = useService(selectEntries);
  const refreshIndex = useService((state) => state.refreshIndex);

  const [name, setName] = useState(derive ? i18n.t('create.copyName', { name: derive.name }) : '');
  const [slugInput, setSlugInput] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [basic, setBasic] = useState(false);

  const slugValue = slugEdited ? slugInput : suggestSlug(name);
  const result = normalizeSlug(slugValue, {
    prefixes,
    existing: entries.map((entry) => entry.slug),
  });
  const slug = result.ok ? result.value.slug : undefined;
  const warning = result.ok ? result.value.warnings[0] : undefined;
  const slugError =
    !result.ok && (touched || slugValue.length > 0)
      ? i18n.error(result.error.code, result.error.params)
      : undefined;
  const derived = slug ? deriveNames(slug, templates) : undefined;
  const canSubmit = name.trim().length > 0 && slug !== undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit || !slug) return;
    setSaving(true);
    try {
      const displayName = name.trim();
      let document;
      if (derive) {
        const { contents } = await localService.readFile(derive.path);
        const opened = await readDocument(contents, i18n);
        if (!opened) return;
        document = cloneDocument(
          opened,
          { kind, name: displayName, slug },
          { ids: { next: () => crypto.randomUUID() }, clock },
        );
      } else {
        document = createDocument(
          {
            kind: 'journey',
            name: displayName,
            slug,
            profile: { id: defaultProfile.id, version: defaultProfile.version },
            libraries: [],
            platformVersion: PLATFORM_VERSION,
            formatVersion: FORMAT_VERSION,
          },
          clock,
        );
        if (basic) {
          document = applyBasicJourney(
            document,
            {
              screenNames: [
                i18n.t('create.basicScreen1'),
                i18n.t('create.basicScreen2'),
                i18n.t('create.basicScreen3'),
              ],
              initialStates: defaultProfile.conventions.initialStates,
            },
            { ids: { next: () => crypto.randomUUID() }, clock },
          );
        }
      }
      const text = await serializeDocument(document);
      const created = i18n.t(kind === 'template' ? 'create.createdTemplate' : 'create.created', {
        name: displayName,
      });
      if (status === 'online' && settings?.workspacePath) {
        const path = `${kind === 'template' ? 'templates' : 'journeys'}/${slug}/${slug}.rnjb`;
        await localService.writeFile(path, text, { createOnly: true });
        await openText(text, { type: 'workspace', path }, displayName, i18n);
        void refreshIndex();
        toast.success(created);
      } else {
        await openText(text, { type: 'memory' }, displayName, i18n);
        toast.warning(i18n.t('create.createdLocalOnly', { name: displayName }));
      }
      onDone();
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 pt-1">
      <Field label={i18n.t('create.name')}>
        {(field) => (
          <Input
            {...field}
            autoFocus
            required
            value={name}
            placeholder={i18n.t('create.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <Field
        label={i18n.t('create.slug')}
        error={slugError ? `${slugError.message} ${slugError.action}` : undefined}
        hint={
          warning ? i18n.error(warning.code, warning.params).message : i18n.t('create.slugHint')
        }
      >
        {(field) => (
          <Input
            {...field}
            mono
            required
            spellCheck={false}
            autoComplete="off"
            value={slugValue}
            onBlur={() => setTouched(true)}
            onChange={(event) => {
              setSlugEdited(true);
              setSlugInput(event.target.value);
            }}
          />
        )}
      </Field>

      {!derive && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm">{i18n.t('create.basic')}</span>
            <span className="text-xs text-fg-muted">{i18n.t('create.basicHint')}</span>
          </div>
          <Switch label={i18n.t('create.basic')} checked={basic} onCheckedChange={setBasic} />
        </div>
      )}

      <section aria-label={i18n.t('create.derived')} className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-medium">{i18n.t('create.derived')}</h3>
          <span className="text-2xs text-fg-subtle">
            {i18n.t('create.derivedFrom', { profile: defaultProfile.name })}
          </span>
        </div>
        <dl className="grid grid-cols-[max-content_1fr] overflow-hidden rounded-md bg-canvas text-xs shadow-[inset_0_0_0_1px_var(--line-subtle)]">
          {(Object.keys(templates) as (keyof typeof templates)[]).map((key) => (
            <div
              key={key}
              className="contents [&:not(:last-child)>*]:border-b [&>*]:border-line-subtle"
            >
              <dt className="px-3 py-1.5 text-fg-muted">
                {i18n.t(`create.keys.${key}` as MessageKey)}
              </dt>
              <dd className="truncate px-3 py-1.5 font-mono text-fg" title={derived?.[key]}>
                {derived ? derived[key] : <span className="text-fg-subtle">{templates[key]}</span>}
              </dd>
            </div>
          ))}
        </dl>
        {!derived && <p className="text-2xs text-fg-subtle">{i18n.t('create.derivedEmpty')}</p>}
      </section>

      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-line-subtle bg-panel px-5 py-3">
        <Button variant="ghost" onClick={onDone}>
          {i18n.t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!canSubmit}>
          {i18n.t(kind === 'template' ? 'create.submitTemplate' : 'create.submit')}
        </Button>
      </div>
    </form>
  );
}
