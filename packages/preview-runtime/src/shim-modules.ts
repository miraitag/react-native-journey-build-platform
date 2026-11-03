/**
 * Web shims for the native modules the initial libraries import (plan §7.4). They make the
 * components render and keep their hooks callable; none of them animates or talks to a device.
 * Built from the host's React and react-native-web so the module stays testable without a DOM.
 */

type AnyFn = (...args: unknown[]) => unknown;
type Component = unknown;

interface ReactLike {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown;
  createContext<T>(value: T): { Provider: Component; Consumer: Component };
  useContext(context: unknown): unknown;
  useRef<T>(value: T): { current: T };
  useCallback<T>(callback: T, deps: unknown[]): T;
}

type NativeModules = Record<string, Component>;

const noop = () => undefined;
const identity = <T>(value: T): T => value;
const resolved =
  <T>(value: T) =>
  () =>
    Promise.resolve(value);

/** Marks a shim as an ES module so `import X, { y } from '...'` resolves `default` and names. */
const esm = (members: Record<string, unknown>, defaultExport?: unknown) => ({
  __esModule: true,
  default: defaultExport ?? members,
  ...members,
});

/** Any property is a builder that returns itself: `FadeIn.duration(200).delay(50)` just works. */
function chain(): unknown {
  const target = function () {
    return proxy;
  } as unknown as Record<string, unknown>;
  const proxy: unknown = new Proxy(target, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : proxy),
    apply: () => proxy,
  });
  return proxy;
}

const SVG_ELEMENTS: Record<string, string> = {
  Svg: 'svg',
  G: 'g',
  Path: 'path',
  Circle: 'circle',
  Ellipse: 'ellipse',
  Rect: 'rect',
  Line: 'line',
  Polygon: 'polygon',
  Polyline: 'polyline',
  Defs: 'defs',
  LinearGradient: 'linearGradient',
  RadialGradient: 'radialGradient',
  Stop: 'stop',
  ClipPath: 'clipPath',
  Mask: 'mask',
  Use: 'use',
  Symbol: 'symbol',
  Text: 'text',
  TSpan: 'tspan',
};

export function createShims(React: ReactLike, RN: NativeModules): Record<string, unknown> {
  const { createElement } = React;
  const View = RN['View'];
  const passthrough = (props: { children?: unknown }) => props.children ?? null;
  const viewLike = (props: Record<string, unknown>) => createElement(View, props);

  // react-native-svg: the DOM already draws SVG, and React DOM accepts the same camelCase props.
  const svg = Object.fromEntries(
    Object.entries(SVG_ELEMENTS).map(([name, tag]) => [
      name,
      (props: Record<string, unknown>) => createElement(tag, props),
    ]),
  );

  // The preview iframe already sits between the device's safe-area insets (see PreviewFrame).
  const zeroInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  const InsetsContext = React.createContext<typeof zeroInsets | null>(zeroInsets);
  const FrameContext = React.createContext({ x: 0, y: 0, width: 0, height: 0 });

  const reanimatedComponents = Object.fromEntries(
    ['View', 'Text', 'ScrollView', 'Image', 'FlatList'].map((name) => [name, RN[name]]),
  );
  const timing = (value: unknown, _config?: unknown, callback?: AnyFn) => {
    callback?.(true);
    return value;
  };

  return {
    'react-native-safe-area-context': esm({
      SafeAreaProvider: passthrough,
      SafeAreaView: viewLike,
      SafeAreaInsetsContext: InsetsContext,
      SafeAreaFrameContext: FrameContext,
      useSafeAreaInsets: () => zeroInsets,
      useSafeAreaFrame: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      initialWindowMetrics: { insets: zeroInsets, frame: { x: 0, y: 0, width: 0, height: 0 } },
    }),

    'react-native-svg': esm(svg, svg['Svg']),

    'react-native-gesture-handler': esm({
      GestureHandlerRootView: viewLike,
      GestureDetector: passthrough,
      Gesture: chain(),
      gestureHandlerRootHOC: identity,
      PanGestureHandler: passthrough,
      TapGestureHandler: passthrough,
      LongPressGestureHandler: passthrough,
      PinchGestureHandler: passthrough,
      Swipeable: viewLike,
      ScrollView: RN['ScrollView'],
      FlatList: RN['FlatList'],
      TouchableOpacity: RN['TouchableOpacity'],
      TouchableHighlight: RN['TouchableHighlight'],
      TouchableWithoutFeedback: RN['TouchableWithoutFeedback'],
      State: { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 },
      Directions: { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 },
    }),

    'react-native-reanimated': esm(
      {
        ...reanimatedComponents,
        createAnimatedComponent: identity,
        useSharedValue: (initial: unknown) => React.useRef({ value: initial }).current,
        useDerivedValue: (compute: () => unknown) => ({ value: compute() }),
        useAnimatedStyle: (compute: () => unknown) => compute(),
        useAnimatedProps: (compute: () => unknown) => compute(),
        useAnimatedScrollHandler: () => noop,
        useAnimatedRef: () => React.useRef(null),
        useAnimatedReaction: noop,
        useReducedMotion: () => false,
        withTiming: timing,
        withSpring: timing,
        withDecay: timing,
        withDelay: (_delay: unknown, value: unknown) => value,
        withRepeat: (value: unknown) => value,
        withSequence: (...values: unknown[]) => values[values.length - 1],
        cancelAnimation: noop,
        runOnJS: identity,
        runOnUI: identity,
        interpolate: (value: number, input: number[], output: number[]) => {
          const [from = 0, to = 1] = input;
          const ratio = to === from ? 0 : (value - from) / (to - from);
          return (output[0] ?? 0) + ratio * ((output[output.length - 1] ?? 0) - (output[0] ?? 0));
        },
        interpolateColor: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
        Easing: chain(),
        Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
        FadeIn: chain(),
        FadeOut: chain(),
        SlideInDown: chain(),
        SlideOutDown: chain(),
        SlideInUp: chain(),
        SlideOutUp: chain(),
        ZoomIn: chain(),
        ZoomOut: chain(),
        Layout: chain(),
        LinearTransition: chain(),
      },
      { ...reanimatedComponents, createAnimatedComponent: identity },
    ),

    'react-native-worklets': esm({
      runOnJS: identity,
      runOnUI: identity,
      scheduleOnRN: (callback: AnyFn, ...args: unknown[]) => callback(...args),
      scheduleOnUI: (callback: AnyFn, ...args: unknown[]) => callback(...args),
      createWorkletRuntime: noop,
      isWorkletFunction: () => false,
    }),

    'react-native-screens': esm({
      enableScreens: noop,
      enableFreeze: noop,
      screensEnabled: () => false,
      Screen: viewLike,
      ScreenContainer: viewLike,
      ScreenStack: viewLike,
      NativeScreen: viewLike,
      NativeScreenContainer: viewLike,
    }),

    '@react-native-clipboard/clipboard': esm({
      setString: noop,
      getString: resolved(''),
    }),
    'react-native-share': esm({ open: resolved({}), shareSingle: resolved({}) }),
    'react-native-view-shot': esm({
      captureRef: resolved(''),
      captureScreen: resolved(''),
      default: viewLike,
    }),
    '@react-native-community/netinfo': esm(
      {
        fetch: resolved({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
        addEventListener: () => noop,
        useNetInfo: () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
      },
      {
        fetch: resolved({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
        addEventListener: () => noop,
      },
    ),
  };
}
