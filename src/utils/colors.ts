const reset = "\x1b[0m";
const bold = "\x1b[1m";

const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const cyan = "\x1b[36m";
const gray = "\x1b[90m";

export const colors = {
  reset: (str: string) => `${reset}${str}`,
  bold: (str: string) => `${bold}${str}${reset}`,
  red: (str: string) => `${red}${str}${reset}`,
  green: (str: string) => `${green}${str}${reset}`,
  yellow: (str: string) => `${yellow}${str}${reset}`,
  blue: (str: string) => `${blue}${str}${reset}`,
  cyan: (str: string) => `${cyan}${str}${reset}`,
  gray: (str: string) => `${gray}${str}${reset}`,
};
