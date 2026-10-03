import { expect, it } from "vitest";
import { insertAnswerSymbol } from "./math-answer";

it("inserts fractions and decimals at the caret without losing the remaining answer", () => {
  expect(insertAnswerSymbol("12", 1, 1, "fraction")).toEqual({ value: "1/2", cursor: 2 });
  expect(insertAnswerSymbol("05 m", 1, 1, "decimal")).toEqual({ value: "0,5 m", cursor: 2 });
  expect(insertAnswerSymbol("3+2", 1, 2, "negative")).toEqual({ value: "3-2", cursor: 2 });
});

it("wraps a selected expression and leaves the caret inside empty delimiters", () => {
  expect(insertAnswerSymbol("9+16", 0, 4, "root")).toEqual({ value: "sqrt(9+16)", cursor: 9 });
  expect(insertAnswerSymbol("x", 0, 1, "parentheses")).toEqual({ value: "(x)", cursor: 2 });
  expect(insertAnswerSymbol("", 0, 0, "root")).toEqual({ value: "sqrt()", cursor: 5 });
});
