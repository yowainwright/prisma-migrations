import * as readline from "readline";

export interface PromptChoice {
  name: string;
  value: string;
}

export class Prompt {
  protected rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  close(): void {
    this.rl.close();
  }

  private ensureCookedMode(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }

  async input(
    message: string,
    defaultValue?: string,
    validate?: (input: string) => string | boolean,
  ): Promise<string> {
    return new Promise((resolve) => {
      const prompt = defaultValue
        ? `${message} (${defaultValue}): `
        : `${message}: `;

      const askForInput = () => {
        this.ensureCookedMode();
        this.rl.question(prompt, (answer) => {
          const value = answer.trim() || defaultValue || "";

          if (validate) {
            const result = validate(value);
            if (result !== true) {
              console.log(`⚠️  ${result}`);
              askForInput();
              return;
            }
          }

          resolve(value);
        });
      };

      askForInput();
    });
  }

  async number(
    message: string,
    defaultValue?: number,
    validate?: (input: number | undefined) => string | boolean,
  ): Promise<number> {
    return new Promise((resolve) => {
      const prompt = defaultValue
        ? `${message} (${defaultValue}): `
        : `${message}: `;

      const askForNumber = () => {
        this.ensureCookedMode();
        this.rl.question(prompt, (answer) => {
          const trimmed = answer.trim();
          const num = trimmed === "" ? defaultValue : parseInt(trimmed, 10);

          if (num === undefined) {
            console.log("⚠️  Please enter a number");
            askForNumber();
            return;
          }

          if (isNaN(num)) {
            console.log("⚠️  Please enter a valid number");
            askForNumber();
            return;
          }

          if (validate) {
            const result = validate(num);
            if (result !== true) {
              console.log(`⚠️  ${result}`);
              askForNumber();
              return;
            }
          }

          resolve(num);
        });
      };

      askForNumber();
    });
  }

  async confirm(message: string, defaultValue = true): Promise<boolean> {
    return new Promise((resolve) => {
      const defaultText = defaultValue ? "Y/n" : "y/N";
      this.ensureCookedMode();
      this.rl.question(`${message} (${defaultText}): `, (answer) => {
        const normalized = answer.trim().toLowerCase();
        if (normalized === "") {
          resolve(defaultValue);
        } else {
          resolve(normalized === "y" || normalized === "yes");
        }
      });
    });
  }

  async list(message: string, choices: PromptChoice[]): Promise<string> {
    console.log(`\n${message}`);

    choices.forEach((choice, index) => {
      console.log(`  ${index + 1}. ${choice.name}`);
    });

    return new Promise((resolve) => {
      const askForChoice = () => {
        this.ensureCookedMode();
        this.rl.question("\nEnter your choice (number): ", (answer) => {
          const num = parseInt(answer.trim(), 10);

          if (isNaN(num) || num < 1 || num > choices.length) {
            console.log(
              `⚠️  Invalid choice. Please enter a number between 1 and ${choices.length}`,
            );
            askForChoice();
          } else {
            resolve(choices[num - 1].value);
          }
        });
      };

      askForChoice();
    });
  }
}

export const createPrompt = async <T>(
  callback: (prompt: Prompt) => Promise<T>,
): Promise<T> => {
  const prompt = new Prompt();
  try {
    const result = await callback(prompt);
    return result;
  } finally {
    prompt.close();
  }
};
