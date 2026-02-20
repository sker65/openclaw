import fs from "node:fs";

export function readRawValueFromArgs(argv: string[]): string {
  let rawFile: string | undefined;
  let rawInline: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) {
      continue;
    }
    if (a === "--raw-file") {
      rawFile = argv[++i];
    } else if (a === "--raw") {
      rawInline = argv[++i];
    }
  }

  if (rawInline?.trim()) {
    return rawInline;
  }
  if (rawFile?.trim()) {
    return fs.readFileSync(rawFile, "utf8");
  }
  throw new Error("missing raw config input (use --raw or --raw-file)");
}

export function readOptionalStringArg(argv: string[], flag: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) {
      continue;
    }
    if (a === flag) {
      return argv[++i];
    }
  }
  return undefined;
}

export function readOptionalNumberArg(argv: string[], flag: string): number | undefined {
  const raw = readOptionalStringArg(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
