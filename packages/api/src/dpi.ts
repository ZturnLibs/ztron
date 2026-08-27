/**
 * DPI-aware geometry types — a port of `@tauri-apps/api/dpi`.
 *
 * Logical pixels scale with the window's DPI factor (what CSS/browser APIs
 * use); physical pixels are real device pixels. The Ztron wire protocol
 * serializes both as plain `{ width, height }` / `{ x, y }` objects.
 */

/** A size represented in logical pixels. */
export class LogicalSize {
  readonly type = "Logical" as const;
  constructor(
    public width: number,
    public height: number,
  ) {}

  toPhysical(scaleFactor: number): PhysicalSize {
    return new PhysicalSize(this.width * scaleFactor, this.height * scaleFactor);
  }

  toJSON(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}

/** A size represented in physical pixels. */
export class PhysicalSize {
  readonly type = "Physical" as const;
  constructor(
    public width: number,
    public height: number,
  ) {}

  toLogical(scaleFactor: number): LogicalSize {
    return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
  }

  toJSON(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}

/** A position represented in logical pixels. */
export class LogicalPosition {
  readonly type = "Logical" as const;
  constructor(
    public x: number,
    public y: number,
  ) {}

  toPhysical(scaleFactor: number): PhysicalPosition {
    return new PhysicalPosition(this.x * scaleFactor, this.y * scaleFactor);
  }

  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}

/** A position represented in physical pixels. */
export class PhysicalPosition {
  readonly type = "Physical" as const;
  constructor(
    public x: number,
    public y: number,
  ) {}

  toLogical(scaleFactor: number): LogicalPosition {
    return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
  }

  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}

/** Anything the window geometry methods accept as a size/position value. */
export type SizeLike = number | LogicalSize | PhysicalSize | { width: number; height: number };
export type PositionLike = number | LogicalPosition | PhysicalPosition | { x: number; y: number };

/** Normalizes a size-like pair of arguments to plain `{ width, height }`. */
export function normalizeSize(
  a: SizeLike,
  b?: number,
): { width: number; height: number } {
  if (typeof a === "number") return { width: a, height: b ?? 0 };
  if (a instanceof LogicalSize || a instanceof PhysicalSize) {
    return { width: a.width, height: a.height };
  }
  return { width: a.width, height: a.height };
}

/** Normalizes a position-like pair of arguments to plain `{ x, y }`. */
export function normalizePosition(
  a: PositionLike,
  b?: number,
): { x: number; y: number } {
  if (typeof a === "number") return { x: a, y: b ?? 0 };
  if (a instanceof LogicalPosition || a instanceof PhysicalPosition) {
    return { x: a.x, y: a.y };
  }
  return { x: a.x, y: a.y };
}

/** Upstream dpi.Size wrapper — logical OR physical resolution. */
export class Size {
  readonly type: "Logical" | "Physical";
  constructor(source: LogicalSize | PhysicalSize | { width: number; height: number; type?: string }) {
    if (source instanceof LogicalSize) {
      this.width = source.width;
      this.height = source.height;
      this.type = "Logical";
    } else if (source instanceof PhysicalSize) {
      this.width = source.width;
      this.height = source.height;
      this.type = "Physical";
    } else {
      const t = (source as { type?: string }).type === "Physical" ? "Physical" : "Logical";
      this.type = t;
      this.width = source.width;
      this.height = source.height;
    }
  }
  width: number;
  height: number;
  toLogical(scaleFactor: number): LogicalSize {
    return this.type === "Logical"
      ? new LogicalSize(this.width, this.height)
      : new PhysicalSize(this.width, this.height).toLogical(scaleFactor);
  }
  toPhysical(scaleFactor: number): PhysicalSize {
    return this.type === "Physical"
      ? new PhysicalSize(this.width, this.height)
      : new LogicalSize(this.width, this.height).toPhysical(scaleFactor);
  }
  toJSON(): { width: number; height: number; type: string } {
    return { width: this.width, height: this.height, type: this.type };
  }
}

/** Upstream dpi.Position wrapper — logical OR physical resolution. */
export class Position {
  readonly type: "Logical" | "Physical";
  x: number;
  y: number;
  constructor(source: LogicalPosition | PhysicalPosition | { x: number; y: number; type?: string }) {
    if (source instanceof LogicalPosition) {
      this.x = source.x; this.y = source.y; this.type = "Logical";
    } else if (source instanceof PhysicalPosition) {
      this.x = source.x; this.y = source.y; this.type = "Physical";
    } else {
      this.type = (source as { type?: string }).type === "Physical" ? "Physical" : "Logical";
      this.x = source.x; this.y = source.y;
    }
  }
  toLogical(scaleFactor: number): LogicalPosition {
    return this.type === "Logical"
      ? new LogicalPosition(this.x, this.y)
      : new PhysicalPosition(this.x, this.y).toLogical(scaleFactor);
  }
  toPhysical(scaleFactor: number): PhysicalPosition {
    return this.type === "Physical"
      ? new PhysicalPosition(this.x, this.y)
      : new LogicalPosition(this.x, this.y).toPhysical(scaleFactor);
  }
  toJSON(): { x: number; y: number; type: string } {
    return { x: this.x, y: this.y, type: this.type };
  }
}
