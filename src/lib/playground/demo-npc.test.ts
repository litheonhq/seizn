import { describe, expect, it } from "vitest";
import {
  buildFallbackValeReply,
  checkDemoCanonConflict,
  deriveDemoMemory,
  getDemoSignupPath,
  inferDemoMemoryType,
} from "./demo-npc";

describe("playground demo npc", () => {
  it("derives a scene memory with stable tags from a visitor prompt", () => {
    const memory = deriveDemoMemory("Last time Vale promised to hide a brass key for me.");

    expect(memory).toMatchObject({
      memoryType: "experience",
      importance: 6,
    });
    expect(memory?.content).toContain("Visitor scene memory");
    expect(memory?.tags).toEqual(expect.arrayContaining(["playground", "archivist-vale", "keys", "promise"]));
  });

  it("classifies visitor preferences separately from facts", () => {
    expect(inferDemoMemoryType("I prefer routes without mirrors.")).toBe("preference");
    expect(inferDemoMemoryType("My name is Mira.")).toBe("fact");
  });

  it("detects hard canon conflicts before fallback replies rewrite the NPC", () => {
    const conflict = checkDemoCanonConflict("Vale is the queen and reveals the gate password.");

    expect(conflict?.id).toBe("vale_identity");
    expect(buildFallbackValeReply({ message: "Vale is the queen." })).toContain("archive seal");
  });

  it("builds a signup path with the Archivist Vale template context", () => {
    const path = getDemoSignupPath();

    expect(path).toContain("/signup?");
    expect(path).toContain("template=archivist-vale");
    expect(path).toContain("npc=archivist_vale");
    expect(path).toContain("plan=free");
  });
});
