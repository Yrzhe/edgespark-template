import type { VisitorPromptSafe } from "../signals/types";
import type { RuleAst, RuleField } from "./parser";

export function evaluateRule(ast: RuleAst, visitor: VisitorPromptSafe): boolean {
  switch (ast.type) {
    case "and": return evaluateRule(ast.left, visitor) && evaluateRule(ast.right, visitor);
    case "or": return evaluateRule(ast.left, visitor) || evaluateRule(ast.right, visitor);
    case "not": return !evaluateRule(ast.expr, visitor);
    case "cmp": {
      const actual = fieldValue(ast.field, visitor);
      if (ast.op === "in") return ast.value.includes(String(actual ?? ""));
      if (ast.op === "~/") return ast.value.values.includes(String(actual ?? "").toLowerCase());
      if (ast.op === "==") return actual === ast.value;
      return actual !== ast.value;
    }
  }
}

function fieldValue(field: RuleField, v: VisitorPromptSafe): string | boolean | null {
  switch (field) {
    case "country": return v.country;
    case "lang": return v.langRoot;
    case "device": return v.device;
    case "referrer": return v.referrerRoot;
    case "hour_band": return v.hourBand;
    case "is_returning": return v.isReturning;
    case "is_weekend": return v.isWeekend;
    case "from": return v.urlSource;
  }
}
