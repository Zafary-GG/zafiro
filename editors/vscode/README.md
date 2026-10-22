# Zafiro WebScript for Visual Studio Code

Esta extensión inicial agrega resaltado de sintaxis y edición de bloques `.zafiro`.

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

El resaltado es básico; esta versión todavía no incluye autocompletado, diagnósticos ni un servidor Language Server Protocol.
