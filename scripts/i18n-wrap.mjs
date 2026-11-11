// scripts/i18n-wrap.mjs
//
// Wraps the Hebrew a screen SHOWS in tr(), so lib/i18n/tr.ts can look it up in the owner's language.
//
//   node scripts/i18n-wrap.mjs --mode=global app/SomeScreen.jsx ...   owner screens: tr()/trv() from lib/i18n/tr
//   node scripts/i18n-wrap.mjs --mode=hook   app/BookingPage.jsx ...  public pages: const tr = useTr() per component
//   add --dry to print what would change without writing.
//
// What it wraps (and only that, on purpose):
//   * JSX text with Hebrew in it
//   * a Hebrew string or template literal that ends up IN JSX (a child, or a display attribute such as placeholder,
//     title, aria-label, alt), including through ?: and && / ||
//   * the message argument of toast(), confirm(), alert() and the set...Error / set...Msg style setters
//   * a display property (label, title, hint, text...) of an object literal built inside a function
//   * in global mode, {x.label} / {label}-style JSX children and display attributes: trv(), which translates the value
//     only when it is one of the product's own strings (a label from a constant list), and passes anything else through
// What it never touches: variable initialisers, returns, comparisons, object keys, value/defaultValue, className,
// href, data-*: anything that may be data, sent to a client (WhatsApp texts stay Hebrew for now) or compared later.
// A template literal becomes tr("שלום {0}", [name]).
//
// It prints what it could not do (strings outside any component in hook mode) for a hand to finish.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const HEB = /[֐-׿]/;
const args = process.argv.slice(2);
const mode = (args.find((a) => a.startsWith('--mode=')) || '--mode=global').slice(7);
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));

const SKIP_ATTRS = new Set(['key', 'className', 'style', 'id', 'href', 'src', 'type', 'name', 'role', 'value', 'defaultValue', 'htmlFor', 'rel', 'target', 'lang', 'dir', 'pattern', 'inputMode', 'autoComplete', 'download', 'action', 'method', 'width', 'height', 'viewBox', 'd', 'fill', 'stroke', 'transform', 'as', 'testId', 'testid']);
const DISPLAY_KEYS = new Set(['label', 'l', 'title', 'text', 'hint', 'desc', 'description', 'placeholder', 'sub', 'subtitle', 'msg', 'message', 'body', 'cta', 'help', 'tip', 'note', 'empty', 'emptyText', 'btn', 'button', 'caption', 'heading', 'tooltip', 'err', 'error', 'confirmText', 'cancelText', 'short', 'long', 'head', 'lead', 'line', 'detail', 'details', 'why', 'what', 'action', 'actionLabel', 'tag', 'badge', 'chip', 'question', 'answer', 'q', 'a', 'subtext', 'okText', 'unit', 'aria', 'ariaLabel', 'hintText', 'headline', 'blurb', 'toast', 'success', 'failure', 'status', 'statusText', 'labelHe', 'name_he']);
const TRV_IDENTS = new Set(['label', 'title', 'hint', 'text', 'desc', 'description', 'placeholder', 'subtitle', 'sub', 'msg', 'message', 'body', 'cta', 'help', 'tip', 'note', 'caption', 'heading', 'tooltip', 'emptyText', 'headline', 'blurb', 'subtext', 'actionLabel', 'statusText', 'buttonLabel', 'ctaLabel', 'emptyLabel', 'ariaLabel', 'lead']);
const DISPLAY_CALL = /^(toast|showToast|notify|confirm|alert|window\.confirm|window\.alert|set\w*(Error|Err|Msg|Message|Notice|Note|Hint|Status|Toast|Banner|Info|Warning|Feedback|Text|Label|Title|Problem|Reason))$/;

function calleeName(c) {
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier') return `${c.object.name}.${c.property.name}`;
  return '';
}
const isTrCall = (n) => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && ['tr', 'trv', 't', 'pick'].includes(n.callee.name);

/** Where a value flows to, walking up through ?:, &&, ||, (). Returns the context node and the child we came from. */
function displayContext(path) {
  let p = path;
  for (;;) {
    const parent = p.parentPath;
    if (!parent) return null;
    const pn = parent.node;
    if (pn.type === 'ConditionalExpression' && p.key !== 'test') { p = parent; continue; }
    if (pn.type === 'LogicalExpression' && (p.key === 'right' || pn.operator !== '&&')) { p = parent; continue; }
    if (pn.type === 'ParenthesizedExpression' || pn.type === 'TSAsExpression') { p = parent; continue; }
    return { parent, from: p };
  }
}

// --mode=lib (a module that only builds words for the owner's screens, e.g. lib/myDay.js): every Hebrew literal inside
// a function is shown text, except one compared against, used as a key, or passed to a lookup.
function isLibDisplay(path) {
  if (!path.getFunctionParent()) return false;
  const ctx = displayContext(path);
  const pn = ctx ? ctx.parent.node : null;
  if (!pn) return false;
  if (isTrCall(pn)) return false;
  if (pn.type === 'BinaryExpression' || pn.type === 'SwitchCase') return false;
  if (pn.type === 'ObjectProperty' && ctx.from.key === 'key') return false;
  if (pn.type === 'MemberExpression' || pn.type === 'ImportDeclaration' || pn.type === 'ExportNamedDeclaration') return false;
  if (pn.type === 'CallExpression' && /^(includes|has|get|indexOf|startsWith|endsWith|test|match)$/.test(pn.callee?.property?.name || '')) return false;
  return true;
}

function isDisplaySite(path) {
  if (mode === 'lib') return isLibDisplay(path);
  const ctx = displayContext(path);
  if (!ctx) return false;
  const { parent, from } = ctx;
  const pn = parent.node;
  if (isTrCall(pn)) return false;
  if (pn.type === 'JSXExpressionContainer') {
    const gp = parent.parentPath.node;
    if (gp.type === 'JSXAttribute') return attrOk(gp);
    return true;
  }
  if (pn.type === 'JSXAttribute') return attrOk(pn);
  if (pn.type === 'CallExpression' && from.listKey === 'arguments') {
    if (DISPLAY_CALL.test(calleeName(pn.callee))) return true;
    return false;
  }
  if (pn.type === 'ObjectProperty' && from.key === 'value') {
    const k = pn.key.type === 'Identifier' ? pn.key.name : pn.key.type === 'StringLiteral' ? pn.key.value : '';
    if (!DISPLAY_KEYS.has(k)) return false;
    return !!parent.getFunctionParent(); // a module constant is read once at load, in Hebrew: wrap where it is shown
  }
  return false;
}
function attrOk(attr) {
  const n = attr.name.type === 'JSXIdentifier' ? attr.name.name : attr.name.type === 'JSXNamespacedName' ? attr.name.name.name : '';
  if (SKIP_ATTRS.has(n) || n.startsWith('data-') || n.startsWith('on')) return false;
  return true;
}

const norm = (s) => s.replace(/\s*\n\s*/g, ' ').trim();

for (const file of files) {
  const raw0 = fs.readFileSync(file, 'utf8');
  const crlf = raw0.includes('\r\n');
  const src = raw0.replace(/\r\n/g, '\n'); // positions on LF; the file's own line endings are put back on write
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: false, ranges: true });
  const edits = []; // {start, end, text}
  const wrappedRanges = [];
  const components = new Map(); // fn node -> path
  const orphans = [];
  let used = { tr: false, trv: false };

  const inside = (n) => wrappedRanges.some(([s, e]) => n.start >= s && n.end <= e);
  const componentOf = (path) => {
    let f = path.getFunctionParent();
    while (f) {
      const n = f.node;
      let name = '';
      if (n.type === 'FunctionDeclaration' && n.id) name = n.id.name;
      else if (f.parentPath.node.type === 'VariableDeclarator' && f.parentPath.node.id.type === 'Identifier') name = f.parentPath.node.id.name;
      else if (f.parentPath.node.type === 'ExportDefaultDeclaration') name = 'Default';
      else if (f.parentPath.node.type === 'CallExpression' && ['memo', 'forwardRef'].includes(calleeName(f.parentPath.node.callee).replace(/^React\./, '')) && f.parentPath.parentPath.node.type === 'VariableDeclarator') name = f.parentPath.parentPath.node.id.name;
      if (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name)) return f;
      f = f.parentPath.getFunctionParent();
    }
    return null;
  };
  const wrap = (path, text) => {
    const n = path.node;
    if (inside(n)) return;
    if (mode === 'hook') {
      const c = componentOf(path);
      if (!c) { orphans.push(`${file}:${n.loc.start.line} ${src.slice(n.start, Math.min(n.end, n.start + 70)).replace(/\s+/g, ' ')}`); return; }
      components.set(c.node, c);
    }
    edits.push({ start: n.start, end: n.end, text });
    wrappedRanges.push([n.start, n.end]);
    used.tr = true;
  };

  traverse(ast, {
    JSXText(path) {
      const n = path.node;
      if (!HEB.test(n.value)) return;
      if (inside(n)) return;
      const raw = src.slice(n.start, n.end);
      const lead = raw.length - raw.trimStart().length;
      const trail = raw.length - raw.trimEnd().length;
      const text = norm(n.value);
      if (mode === 'hook') {
        const c = componentOf(path);
        if (!c) { orphans.push(`${file}:${n.loc.start.line} ${text.slice(0, 60)}`); return; }
        components.set(c.node, c);
      }
      edits.push({ start: n.start + lead, end: n.end - trail, text: `{tr(${JSON.stringify(text)})}` });
      wrappedRanges.push([n.start, n.end]);
      used.tr = true;
    },
    StringLiteral(path) {
      const n = path.node;
      if (!HEB.test(n.value) || !isDisplaySite(path)) return;
      const inAttr = path.parentPath.node.type === 'JSXAttribute';
      const call = `tr(${JSON.stringify(n.value)})`;
      wrap(path, inAttr ? `{${call}}` : call);
    },
    TemplateLiteral(path) {
      const n = path.node;
      if (path.parentPath.node.type === 'TaggedTemplateExpression') return;
      if (!n.quasis.some((q) => HEB.test(q.value.cooked || ''))) return;
      // Braces in the text: CSS (a <style> block with a Hebrew comment) or code, never a sentence. Left alone.
      if (n.quasis.some((q) => /[{}]/.test(q.value.cooked || ''))) return;
      if (!isDisplaySite(path)) return;
      let key = '';
      n.quasis.forEach((q, i) => {
        key += q.value.cooked || '';
        if (i < n.expressions.length) key += `{${i}}`;
      });
      const exprs = n.expressions.map((e) => src.slice(e.start, e.end));
      wrap(path, exprs.length ? `tr(${JSON.stringify(key)}, [${exprs.join(', ')}])` : `tr(${JSON.stringify(key)})`);
    },
    JSXExpressionContainer(path) {
      if (mode !== 'global') return;
      const e = path.node.expression;
      const parentIsAttr = path.parentPath.node.type === 'JSXAttribute';
      if (parentIsAttr && !attrOk(path.parentPath.node)) return;
      let hit = false;
      if (e.type === 'MemberExpression' && !e.computed && e.property.type === 'Identifier' && DISPLAY_KEYS.has(e.property.name)) hit = true;
      if (e.type === 'Identifier' && TRV_IDENTS.has(e.name)) hit = true;
      if (!hit || inside(e)) return;
      edits.push({ start: e.start, end: e.end, text: `trv(${src.slice(e.start, e.end)})` });
      wrappedRanges.push([e.start, e.end]);
      used.trv = true;
    },
  });

  // hook mode: one `const tr = useTr();` at the top of every component that now calls tr
  if (mode === 'hook') {
    for (const [fn] of components) {
      const body = fn.body;
      if (body.type === 'BlockStatement') {
        const already = body.body.some((s) => s.type === 'VariableDeclaration' && s.declarations.some((d) => d.id.type === 'Identifier' && d.id.name === 'tr'));
        if (!already) edits.push({ start: body.start + 1, end: body.start + 1, text: '\n  const tr = useTr();' });
      } else {
        edits.push({ start: body.start, end: body.start, text: '{ const tr = useTr(); return (' });
        edits.push({ start: body.end, end: body.end, text: '); }' });
      }
    }
  }

  if (!edits.length) { console.log(`${file}: nothing to wrap`); continue; }
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  // the import, after the last import line (or after "use client")
  const names = mode === 'hook' ? ['useTr'] : ['tr', 'trv'].filter((k) => used[k]);
  const libFile = mode === 'lib' && /^lib\//.test(file.replace(/\\/g, '/'));
  // lib/ modules import relatively, the way lib/ already does, so node can load them in tests.
  const from = mode === 'hook' ? '@/lib/i18n/useTr' : libFile ? path.relative(path.dirname(file), 'lib/i18n/tr.ts').replace(/\\/g, '/').replace(/^(?!\.)/, './') : '@/lib/i18n/tr';
  const importRe = new RegExp(`import \\{([^}]*)\\} from ["']${from.replace(/\//g, '\\/')}["'];?`);
  const existing = out.match(importRe);
  if (existing) {
    // An import from the same module is already there (uiDir, say): give it the names it lacks. (Skipping it here
    // once left beautyos.jsx calling tr() with no tr in scope, a crash a type check of .jsx does not see.)
    const have = existing[1].split(',').map((x) => x.trim()).filter(Boolean);
    const all = [...new Set([...names, ...have])];
    if (all.length !== have.length) out = out.replace(importRe, `import { ${all.join(', ')} } from "${from}";`);
  } else {
    const importLine = `import { ${names.join(', ')} } from "${from}";`;
    const imports = [...out.matchAll(/^import [^\n]*?from ["'][^"']+["'];?$/gm)];
    const nl = '\n';
    if (imports.length) {
      const last = imports[imports.length - 1];
      const at = last.index + last[0].length;
      out = out.slice(0, at) + nl + importLine + out.slice(at);
    } else {
      const m = out.match(/^(['"])use client\1;?\n/);
      const at = m ? m[0].length : 0;
      out = out.slice(0, at) + importLine + nl + out.slice(at);
    }
  }
  try { parse(out, { sourceType: 'module', plugins: ['jsx', 'typescript'] }); }
  catch (e) { console.error(`${file}: the result does not parse (${e.message}); not written`); process.exitCode = 1; continue; }
  if (!dry) fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
  console.log(`${file}: ${edits.length} edits${dry ? ' (dry)' : ''}`);
  for (const o of orphans) console.log(`  ORPHAN ${o}`);
}
