# Catálogo de paquetes Zafiro

El registro estático vive en `index.json` y se distribuye desde el repositorio oficial de Zafiro. Las versiones son inmutables y siguen `mayor.menor.parche`.

## Instalar y actualizar

Desde un proyecto WebScript:

```sh
node bin/zafiro.js list
node bin/zafiro.js install @zafiro/saludos
node bin/zafiro.js install @zafiro/utilidades-numericas@1.0.0
```

Usa el paquete en `src/main.zafiro` con `usar "@zafiro/saludos"`. La instalación guarda la dependencia en `zafiro.json`, la versión y el hash en `zafiro.lock`, y el módulo en `modules/packages/`. El archivo lock se debe conservar en Git para fijar la misma versión entre equipos.

```sh
node bin/zafiro.js update
node bin/zafiro.js update @zafiro/saludos
```

La instalación verifica HTTPS, limita el tamaño, rechaza redirecciones, restringe descargas al repositorio oficial y compara hashes SHA-256 del catálogo, paquete y módulo. El hash detecta cambios; no sustituye una firma digital del autor.

## Compartir un módulo

Un paquete es un archivo JSON `.zfpkg` con un módulo WebScript y su hash. No admite scripts arbitrarios ni dependencias transitivas.

```sh
node bin/zafiro.js pack mi-modulo.zfm --name @miusuario/mi-modulo --version 1.0.0
node bin/zafiro.js install ./miusuario-mi-modulo-1.0.0.zfpkg
```

Para proponer un paquete al catálogo público, crea una nueva versión del archivo `.zfpkg`, agrega el archivo en `packages/<nombre>/<versión>.zfpkg` y registra su ruta y el hash que imprime `pack` en `packages/index.json`. Las versiones existentes no se deben reemplazar. Envía esos cambios en un pull request al repositorio. Los módulos del registro se escriben con `modulo nombre { ... }` y se validan antes de instalarse.

El catálogo oficial se encuentra actualmente en el repositorio de GitHub de Zafiro. Los paquetes locales pueden compartirse como archivo sin publicarlos allí.
