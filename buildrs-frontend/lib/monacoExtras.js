// Extra Monaco language registrations: snippets that make the editor behave
// more like VS Code (HTML boilerplate, common JS/Python patterns). The CDN
// bundle already provides tag/attribute suggestions for HTML/CSS/JSON and
// full TS/JS language services — this only ADDS snippet suggestions.

const SNIPPETS = {
  html: [
    {
      label: 'html5',
      detail: 'HTML5 boilerplate',
      insertText:
        '<!DOCTYPE html>\n<html lang="${1:en}">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${2:Document}</title>\n  <style>\n    ${0}\n  </style>\n</head>\n<body>\n  \n</body>\n</html>',
    },
    {
      label: 'linkcss',
      detail: 'Link stylesheet',
      insertText: '<link rel="stylesheet" href="${1:styles.css}" />',
    },
    {
      label: 'scriptjs',
      detail: 'Script tag',
      insertText: '<script src="${1:app.js}"></script>',
    },
    {
      label: 'div.card',
      detail: 'Card container',
      insertText: '<div class="${1:card}">\n  ${0}\n</div>',
    },
    {
      label: 'a.target',
      detail: 'Link (new tab)',
      insertText: '<a href="${1:https://}" target="_blank" rel="noopener noreferrer">${2:link}</a>',
    },
  ],
  javascript: [
    { label: 'log', detail: 'console.log', insertText: 'console.log(${1:value});' },
    { label: 'logj', detail: 'console.log JSON', insertText: 'console.log(JSON.stringify(${1:value}, null, 2));' },
    { label: 'fn', detail: 'function', insertText: 'function ${1:name}(${2:args}) {\n  ${0}\n}' },
    { label: 'afn', detail: 'arrow function', insertText: 'const ${1:name} = (${2:args}) => {\n  ${0}\n};' },
    { label: 'forof', detail: 'for…of loop', insertText: 'for (const ${1:item} of ${2:items}) {\n  ${0}\n}' },
    { label: 'tryc', detail: 'try/catch', insertText: 'try {\n  ${1}\n} catch (err) {\n  console.error(err);\n}' },
    { label: 'raf', detail: 'requestAnimationFrame', insertText: 'requestAnimationFrame(() => {\n  ${0}\n});' },
  ],
  typescript: [
    { label: 'log', detail: 'console.log', insertText: 'console.log(${1:value});' },
    { label: 'fn', detail: 'function', insertText: 'function ${1:name}(${2:args}): ${3:void} {\n  ${0}\n}' },
    { label: 'afn', detail: 'arrow function', insertText: 'const ${1:name} = (${2:args}): ${3:void} => {\n  ${0}\n};' },
    { label: 'iface', detail: 'interface', insertText: 'interface ${1:Name} {\n  ${0}\n}' },
    { label: 'type', detail: 'type alias', insertText: 'type ${1:Name} = ${0};' },
  ],
  python: [
    { label: 'def', detail: 'function', insertText: 'def ${1:name}(${2:args}):\n    ${0}' },
    { label: 'class', detail: 'class', insertText: 'class ${1:Name}:\n    def __init__(self${2:, args}):\n        ${0}' },
    { label: 'main', detail: 'main guard', insertText: 'if __name__ == "__main__":\n    ${0}' },
    { label: 'for', detail: 'for loop', insertText: 'for ${1:item} in ${2:iterable}:\n    ${0}' },
    { label: 'try', detail: 'try/except', insertText: 'try:\n    ${1}\nexcept ${2:Exception} as err:\n    print(err)' },
    { label: 'pprint', detail: 'print', insertText: 'print(${1:value})' },
  ],
  css: [
    { label: 'flex', detail: 'flex centering', insertText: 'display: flex;\nalign-items: center;\njustify-content: center;' },
    { label: 'grid2', detail: '2-col grid', insertText: 'display: grid;\ngrid-template-columns: 1fr 1fr;\ngap: ${1:1rem};' },
    { label: 'media', detail: 'media query', insertText: '@media (max-width: ${1:768px}) {\n  ${0}\n}' },
  ],
  shell: [
    { label: 'shebang', detail: 'bash shebang', insertText: '#!/usr/bin/env bash\nset -euo pipefail\n${0}' },
  ],
};

let registered = false;

export function registerEditorSnippets(monaco) {
  if (!monaco || registered) return;
  registered = true;
  Object.entries(SNIPPETS).forEach(([language, snippets]) => {
    try {
      monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: ['<', '.', ' '],
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          return {
            suggestions: snippets.map((s) => ({
              label: s.label,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: s.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: s.detail,
              detail: s.detail,
              range,
            })),
          };
        },
      });
    } catch (_) { /* language not registered in this monaco build */ }
  });
}

export default { registerEditorSnippets };
