// Interactive package scaffolding; uses only Node's standard library.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { ROOT } from './packages.mjs';

const template = join(ROOT, '_template');
const read = (path) => readFileSync(join(template, path), 'utf8');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function ask(rl, question, validate) {
  while (true) {
    stdout.write(question);
    const answer = await rl.next();
    if (answer.done) throw new Error('Input ended before all questions were answered.');
    const value = answer.value.trim();
    const error = validate(value);
    if (!error) return value;
    stdout.write(`${error}\n`);
  }
}

function sources(name, type, frontend) {
  const kind = `${name}.text`;
  const tag = `soup-${name.replaceAll('_', '-')}-text`;
  let body;
  let imports;
  let register;
  if (type === 'importer') {
    const source = read('server/text.py');
    body = source.slice(source.indexOf('KIND ='), source.indexOf('\n\nclass TextVisualizer'));
    body = body.replace(/\n\ndef _stats[\s\S]*?(?=\n\ndef _max_lines)/, '');
    imports = 'Field, Importer, Inspection, ObjectRef, ToolAccess, Upload, report';
    register = 'ctx.add_importer(TextImporter())';
  } else if (type === 'tool') {
    imports = 'Tool';
    body = `class PackageTool(Tool):\n    name = "${name}"\n\n    def health(self) -> dict[str, Any]:\n        return {"ok": True}\n`;
    register = 'ctx.add_tool(PackageTool())';
  } else if (type === 'operation') {
    imports = 'ObjectDraft, ObjectRef, Operation, OperationInput, ToolAccess, report';
    body = `class PackageOperation(Operation):\n    id = "summary"\n    label = "Object summary"\n    inputs = (OperationInput("source", (report.REPORT,)),)\n    produces = (report.REPORT,)\n\n    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:\n        source = inputs["source"]\n        return [report.report(f"{source.name} summary", [report.keyvalue({"name": source.name, "kind": source.kind})])]\n`;
    register = 'ctx.add_operation(PackageOperation())';
  } else if (type === 'exporter') {
    imports = 'Exporter, ObjectRef, ToolAccess, report';
    body = `class PackageExporter(Exporter):\n    id = "json"\n    label = "Report JSON"\n    accepts = (report.REPORT,)\n    extension = ".json"\n    mime = "application/json"\n\n    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> bytes:\n        return json.dumps(dict(obj.meta), ensure_ascii=False).encode("utf-8")\n`;
    register = 'ctx.add_exporter(PackageExporter())';
  } else {
    imports = 'ObjectRef, ToolAccess, Visualizer, report';
    body = '';
    register = '';
  }
  // A frontend on a non-visualizer contribution supplies a companion visualizer.
  if (frontend || type === 'visualizer') {
    if (!imports.includes('Visualizer')) imports += ', Visualizer';
    if (!imports.includes('ObjectRef')) imports += ', ObjectRef';
    if (!imports.includes('ToolAccess')) imports += ', ToolAccess';
    if (!imports.includes('report')) imports += ', report';
    body += `\n\nclass PackageVisualizer(Visualizer):\n    id = "view"\n    label = "${name} view"\n    accepts = (${type === 'importer' ? JSON.stringify(kind) : 'report.REPORT'},)\n    element = "${frontend ? tag : 'soup-report-view'}"\n\n    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:\n        return ${frontend ? '{"name": obj.name, "meta": dict(obj.meta)}' : '{"blocks": list(obj.meta.get("blocks") or [])}'}\n`;
    register += `${register ? '\n        ' : ''}ctx.add_visualizer(PackageVisualizer())`;
  }
  body = body.replaceAll('template.text', kind).replaceAll('Text file (template)', `${name} text file`);
  imports = imports.split(', ').sort().join(', ');
  body = body.trimStart();
  const header = `from __future__ import annotations\n\n${type === 'exporter' ? 'import json\n' : ''}${type !== 'tool' || frontend ? 'from collections.abc import Mapping\n' : ''}from typing import Any\n\nfrom soup.core.contracts import ${imports}\n\n`;
  return { backend: header + (body.startsWith('class ') ? '\n' : '') + body, register, tag };
}

async function main() {
  const interface_ = createInterface({ input: stdin, output: stdout });
  const rl = interface_[Symbol.asyncIterator]();
  try {
    stdout.write('SOUP Studio package scaffolder\n');
    const name = await ask(rl, 'Package name (lowercase_with_underscores): ', (value) =>
      value.length > 128 || !/^[a-z][a-z0-9_]*$/.test(value) ? 'Use at most 128 characters: a lowercase letter followed by lowercase letters, digits or underscores.' :
        existsSync(join(ROOT, value)) ? 'That package or directory already exists.' : null);
    const description = await ask(rl, 'Description: ', (value) => !value || /[\x00-\x1f\x7f]/.test(value) ? 'Enter a nonempty single-line description.' : null);
    const type = (await ask(rl, 'Contribution (Tool/Operation/Importer/Visualizer/Exporter): ', (value) =>
      !['tool', 'operation', 'importer', 'visualizer', 'exporter'].includes(value.toLowerCase()) ? 'Choose one of the listed contribution types.' : null)).toLowerCase();
    const database = (await ask(rl, 'Database support (Neo4j/Memgraph/both): ', (value) =>
      !['neo4j', 'memgraph', 'both'].includes(value.toLowerCase()) ? 'Choose Neo4j, Memgraph or both.' : null)).toLowerCase();
    const frontend = (await ask(rl, 'Frontend (yes/no; adds a companion visualizer when needed): ', (value) =>
      !['yes', 'no'].includes(value.toLowerCase()) ? 'Enter yes or no.' : null)).toLowerCase() === 'yes';
    const manifest = JSON.parse(read('soup-package.json'));
    Object.assign(manifest, { name, label: name, description, databases: database === 'both' ? ['memgraph', 'neo4j'] : [database] });
    manifest.provides_tools = type === 'tool' ? [name] : [];
    manifest.requires = type === 'visualizer' && !frontend ? ['soup_base'] : [];
    if (!frontend) delete manifest.app;
    const { backend, register, tag } = sources(name, type, frontend);
    const files = {
      'soup-package.json': json(manifest),
      'server/__init__.py': read('server/__init__.py'),
      'server/contribution.py': backend,
      'server/plugin.py': `from soup.core.contracts import PluginContext, SoupPlugin\n\nfrom . import contribution\n\n\nclass Plugin(SoupPlugin):\n    def register(self, ctx: PluginContext) -> None:\n        ${register.replaceAll(/\((\w+)\(\)\)/g, '(contribution.$1())')}\n`,
      'README.md': `# ${name}\n\n${description}\n\nGenerated ${type} package. ${frontend && type !== 'visualizer' ? 'Includes a companion visualizer. ' : ''}${type !== 'importer' && type !== 'tool' ? 'Accepts report objects. ' : ''}\n\nSee [package development](../docs/package-development.md).\n\n${frontend ? `Run \`npm install\` in \`soup-packages/\` to refresh workspace links and the lockfile, then \`npm run build:packages -- ${name}\`.\n\n` : ''}Package with \`npm run pack -- ${name}\`.\n`
    };
    if (frontend) {
      const app = JSON.parse(read('app/package.json'));
      Object.assign(app, { name: `soup-pkg-${name}-app`, description });
      files['app/package.json'] = json(app);
      files['app/tsconfig.json'] = read('app/tsconfig.json');
      files['app/src/index.ts'] = `import { defineSoupElement, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';\n\ninterface ViewData { name: string; meta: Record<string, unknown>; }\n\nclass PackageView extends HTMLElement implements SoupVisualizerElement<ViewData> {\n  public data: ViewData = { name: '', meta: {} };\n  public context!: VisualizerContext;\n\n  public connectedCallback(): void {\n    const heading = document.createElement('h3');\n    heading.textContent = this.data.name;\n    const content = document.createElement('pre');\n    content.style.overflow = 'auto';\n    content.textContent = JSON.stringify(this.data.meta, null, 2);\n    this.replaceChildren(heading, content);\n  }\n}\n\ndefineSoupElement('${tag}', PackageView);\n`;
    }
    const destination = join(ROOT, name);
    mkdirSync(destination); // Exclusive: never overwrite, including a race after the prompt.
    for (const [relative, content] of Object.entries(files)) {
      const path = join(destination, relative);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, content, { flag: 'wx' });
    }
    stdout.write(`Created ${name}. ${frontend ? 'The existing */app workspace pattern includes its frontend; run npm install to update workspace links and the lockfile. ' : ''}See ${name}/README.md.\n`);
  } finally {
    interface_.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`Package creation failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
