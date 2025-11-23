import "@testing-library/jest-dom";
import { Window } from "happy-dom";

const window = new Window();
const document = window.document;

declare global {
  var window: Window;
  var document: typeof document;
  var navigator: typeof window.navigator;
  var HTMLElement: typeof window.HTMLElement;
  var Element: typeof window.Element;
  var Node: typeof window.Node;
  var NodeList: typeof window.NodeList;
}

globalThis.window = window;
globalThis.document = document;
globalThis.navigator = window.navigator;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.NodeList = window.NodeList;
