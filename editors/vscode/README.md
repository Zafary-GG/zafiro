# Zafiro WebScript for Visual Studio Code

La extensión agrega resaltado, sugerencias de código y diagnósticos sintácticos para archivos `.zafiro`. Incluye el comando **Zafiro: Compilar proyecto WebScript**.

En el proyecto del repositorio o en un proyecto creado con `zafiro create`, abre la carpeta y ejecuta **Zafiro: Compilar proyecto WebScript** desde la paleta de comandos. Para otros proyectos, configura `zafiro.cliPath` con una ruta absoluta a `bin/zafiro.js`.

## Probar localmente

1. Abre la carpeta `editors/vscode` en VS Code.
2. Pulsa `F5` para iniciar una ventana Extension Development Host.
3. Abre `examples/ubicacion_web.zafiro` desde la raíz del repositorio para ver el resaltado.

## Instalar desde el archivo VSIX

Descarga `zafiro-webscript-0.3.0.vsix` y, en VS Code, abre la paleta (`Ctrl+Shift+P`), ejecuta **Extensions: Install from VSIX...** y selecciona el archivo. También puedes instalarlo desde una terminal:

```sh
code --install-extension zafiro-webscript-0.3.0.vsix
```

Para compilar, instala Node.js 22 o posterior y abre un proyecto creado con `node bin/zafiro.js create MiApp`, o configura `zafiro.cliPath` con la ruta a `bin/zafiro.js`.

## Crear el archivo VSIX

Desde esta carpeta, con Node.js y `vsce` disponible:

```sh
npm install --global @vscode/vsce
vsce package
```

El servidor de lenguaje actual vive en la extensión de VS Code y ofrece diagnósticos y sugerencias sencillas. Todavía no implementa el protocolo LSP, diagnósticos semánticos completos ni navegación de símbolos.
