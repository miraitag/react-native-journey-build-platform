/**
 * Domain entities of a journey document (plan §8). `@rnjb/document-schema` validates these
 * shapes with Zod; the compiler checks both stay in sync.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type DocumentKind = 'journey' | 'template';

export interface DocumentMeta {
  kind: DocumentKind;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  platformVersion: string;
}

export interface LibraryRef {
  package: string;
  version: string;
  packId: string;
}

export interface ProfileRef {
  id: string;
  version: string;
}

export interface ComponentRef {
  package: string;
  component: string;
  version: string;
  variant?: string;
}

/** Typed prop values (§9.4). */
export type PropValue =
  | { type: 'literal'; value: JsonPrimitive }
  | { type: 'string'; key: string }
  | { type: 'token'; group: string; name: string }
  | { type: 'icon'; name: string }
  | { type: 'binding'; source: BindingSource; path: string }
  | { type: 'expression'; code: string };

export type BindingSource = 'uiState' | 'form' | 'handler' | 'param';

export type PropValueType = PropValue['type'];

export type SpacingValue =
  { type: 'literal'; value: number } | { type: 'token'; group: string; name: string };

export interface Spacing {
  margin?: Partial<Record<'top' | 'right' | 'bottom' | 'left', SpacingValue>>;
  padding?: Partial<Record<'top' | 'right' | 'bottom' | 'left', SpacingValue>>;
  gap?: SpacingValue;
}

/** Flexbox only (§9.1); `position: absolute` is allowed only when the manifest admits it. */
export interface Layout {
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?:
    'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  width?: number | string;
  height?: number | string;
  position?: 'relative' | 'absolute';
}

export interface CodeBlock {
  language: 'ts' | 'tsx';
  source: string;
  imports: string[];
  /** Original location when the block came from an import (§17.3.10). */
  origin?: { file: string; start: number; end: number };
}

export interface ComponentNode {
  id: string;
  kind: 'component';
  name?: string;
  ref: ComponentRef;
  props: Record<string, PropValue>;
  children: string[];
  layout: Layout;
  spacing: Spacing;
}

export interface CodeNode {
  id: string;
  kind: 'code';
  name?: string;
  code: CodeBlock;
  children: string[];
}

export type DocumentNode = ComponentNode | CodeNode;

export interface ScreenState {
  id: string;
  name: string;
  sample: Record<string, JsonValue>;
}

export interface HookUsage {
  id: string;
  hook: string;
  library: string;
  version: string;
  bindings: Record<string, string>;
  dependencies: string[];
  body?: CodeBlock;
}

export interface ScreenLogic {
  hooks: HookUsage[];
  blocks: CodeBlock[];
}

export interface Screen {
  id: string;
  name: string;
  rootId: string;
  nodes: Record<string, DocumentNode>;
  states: ScreenState[];
  logic: ScreenLogic;
}

export interface TypedParam {
  name: string;
  type: string;
  optional?: boolean;
}

export interface Connection {
  id: string;
  fromScreenId: string;
  triggerNodeId?: string;
  toScreenId: string;
  params: TypedParam[];
}

export type FormFieldType = 'string' | 'number' | 'boolean' | 'date' | 'email' | 'select';

export interface FormField {
  id: string;
  name: string;
  type: FormFieldType;
  required: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  /** Message keys pointing into `strings`. */
  messages: Record<string, string>;
  defaultValue?: JsonPrimitive;
  nodeId?: string;
}

export interface Form {
  id: string;
  screenId: string;
  name: string;
  mode?: 'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' | 'all';
  dynamic: boolean;
  fields: FormField[];
}

export interface DomainModelField {
  name: string;
  type: string;
  optional?: boolean;
}

export interface DomainModel {
  id: string;
  name: string;
  fields: DomainModelField[];
}

export interface GatewayMethod {
  id: string;
  name: string;
  input?: string;
  output: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: CodeBlock;
}

export interface DocumentData {
  models: DomainModel[];
  gateways: GatewayMethod[];
  blocks: CodeBlock[];
}

export interface Asset {
  id: string;
  /** Relative to the journey `assets/` folder. */
  path: string;
  mimeType?: string;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
}

export interface BoardPosition {
  x: number;
  y: number;
}

export interface Board {
  initialScreenId?: string;
  positions: Record<string, BoardPosition>;
}

export interface Provenance {
  importedFrom?: { repository: string; commit: string; profile: ProfileRef };
  remote?: { remote: string; ref: string; path: string; commit: string; base?: string };
}

export interface RnjbDocument {
  format: 'rnjb';
  formatVersion: number;
  meta: DocumentMeta;
  libraries: LibraryRef[];
  profile: ProfileRef;
  screens: Screen[];
  connections: Connection[];
  forms: Form[];
  data: DocumentData;
  strings: Record<string, string>;
  assets: Asset[];
  categories: Category[];
  board: Board;
  provenance?: Provenance;
  integrity: string;
}
