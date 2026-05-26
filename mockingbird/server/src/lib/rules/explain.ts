import type { RuleAst } from "./parser";

export function explainRule(ast: RuleAst): string {
  switch (ast.type) {
    case "and": return `${explainRule(ast.left)} and ${explainRule(ast.right)}`;
    case "or": return `${explainRule(ast.left)} or ${explainRule(ast.right)}`;
    case "not": return `not (${explainRule(ast.expr)})`;
    case "cmp": {
      const value = Array.isArray(ast.value) ? ast.value.join(", ") : ast.op === "~/" ? ast.value.values.join("|") : String(ast.value);
      if (ast.op === "~/") return `${ast.field} matches ${value}`;
      if (ast.op === "in") return `${ast.field} is one of ${value}`;
      return `${ast.field} ${ast.op} ${value}`;
    }
  }
}
