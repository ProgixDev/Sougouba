// Lists text a reader would see that is still written directly in a source
// file instead of going through `t()` (lib/i18n).
//
//   node scripts/i18n-scan.mjs                 → every file under app/, components/, lib/
//   node scripts/i18n-scan.mjs app/login       → only what is under the given paths
//   node scripts/i18n-scan.mjs --count         → one line per file, with a count
//
// It also reports what would keep its old language after a switch — the language
// changes in place, with no reload (lib/i18n):
//   · a table of labels built when a file loads and not wrapped in `lazy(() => …)`;
//   · the language read at the top level of a file (`intlLocale`, `locale`);
//   · a component that does not call `useLocale()`, and so does not render again.
//
// It reads the syntax tree, so comments, imports, class names, object keys and
// the dictionaries themselves are never reported. What it reports is a
// candidate, not a verdict: a string with a space, an accent or a capital in a
// place where text is shown. A line that is rightly not translated carries
// `i18n-ignore` (on it or on the line above) and says why. Exit code 1 when
// anything is found.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const args = process.argv.slice(2);
const countOnly = args.includes('--count');
const targets = args.filter((a) => !a.startsWith('--'));
const roots = targets.length > 0 ? targets : ['app', 'components', 'lib'];

const SKIP_DIRS = new Set(['node_modules', '.next', 'i18n']);
/** Files whose strings are data or developer text, not interface. */
const SKIP_FILES = [/lib\/api\/seed\.ts$/, /lib\/types\.ts$/, /\.d\.ts$/];

function files(path) {
  const stat = statSync(path);
  if (stat.isFile()) return /\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => (SKIP_DIRS.has(name) ? [] : files(join(path, name))));
}

/** Attributes whose value is never read by a person. */
const SILENT_ATTRS = new Set([
  'className', 'href', 'src', 'key', 'id', 'htmlFor', 'type', 'name', 'role', 'variant', 'tone', 'size', 'as', 'rel', 'target',
  'autoComplete', 'inputMode', 'method', 'dataKey', 'stroke', 'fill', 'd', 'viewBox', 'strokeLinecap', 'strokeLinejoin',
  'align', 'side', 'dir', 'lang', 'accept', 'pattern', 'tint', 'icon', 'value', 'defaultValue', 'aria-current', 'aria-live',
  'aria-haspopup', 'media', 'color', 'crossOrigin', 'loading', 'decoding', 'step', 'min', 'max', 'autoCapitalize', 'enterKeyHint',
]);
/** Calls whose arguments are not interface text. */
const SILENT_CALLS = /^(cn|t|translate|tx|tMaybe|pick|clsx|require|import|fetch|apiGet|apiPost|apiPatch|apiPut|apiDelete|merchantApiGet|merchantApiPost|merchantApiPatch|merchantApiPut|merchantApiDelete|request|push|replace|includes|startsWith|endsWith|split|join|getItem|setItem|removeItem|matchMedia|querySelector|addEventListener|removeEventListener|toLocaleString|format|test|exec|match|slice|indexOf|has|get|set|append|toggle|add|remove|contains|createElement|log|warn|error|info|debug|usePagedList|useDebounced|localeCompare|padStart|padEnd|select|from|eq|order|rpc|signInWithOtp|verifyOtp|encodeURIComponent)$/;

/** A Tailwind class list, a colour, a path, a file name: letters, but not words. */
function machineText(s) {
  if (/^#[0-9A-Fa-f]{3,8}$/.test(s)) return true;
  if (!/\s/.test(s) && /[/…]/.test(s) && !/[àâçéèêëîïôùûü’]/.test(s)) return true; // `/admin/orders/…`, `…-….csv`
  if (/(^|\s)(flex|grid|block|inline|hidden|absolute|relative|fixed|text-|bg-|px-|py-|p-|m-|mt-|mb-|gap-|rounded|border|font-|items-|justify-|shadow|hover:|sm:|md:|lg:|h-\d|w-\d|min-|max-|cursor-|transition|opacity-|overflow-)/.test(s) && !/[àâçéèêëîïôùûü’.!?]/.test(s)) return true;
  if (/^\(function\(\)/.test(s)) return true; // the inline scripts in the root layout
  return false;
}

/** Calls whose result depends on the language in force. */
const LANGUAGE_CALLS = /^(t|translate|tx|tMaybe|pick|formatCad|formatNumber|formatPercent|formatDate|formatDateTime|formatCompact|timeAgo|\w+StatusMeta|statementMonth|formatHours|shortDay)$/;

/** Does this look like something written for a person? */
function readable(text) {
  const s = text.trim();
  if (s.length < 2) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return false;
  if (machineText(s)) return false;
  // A lone lower-case token, a path, a class list, a colour, a key: not prose.
  if (/^[a-z0-9_\-:./#%[\]()=,*+@&?!|~<>^$\s'"`{}\\]+$/.test(s) && !/[àâçéèêëîïôùûü’]/.test(s)) return false;
  if (/^[A-Z0-9_]+$/.test(s)) return false; // CONSTANT
  if (/^[a-zA-Z]+[A-Z][a-zA-Z]*$/.test(s) && !s.includes(' ')) return false; // camelCase
  return true;
}

function calleeName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return '';
}

function silent(node) {
  for (let p = node.parent, child = node; p; child = p, p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
    if (ts.isJsxAttribute(p)) return SILENT_ATTRS.has(p.name.getText()) || p.name.getText().startsWith('data-');
    if (ts.isCallExpression(p) && p.arguments.includes(child)) return SILENT_CALLS.test(calleeName(p.expression));
    if (ts.isNewExpression(p)) return /^(Error|RegExp|URL|Intl|Date|Set|Map)/.test(p.expression.getText());
    if (ts.isThrowStatement(p)) return true;
    if (ts.isPropertyAssignment(p) && p.name === child) return true; // an object key
    if (ts.isPropertyAssignment(p) && p.initializer === child && /^(className|key|href|icon|tone|tint|variant|type|id|value|sort|dir|method|path|kind|status|permission|prefix|color|stroke|fill)$/.test(p.name.getText())) return true;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === child) return true;
    if (ts.isCaseClause(p) && p.expression === child) return true;
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText())) return true;
    if (ts.isExpressionStatement(p) || ts.isBlock(p) || ts.isSourceFile(p)) break;
  }
  return false;
}

let total = 0;
for (const file of roots.flatMap((r) => files(join(root, r)))) {
  const rel = relative(root, file);
  if (SKIP_FILES.some((re) => re.test(rel))) continue;
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // 'use client' and friends.
  const directives = new Set(source.statements.filter((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression)).map((s) => s.expression));
  const found = [];
  const lines = source.text.split('\n');
  const report = (node, text) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    // `i18n-ignore` on the line, or the one above, with the reason written beside it.
    if (/i18n-ignore/.test(lines[line] ?? '') || /i18n-ignore/.test(lines[line - 1] ?? '')) return;
    found.push(`${rel}:${line + 1}: ${text.trim().replace(/\s+/g, ' ').slice(0, 110)}`);
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      // Text between tags is always shown: two letters in a row are enough to be a word (« sur », "of").
      if (/[A-Za-zÀ-ÿ]{2,}/.test(node.text) && !/^\s*&[a-z]+;\s*$/.test(node.text)) report(node, node.text);
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !directives.has(node)) {
      // A locale fixed in the code formats every reader's numbers and dates the French way.
      if (node.text === 'fr-CA' || node.text === 'en-CA') report(node, `${node.text} — use intlLocale / lib/format`);
      else if (readable(node.text) && !silent(node)) report(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('…');
      if (readable(text) && !silent(node)) report(node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  // ── what would not follow a switch of language ─────────────────────────────
  const isFunction = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n);
  const usesLanguage = (node) => {
    let hit = null;
    const walk = (n) => {
      if (hit || isFunction(n)) return; // inside a function it runs later, in the language of that moment
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && LANGUAGE_CALLS.test(n.expression.text)) hit = `${n.expression.text}()`;
      else if (ts.isIdentifier(n) && (n.text === 'intlLocale' || n.text === 'locale') && !ts.isPropertyAssignment(n.parent) && !ts.isPropertyAccessExpression(n.parent)) hit = n.text;
      ts.forEachChild(n, walk);
    };
    walk(node);
    return hit;
  };
  const isClient = source.statements.some((st) => ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && st.expression.text === 'use client');
  const hasJsx = (node) => {
    let jsx = false;
    const walk = (n) => {
      if (jsx) return;
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) jsx = true;
      else ts.forEachChild(n, walk);
    };
    walk(node);
    return jsx;
  };
  const subscribes = (node) => {
    let yes = false;
    const walk = (n) => {
      if (yes) return;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useLocale') yes = true;
      else ts.forEachChild(n, walk);
    };
    walk(node);
    return yes;
  };
  const component = (fn, name, at) => {
    if (!isClient || !/^[A-Z]/.test(name) || !fn.body || !hasJsx(fn.body) || subscribes(fn.body)) return;
    report(at, `${name}: a component that does not call useLocale() — it would keep its old language after a switch`);
  };
  if (!/lib\/i18n\//.test(rel) && rel !== 'app/layout.tsx') {
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement)) component(statement, statement.name?.text ?? 'Default', statement);
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        let init = declaration.initializer;
        if (!init) continue;
        const name = declaration.name.getText();
        if (ts.isCallExpression(init) && /^(forwardRef|memo|React\.forwardRef|React\.memo)$/.test(init.expression.getText()) && init.arguments[0]) init = init.arguments[0];
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          component(init, name, declaration);
          continue;
        }
        if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'lazy') continue;
        const hit = usesLanguage(init);
        if (hit) report(declaration, `${name}: built once when the file loads, from ${hit} — wrap it in lazy(() => …) or build it where it is used`);
      }
    }
  }

  if (found.length === 0) continue;
  total += found.length;
  console.log(countOnly ? `${String(found.length).padStart(4)} ${rel}` : found.join('\n'));
}
console.log(`\n${total} candidate string(s).`);
process.exit(total > 0 ? 1 : 0);
