import { colors } from "./colors";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private _text: string;
  private frameIndex: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isSpinning: boolean = false;

  constructor(text: string) {
    this._text = text;
  }

  start(): this {
    if (this.isSpinning) return this;

    this.isSpinning = true;
    this.render();

    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % frames.length;
      this.render();
    }, 80);

    return this;
  }

  private render(): void {
    if (!this.isSpinning) return;
    const frame = frames[this.frameIndex];
    process.stdout.write(`\r${colors.cyan(frame)} ${this._text}`);
  }

  private clear(): void {
    process.stdout.write("\r" + " ".repeat(this._text.length + 10) + "\r");
  }

  stop(): void {
    if (!this.isSpinning) return;

    this.isSpinning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.clear();
  }

  succeed(text?: string): void {
    this.stop();
    console.log(colors.green("✔") + " " + (text || this._text));
  }

  fail(text?: string): void {
    this.stop();
    console.log(colors.red("✖") + " " + (text || this._text));
  }

  set text(value: string) {
    this._text = value;
  }
}

export function spinner(text: string): Spinner {
  return new Spinner(text);
}
