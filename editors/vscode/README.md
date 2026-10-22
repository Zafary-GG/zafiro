# Zafiro WebScript for Visual Studio Code

Esta extensión inicial agrega resaltado, sugerencias de código y diagnósticos sintácticos para bloques `.zafiro`.

## Probar localmente

1. Abre la carpeta `editors/vscode` en VS Code.
2. Pulsa `F5` para iniciar una ventana Extension Development Host.
3. Abre `examples/ubicacion_web.zafiro` desde la raíz del repositorio para ver el resaltado.

También puedes instalar la extensión como VSIX cuando tengas Node.js y `vsce`:

```sh
npm install --global @vscode/vsce
cd editors/vscode
vsce package
```

El servidor de lenguaje actual vive en la extensión de VS Code y ofrece diagnósticos y sugerencias sencillas. Todavía no implementa el protocolo LSP, diagnósticos semánticos completos ni navegación de símbolos.
