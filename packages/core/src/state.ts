/**
 * App state management — translated from Tauri's `crates/tauri/src/state.rs`.
 * Values are keyed by their class/token so handlers can pull typed state
 * out of `CommandContext`.
 */
export class StateManager {
  #states = new Map<object, unknown>();

  set<T>(token: abstract new (...args: never[]) => T, value: T): void {
    this.#states.set(token, value);
  }

  get<T>(token: abstract new (...args: never[]) => T): T | undefined {
    return this.#states.get(token) as T | undefined;
  }

  getOr<T>(token: abstract new (...args: never[]) => T, init: () => T): T {
    let value = this.#states.get(token) as T | undefined;
    if (value === undefined) {
      value = init();
      this.#states.set(token, value);
    }
    return value;
  }

  has(token: object): boolean {
    return this.#states.has(token);
  }

  remove(token: object): void {
    this.#states.delete(token);
  }
}
