/**
 * Registry of native-module shims for the web preview (plan §7.4). A component that needs a shim
 * that is not registered renders as a placeholder marked "approximate view"; it stays editable.
 */
export class ShimRegistry {
  private readonly modules = new Map<string, unknown>();

  register(name: string, implementation: unknown): this {
    this.modules.set(name, implementation);
    return this;
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }

  get(name: string): unknown {
    return this.modules.get(name);
  }

  /** Shims a library declares that the registry cannot provide. */
  missing(required: readonly string[]): string[] {
    return required.filter((name) => !this.modules.has(name));
  }
}

export const shims = new ShimRegistry();
