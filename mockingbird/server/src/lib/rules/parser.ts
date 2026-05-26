export type RuleField = "country" | "lang" | "device" | "referrer" | "hour_band" | "is_returning" | "is_weekend" | "from";
export type RuleOp = "==" | "!=" | "~/" | "in";
export type CompiledRegex = { kind: "alternatives"; values: string[] };
export type RuleAst =
  | { type: "and" | "or"; left: RuleAst; right: RuleAst }
  | { type: "not"; expr: RuleAst }
  | { type: "cmp"; field: RuleField; op: "==" | "!="; value: string | boolean }
  | { type: "cmp"; field: RuleField; op: "in"; value: string[] }
  | { type: "cmp"; field: RuleField; op: "~/"; value: CompiledRegex };

type Token = { type: string; value: string };
const FIELDS = new Set(["country", "lang", "device", "referrer", "hour_band", "is_returning", "is_weekend", "from"]);

export function parseRule(input: string): RuleAst {
  if (new TextEncoder().encode(input).byteLength > 1024) throw new Error("Rule is too long.");
  const parser = new Parser(tokenize(input));
  const ast = parser.parseExpression();
  parser.expect("eof");
  if (depth(ast) > 6) throw new Error("Rule nesting is too deep.");
  return ast;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (input.startsWith("~/", i)) {
      let j = i + 2;
      while (j < input.length && input[j] !== "/") j++;
      if (j >= input.length) throw new Error("Unterminated regex.");
      const body = input.slice(i + 2, j);
      validateRegexBody(body);
      tokens.push({ type: "op", value: "~/" });
      tokens.push({ type: "regex", value: body });
      i = j + 1;
      continue;
    }
    if (input.startsWith("==", i) || input.startsWith("!=", i)) {
      tokens.push({ type: "op", value: input.slice(i, i + 2) }); i += 2; continue;
    }
    if ("(),[]".includes(ch)) { tokens.push({ type: ch, value: ch }); i++; continue; }
    if (ch === "/") {
      let j = i + 1;
      while (j < input.length && input[j] !== "/") j++;
      if (j >= input.length) throw new Error("Unterminated regex.");
      const body = input.slice(i + 1, j);
      validateRegexBody(body);
      tokens.push({ type: "regex", value: body }); i = j + 1; continue;
    }
    const m = /^[A-Za-z][A-Za-z0-9_-]*/.exec(input.slice(i));
    if (!m) throw new Error(`Unexpected token near ${input.slice(i, i + 8)}.`);
    const value = m[0];
    const upper = value.toUpperCase();
    tokens.push({ type: ["AND", "OR", "NOT"].includes(upper) ? upper : value === "in" ? "op" : "ident", value });
    i += value.length;
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

function validateRegexBody(body: string): void {
  if (body.length === 0 || body.length > 120) throw new Error("Regex length is invalid.");
  if (/[()[\]{}+*?^$]/.test(body)) throw new Error("Regex may only use simple text and alternation.");
  if (/\(\?[=!<]/.test(body) || /\\[1-9]/.test(body)) throw new Error("Regex lookaround/backreferences are forbidden.");
}

function compileRegexBody(body: string): CompiledRegex {
  validateRegexBody(body);
  const values = body.split("|").map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (values.length === 0) throw new Error("Regex must contain at least one value.");
  return { kind: "alternatives", values };
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}
  parseExpression(): RuleAst { return this.parseOr(); }
  private parseOr(): RuleAst {
    let left = this.parseAnd();
    while (this.match("OR")) left = { type: "or", left, right: this.parseAnd() };
    return left;
  }
  private parseAnd(): RuleAst {
    let left = this.parseNot();
    while (this.match("AND")) left = { type: "and", left, right: this.parseNot() };
    return left;
  }
  private parseNot(): RuleAst {
    if (this.match("NOT")) return { type: "not", expr: this.parsePrimary() };
    return this.parsePrimary();
  }
  private parsePrimary(): RuleAst {
    if (this.match("(")) {
      const expr = this.parseExpression();
      this.expect(")");
      return expr;
    }
    return this.parseComparison();
  }
  private parseComparison(): RuleAst {
    const field = this.consume("ident").value;
    if (!FIELDS.has(field)) throw new Error(`Unsupported field ${field}.`);
    const op = this.consume("op").value as RuleOp;
    if (!["==", "!=", "~/", "in"].includes(op)) throw new Error(`Unsupported operator ${op}.`);
    if (op === "in") {
      this.expect("[");
      const values = [this.consume("ident").value];
      while (this.match(",")) values.push(this.consume("ident").value);
      this.expect("]");
      return { type: "cmp", field: field as RuleField, op, value: values };
    }
    if (op === "~/") return { type: "cmp", field: field as RuleField, op, value: compileRegexBody(this.consume("regex").value) };
    const raw = this.consume("ident").value;
    const value = raw === "true" ? true : raw === "false" ? false : raw;
    return { type: "cmp", field: field as RuleField, op, value };
  }
  private match(type: string): boolean {
    if (this.tokens[this.i]?.type !== type) return false;
    this.i++;
    return true;
  }
  expect(type: string): void { this.consume(type); }
  private consume(type: string): Token {
    const tok = this.tokens[this.i];
    if (!tok || tok.type !== type) throw new Error(`Expected ${type}.`);
    this.i++;
    return tok;
  }
}

function depth(ast: RuleAst): number {
  if (ast.type === "cmp") return 1;
  if (ast.type === "not") return 1 + depth(ast.expr);
  return 1 + Math.max(depth(ast.left), depth(ast.right));
}
