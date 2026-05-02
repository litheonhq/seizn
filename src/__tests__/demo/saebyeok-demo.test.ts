import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import DemoPage from "@/app/[locale]/demo/page";
import { getSaebyeokDemoCopy } from "@/components/demo/saebyeok-demo";
import {
  SAEBYEOK_SOURCE_FILES,
  getArray,
  loadSaebyeokDemoData,
} from "@/lib/sample-ip-demo";

describe("Saebyeok sample IP demo", () => {
  it("loads all seven Phase C source files into the demo snapshot", async () => {
    const data = await loadSaebyeokDemoData();

    expect(SAEBYEOK_SOURCE_FILES).toHaveLength(7);
    expect(data.readme.title).toContain("Saebyeok");
    expect(data.summary).toEqual({
      characters: 8,
      worldRules: 22,
      timelineEvents: 30,
      relationships: 10,
      reviewCases: 50,
      simulations: 8,
    });
  });

  it("keeps demo source arrays available for all mini-screens", async () => {
    const data = await loadSaebyeokDemoData();

    expect(getArray(data.reviewCases, "cases")[0]).toHaveProperty("case_id");
    expect(getArray(data.canon, "characters")[0]).toHaveProperty("name_romanized");
    expect(getArray(data.relationships, "relationships")[0]).toHaveProperty("relationship_type");
    expect(getArray(data.timeline, "events")[0]).toHaveProperty("day");
    expect(getArray(data.simulations, "simulations")[0]).toHaveProperty("candidates");
    expect(getArray(data.worldRules, "rules")[0]).toHaveProperty("category");
  });

  it("ships copy for the four launch languages", () => {
    for (const locale of ["en", "ko", "ja", "zh-hans"] as const) {
      const copy = getSaebyeokDemoCopy(locale);
      expect(copy.label).toBeTruthy();
      expect(copy.title).toBeTruthy();
      expect(copy.screens).toHaveLength(7);
    }
  });

  it("renders the localized demo page component", async () => {
    const element = await DemoPage({ params: Promise.resolve({ locale: "en" }) });

    expect(element).toHaveProperty("props.locale", "en");
    expect(element).toHaveProperty("props.data.summary.characters", 8);
  });

  it("passes the KNOT separation guard on Phase C surfaces", () => {
    const output = execFileSync("node", [
      "scripts/verify-knot-separation.ts",
      "--paths",
      "docs/marketing,src/app/[locale]/demo,public",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(output).toContain("0 matches");
  });

  it("fails the KNOT separation guard when a forbidden standalone term is present", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "seizn-knot-guard-"));
    writeFileSync(path.join(dir, "leak.md"), "KNOT should never be exposed here", "utf8");

    try {
      expect(() => {
        execFileSync("node", ["scripts/verify-knot-separation.ts", "--paths", dir], {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe",
        });
      }).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
