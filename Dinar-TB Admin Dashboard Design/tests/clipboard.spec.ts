import { copyTextToClipboard } from "../src/utils/clipboard";

type FakeArea = {
  value: string;
  style: Record<string, string>;
  tabIndex: number;
  setAttribute: jest.Mock;
  focus: jest.Mock;
  select: jest.Mock;
  setSelectionRange: jest.Mock;
  remove: jest.Mock;
};

const realNavigator = globalThis.navigator;
const realDocument = globalThis.document;

function setNavigator(writeText?: jest.Mock) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: writeText ? { clipboard: { writeText } } : {},
  });
}

function installDocument(options: { execCommand: boolean | "missing" }) {
  const area: FakeArea = {
    value: "",
    style: {},
    tabIndex: 0,
    setAttribute: jest.fn(),
    focus: jest.fn(),
    select: jest.fn(),
    setSelectionRange: jest.fn(),
    remove: jest.fn(),
  };
  const body = { appendChild: jest.fn((node: FakeArea) => node) };
  const doc = {
    activeElement: { focus: jest.fn() },
    createElement: jest.fn(() => area),
    body,
    execCommand:
      options.execCommand === "missing"
        ? undefined
        : jest.fn(() => options.execCommand),
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: doc,
  });
  return { area, doc, body };
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: realNavigator,
  });
  if (realDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
  } else {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: realDocument,
    });
  }
});

describe("copyTextToClipboard", () => {
  it("copies through the Clipboard API when it is available", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setNavigator(writeText);
    const { doc, area } = installDocument({ execCommand: true });

    await expect(copyTextToClipboard("Rahasia#123")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Rahasia#123");
    expect(doc.createElement).not.toHaveBeenCalled();
    expect(area.remove).not.toHaveBeenCalled();
  });

  it("falls back to a hidden textarea when the Clipboard API is unavailable", async () => {
    setNavigator(undefined);
    const { doc, area } = installDocument({ execCommand: true });

    await expect(copyTextToClipboard("Rahasia#123")).resolves.toBe(true);
    expect(doc.createElement).toHaveBeenCalledWith("textarea");
    expect(doc.body.appendChild).toHaveBeenCalledWith(area);
    expect(area.value).toBe("Rahasia#123");
    expect(area.focus).toHaveBeenCalled();
    expect(area.select).toHaveBeenCalled();
    expect(area.setSelectionRange).toHaveBeenCalledWith(0, "Rahasia#123".length);
    expect(area.remove).toHaveBeenCalled();
  });

  it("falls back when the Clipboard API rejects (iframe/permission denied)", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("blocked"));
    setNavigator(writeText);
    const { area } = installDocument({ execCommand: true });

    await expect(copyTextToClipboard("Rahasia#123")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(area.value).toBe("Rahasia#123");
  });

  it("reports failure when both mechanisms fail", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("blocked"));
    setNavigator(writeText);
    installDocument({ execCommand: false });

    await expect(copyTextToClipboard("Rahasia#123")).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("never reports success when no copy mechanism exists", async () => {
    setNavigator(undefined);
    installDocument({ execCommand: "missing" });

    await expect(copyTextToClipboard("Rahasia#123")).resolves.toBe(false);
  });

  it("does not touch the clipboard for empty text", async () => {
    const writeText = jest.fn();
    setNavigator(writeText);
    installDocument({ execCommand: true });

    await expect(copyTextToClipboard("")).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
