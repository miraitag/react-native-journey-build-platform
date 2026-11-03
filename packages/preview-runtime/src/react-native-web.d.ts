// react-native-web ships no TypeScript types; only the parts the preview uses are declared.
declare module 'react-native-web' {
  import type { ComponentType, ReactNode } from 'react';

  type Style = Record<string, string | number | undefined>;
  interface ViewProps {
    style?: Style | (Style | undefined)[];
    dataSet?: Record<string, string>;
    children?: ReactNode;
  }
  interface TextProps {
    style?: Style | (Style | undefined)[];
    children?: ReactNode;
  }

  export const View: ComponentType<ViewProps>;
  export const Text: ComponentType<TextProps>;
  export const AppRegistry: {
    registerComponent(name: string, getComponent: () => ComponentType): void;
    runApplication(name: string, options: { rootTag: HTMLElement }): void;
  };
}
