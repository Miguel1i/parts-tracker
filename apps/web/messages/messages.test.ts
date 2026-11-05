import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

const dir = __dirname;
const load = (file: string) => JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree;
const reference = keys(load("en.json")).sort();
const others = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json");

describe("translations", () => {
  it("has at least one other locale", () => {
    expect(others.length).toBeGreaterThan(0);
  });

  it.each(others)("%s has exactly the same keys as en.json", (file) => {
    expect(keys(load(file)).sort()).toEqual(reference);
  });

  it.each(["en.json", ...others])("%s has no empty strings", (file) => {
    const tree = load(file);
    const empty = keys(tree).filter((k) => {
      const value = k
        .split(".")
        .reduce<Tree | string>((node, part) => (node as Tree)[part]!, tree);
      return typeof value === "string" && value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
