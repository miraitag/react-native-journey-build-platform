import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button, EmptyState } from '@rnjb/ui';
import type { Translator } from '@rnjb/i18n';

interface Props {
  area: string;
  i18n: Translator;
  children: ReactNode;
  className?: string;
}

/** Isolates a failing area so the rest of the platform keeps working (§10.4). */
export class ErrorBoundary extends Component<Props, { error: Error | undefined }> {
  override state: { error: Error | undefined } = { error: undefined };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.area}]`, error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    const { i18n, area, children, className } = this.props;
    if (!error) return children;
    return (
      <div role="alert" className={className}>
        <EmptyState
          icon={<TriangleAlert size={18} className="text-danger" />}
          title={i18n.t('boundary.title', { area })}
          actions={
            <Button size="sm" onClick={() => this.setState({ error: undefined })}>
              {i18n.t('boundary.reload')}
            </Button>
          }
        >
          <p>{i18n.t('boundary.body')}</p>
          <p className="mt-2 font-mono text-2xs break-all text-fg-subtle">{error.message}</p>
        </EmptyState>
      </div>
    );
  }
}
