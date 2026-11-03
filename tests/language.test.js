import { describe, expect, it } from "vitest";
import { HINGLISH_HINT, chooseLanguage, decodingFor, dominantLanguage } from "../src/domain/transcription/language.js";

describe("chooseLanguage", () => {
  it("takes the guess for a window it can judge", () => {
    expect(chooseLanguage({ language: "en", confidence: 0.9 }, "hi", 6)).toBe("en");
    expect(chooseLanguage({ language: "hi", confidence: 0.5 }, undefined, 6)).toBe("hi");
  });

  it("keeps the language before when the window is under two seconds or the guess is a toss-up", () => {
    expect(chooseLanguage({ language: "en", confidence: 0.99 }, "hi", 1.2)).toBe("hi");
    expect(chooseLanguage({ language: "en", confidence: 0.3 }, "hi", 8)).toBe("hi");
  });

  it("still uses a weak or short guess when nothing came before", () => {
    expect(chooseLanguage({ language: "en", confidence: 0.2 }, undefined, 1)).toBe("en");
  });

  it("has nothing to say when the model cannot detect and nothing came before", () => {
    expect(chooseLanguage(undefined, undefined, 5)).toBeUndefined();
    expect(chooseLanguage(undefined, "hi", 5)).toBe("hi");
  });
});

describe("dominantLanguage", () => {
  it("is the language with the most speech", () => {
    expect(
      dominantLanguage(
        new Map([
          ["hi", 30],
          ["en", 45],
        ]),
      ),
    ).toBe("en");
    expect(dominantLanguage(new Map())).toBeUndefined();
  });
});

describe("decodingFor", () => {
  it("writes Hindi and Urdu as Hinglish, with the hint, tagged Hindi so English words in the same sentence stay", () => {
    expect(decodingFor("hi")).toEqual({ language: "hi", hint: HINGLISH_HINT });
    expect(decodingFor("ur")).toEqual({ language: "hi", hint: HINGLISH_HINT });
  });

  it("passes every other language through with no hint", () => {
    expect(decodingFor("en")).toEqual({ language: "en" });
    expect(decodingFor("es")).toEqual({ language: "es" });
    expect(decodingFor(undefined)).toEqual({ language: undefined });
  });

  it("keeps the hint short, because a long one gets copied into the transcript", () => {
    expect(HINGLISH_HINT.length).toBeLessThan(80);
  });
});
