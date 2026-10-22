const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

const keywords = ['aplicacion', 'modulo', 'variable', 'tipo', 'funcion', 'si', 'entonces', 'repetir', 'usar', 'desde', 'hasta', 'titulo', 'descripcion', 'tema', 'boton', 'permiso', 'mostrar', 'texto', 'numero', 'booleano', 'verdadero', 'falso', 'claro', 'oscuro', 'datos', 'tabla', 'campo', 'clave', 'formulario', 'requerido', 'opcional', 'parametro', 'consulta', 'selecciona', 'donde', 'limite', 'inspeccion_web', 'inspeccionar', 'web', 'paginas'];
const builtins = ['mayusculas', 'minusculas', 'longitud', 'redondear', 'minimo', 'maximo'];

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('zafiro');
  context.subscriptions.push(diagnostics);
  const output = vscode.window.createOutputChannel('Zafiro WebScript');
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand('zafiro.buildProject', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) { vscode.window.showErrorMessage('Abre una carpeta de proyecto para compilar con Zafiro.'); return; }
    const configured = vscode.workspace.getConfiguration('zafiro').get('cliPath');
    const projectCli = path.join(folder.uri.fsPath, 'bin', 'zafiro.js');
    const cliPath = configured || (fs.existsSync(projectCli) ? projectCli : path.resolve(__dirname, '../../bin/zafiro.js'));
    output.clear(); output.show(true); output.appendLine(`Compilando ${folder.uri.fsPath}`);
    execFile(process.execPath, [cliPath, 'build', folder.uri.fsPath], { cwd: folder.uri.fsPath }, (error, stdout, stderr) => {
      if (stdout) output.append(stdout);
      if (stderr) output.append(stderr);
      if (error) { output.appendLine(`Error: ${error.message}`); vscode.window.showErrorMessage('Falló la compilación de Zafiro. Revisa el canal de salida.'); return; }
      vscode.window.showInformationMessage('Proyecto Zafiro compilado en dist/.');
    });
  }));
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider('zafiro', {
    provideCompletionItems(document, position) {
      const line = document.lineAt(position.line).text;
      const suggestions = [...keywords.map(word => [word, vscode.CompletionItemKind.Keyword]), ...builtins.map(word => [word, vscode.CompletionItemKind.Function])];
      if (line.trimStart().startsWith('funcion')) {
        suggestions.push(['funcion ${1:nombre}(${2:valor}) = ${2:valor}', vscode.CompletionItemKind.Snippet]);
      }
      if (line.trimStart().startsWith('modulo')) suggestions.push(['modulo ${1:nombre}\n  funcion ${2:duplicar}(x) = x * 2\n}', vscode.CompletionItemKind.Snippet]);
      if (line.trimStart().startsWith('repetir')) {
        suggestions.push(['repetir ${1:i} desde ${2:1} hasta ${3:3} entonces variable ${4:total} = ${4:total} + ${1:i}', vscode.CompletionItemKind.Snippet]);
      }
      return suggestions.map(([label, kind]) => {
        const item = new vscode.CompletionItem(label, kind);
        if (kind === vscode.CompletionItemKind.Snippet) item.insertText = new vscode.SnippetString(label);
        item.detail = 'Zafiro WebScript';
        return item;
      });
    }
  }, undefined, '.', ' '));

  const validate = document => {
    if (document.languageId !== 'zafiro') return;
    const found = [];
    let appDepth = 0, appSeen = false;
    for (let index = 0; index < document.lineCount; index += 1) {
      const line = document.lineAt(index).text.trim();
      if (!line || line.startsWith('#')) continue;
      if (/^(?:aplicacion\s+".*"|modulo\s+[A-Za-z_]\w*)\s*\{$/.test(line)) { appDepth += 1; if (line.startsWith('aplicacion')) appSeen = true; continue; }
      if (/^boton\s+".*"\s*\{$/.test(line)) { appDepth += 1; continue; }
      if (line === '}') { appDepth -= 1; if (appDepth < 0) { appDepth = 0; found.push(new vscode.Diagnostic(new vscode.Range(index, 0, index, document.lineAt(index).text.length), 'Cierre } sin bloque abierto.', vscode.DiagnosticSeverity.Error)); } continue; }
      const isKnown = /^(?:titulo\s+|descripcion\s+|tema\s+(?:claro|oscuro)$|boton\s+|permiso\s+ubicacion\s+al_pulsar$|mostrar\s+coordenadas$|variable\s+|tipo\s+|funcion\s+|si\s+|repetir\s+|usar\s+(?:[A-Za-z_]\w*|".+\.zfm")|tabla\s+[A-Za-z_]\w*\s*\{|formulario\s+[A-Za-z_]\w*\s*\{|campo\s+|parametro\s+|consulta\s+|inspeccionar\s+web\s+paginas\s+\d+$)/.test(line);
      if (!isKnown) found.push(new vscode.Diagnostic(new vscode.Range(index, 0, index, document.lineAt(index).text.length), 'Instrucción de Zafiro no reconocida.', vscode.DiagnosticSeverity.Error));
      if (/^tema\s+/.test(line) && !/^tema\s+(?:claro|oscuro)$/.test(line)) found.push(new vscode.Diagnostic(new vscode.Range(index, 0, index, document.lineAt(index).text.length), 'El tema debe ser claro u oscuro.', vscode.DiagnosticSeverity.Error));
      if (/^variable\s+/.test(line) && !/^variable\s+[A-Za-z_]\w*(?:\s*:\s*[A-Za-z_]\w*)?\s*=\s*.+$/.test(line)) found.push(new vscode.Diagnostic(new vscode.Range(index, 0, index, document.lineAt(index).text.length), 'Sintaxis: variable nombre[: tipo] = expresion.', vscode.DiagnosticSeverity.Error));
      if (/^si\s+/.test(line) && !/^si\s+.+\s+entonces\s+(?:titulo|descripcion|boton)\s+.+$/.test(line)) found.push(new vscode.Diagnostic(new vscode.Range(index, 0, index, document.lineAt(index).text.length), 'Sintaxis: si expresion entonces titulo|descripcion|boton valor.', vscode.DiagnosticSeverity.Error));
      if (/^repetir\s+/.test(line) && !/^repetir\s+[A-Za-z_]\w*\s+desde\s+.+\s+hasta\s+.+\s+entonces\s+variable\s+[A-Za-z_]\w*\s*=\s*.+$/.test(line)) found.push(new vscode.Diagnostic(new vscode.Range(index, 0, index, document.lineAt(index).text.length), 'Sintaxis: repetir i desde inicio hasta fin entonces variable total = expresion.', vscode.DiagnosticSeverity.Error));
    }
    if (appSeen && appDepth > 0) found.push(new vscode.Diagnostic(new vscode.Range(Math.max(0, document.lineCount - 1), 0, Math.max(0, document.lineCount - 1), document.lineAt(Math.max(0, document.lineCount - 1)).text.length), `Faltan ${appDepth} cierre(s) }.`, vscode.DiagnosticSeverity.Error));
    diagnostics.set(document.uri, found);
  };
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(validate), vscode.workspace.onDidChangeTextDocument(event => validate(event.document)));
  for (const document of vscode.workspace.textDocuments) validate(document);
}

function deactivate() {}
module.exports = { activate, deactivate };
