# Zafiro

Versión actual: **0.3.0**.

Zafiro es una librería C++17 para compartir datos y encadenar Python, JavaScript y Lua dentro de una aplicación C++. La biblioteca base no requiere dependencias; los adaptadores se activan por separado.

La guía detallada está en [INSTALL.md](INSTALL.md). El proyecto incluye licencia MIT.

## Zafiro WebScript: crea apps web

El lenguaje propio de Zafiro está en [`site/language-studio.html`](site/language-studio.html). El editor muestra una vista previa y compila un programa `.zafiro` a un archivo HTML independiente. El ejemplo de ubicación está en [`examples/ubicacion_web.zafiro`](examples/ubicacion_web.zafiro).

WebScript 0.2 combina instrucciones declarativas de interfaz con variables, números y cadenas, operaciones `+ - * /`, comparaciones, funciones de un parámetro y condiciones de una línea (`si ... entonces ...`). Las expresiones son interpretadas por un evaluador pequeño; no ejecuta JavaScript arbitrario. Todavía es un lenguaje de dominio para apps web, no un lenguaje de propósito general: no tiene ciclos, módulos, tipos estáticos, almacenamiento ni compilación móvil nativa. La extensión inicial de VS Code en `editors/vscode` da resaltado de sintaxis; aún no trae autocompletado ni diagnósticos.

La app de ejemplo puede solicitar la ubicación del dispositivo que la está usando. La Geolocation API requiere HTTPS o localhost; el navegador pide el permiso cuando la persona toca el botón. Las coordenadas se muestran localmente: no localiza teléfonos por número o dispositivos ajenos y no las envía al servidor.

Para ejecutar sus pruebas con Node.js 22 o posterior: `npm run test:webscript`.

## Instalación para otros proyectos CMake

Activa durante la instalación los adaptadores que quieres distribuir. El paquete instala las dependencias de QuickJS-NG que necesita el adaptador JavaScript y registra la dependencia de CPython para el adaptador Python.

```sh
cmake -S . -B build -DCMAKE_INSTALL_PREFIX=/ruta/a/zafiro \
  -DZAFIRO_WITH_PYTHON=ON -DZAFIRO_WITH_JAVASCRIPT=ON
cmake --build build --config Release
cmake --install build --config Release
```

En el proyecto consumidor, pasa el prefijo al configurar CMake y pide solo los componentes instalados:

```cmake
find_package(zafiro 0.3 CONFIG REQUIRED COMPONENTS python javascript)
target_link_libraries(mi_app PRIVATE zafiro::zafiro zafiro::python zafiro::javascript)
```

Si un adaptador no se habilitó al instalar Zafiro, no lo agregues a `COMPONENTS` ni a `target_link_libraries`.

Para generar paquetes versionados ZIP y TGZ, compila Zafiro con los adaptadores que quieras distribuir y ejecuta `cmake --build build --target package`. El consumidor de ejemplo en `examples/installed-consumer` prueba la instalación usando únicamente `find_package`.

## Incluye

- Texto: `trim`, `to_upper`, `to_lower`, `split` y `starts_with`.
- Números: `clamp`, `map_range` y `approximately_equal`.
- `LanguageHub`: registra adaptadores de lenguajes y despacha fragmentos de código.
- `SharedContext` y `Value`: comparten valores JSON compatibles entre C++ y los adaptadores.
- `run_pipeline`: ejecuta pasos de distintos lenguajes en secuencia usando los mismos datos.
- Adaptador CPython: ejecuta código Python, captura `stdout`/`stderr` y devuelve el traceback si hay un error.
- Adaptador JavaScript: integra QuickJS-NG, captura `print` y `console`, conserva el contexto entre llamadas y propaga errores.
- Adaptador Lua 5.4: integra Lua, captura salida, propaga errores y comparte datos.

## Usos en ciberseguridad defensiva

Zafiro también puede coordinar scripts para tareas defensivas: resumir registros de autenticación, correlacionar alertas, validar configuraciones y conectar herramientas internas. Por ejemplo, el programa [`examples/security_log_review.cpp`](examples/security_log_review.cpp) pasa registros de demostración de C++ a Python, cuenta fallos repetidos y devuelve alertas al contexto compartido.

```sh
cmake -S . -B build -DZAFIRO_WITH_PYTHON=ON
cmake --build build --target zafiro_security_log_example
```

La librería aporta el puente entre lenguajes; no incluye un IDS, escáner de vulnerabilidades ni motor de detección. Los adaptadores ejecutan código en el mismo proceso y no son un sandbox: usa datos y sistemas que tengas autorización para analizar, y aísla aparte los scripts que no sean de confianza.

## Compartir valores y encadenar lenguajes

Los scripts acceden al contexto como `zafiro` (diccionario en Python, objeto en JavaScript y tabla en Lua). El contexto de C++ permite precargar y recuperar datos:

```cpp
hub.context().set("numero", 20);
hub.run_pipeline({
    {"python", "zafiro['numero'] += 1"},
    {"javascript", "zafiro.numero *= 2; console.log(zafiro.numero);"}
});
std::cout << hub.context().get("numero")->as_number(); // 42
```

Los valores compartidos admiten nulo, booleano, número finito, texto, listas y objetos con claves de texto. Evita valores cíclicos; los adaptadores solo importan valores JSON compatibles.

Para los tres lenguajes compila con `-DZAFIRO_WITH_PYTHON=ON -DZAFIRO_WITH_JAVASCRIPT=ON -DZAFIRO_WITH_LUA=ON`. Lua 5.4.9 se descarga de lua.org y QuickJS-NG de su repositorio oficial durante la configuración.

## VS Code y Visual Studio

Abre la carpeta del repositorio. VS Code recomienda C/C++ y CMake Tools. En la vista CMake selecciona el preset **Zafiro: C++ base** para compilar la biblioteca; el preset **Zafiro: Python + JavaScript + Lua** habilita todos los adaptadores y requiere Python con archivos de desarrollo y conexión para descargar las dependencias.

También puedes ejecutar desde la terminal integrada:

```sh
cmake --preset default
cmake --build --preset default
ctest --preset default
```

Visual Studio abre la carpeta mediante **Archivo > Abrir > Carpeta** y detecta `CMakeLists.txt` y `CMakePresets.json`. También puedes escoger la configuración `all-adapters` desde la barra de configuración de CMake.

## Conan y vcpkg

La receta Conan está en `conanfile.py`; compila la distribución de Zafiro y ofrece opciones `with_python`, `with_javascript` y `with_lua`. El puerto overlay de vcpkg está en `ports/zafiro`; instálalo desde la raíz con `vcpkg install zafiro --overlay-ports=ports`. El puerto instala el núcleo; los adaptadores se habilitan desde CMake y requieren los paquetes de desarrollo de sus runtimes.

## Adaptador real de Python

El adaptador usa la API de embedding oficial de CPython. Python es opcional: el objetivo normal `zafiro::zafiro` sigue siendo una librería de cabecera sin dependencias externas. Para habilitar el adaptador, instala Python con sus archivos de desarrollo y CMake 3.24 o posterior.

```sh
cmake -S . -B build -DZAFIRO_WITH_PYTHON=ON
cmake --build build
```

El proyecto de ejemplo `zafiro_python_example` muestra la integración. También puedes compilar tu propia aplicación enlazando el objetivo `zafiro::python`.

```cpp
#include <iostream>
#include <zafiro/python.hpp>

int main() {
    zafiro::LanguageHub hub;
    zafiro::register_python(hub);
    std::cout << hub.run("python", "print('Hola desde Python')\nprint(6 * 7)");
}
```

`register_python(hub)` agrega el nombre `python` al puente. Cada llamada a `hub.run("python", codigo)` ejecuta el código en el runtime integrado y devuelve lo que imprimió. El espacio global de Python persiste entre llamadas dentro del proceso.

En CMake, enlaza la aplicación con:

```cmake
target_link_libraries(mi_app PRIVATE zafiro::python)
```

## Adaptador de JavaScript

JavaScript usa [QuickJS-NG](https://github.com/quickjs-ng/quickjs), fijado a la versión `v0.17.0`. El adaptador es opcional y CMake descarga esa dependencia al configurarlo:

```sh
cmake -S . -B build -DZAFIRO_WITH_JAVASCRIPT=ON
cmake --build build
```

Esto construye `zafiro_javascript_example`. En tu aplicación, incluye la cabecera y enlaza `zafiro::javascript`:

```cpp
#include <iostream>
#include <zafiro/javascript.hpp>

int main() {
    zafiro::LanguageHub hub;
    zafiro::register_javascript(hub);
    std::cout << hub.run("javascript", "console.log('Hola', 6 * 7);");
}
```

El adaptador ofrece `print(...)`, `console.log(...)` y `console.error(...)`; todos se devuelven como texto con salto de línea. Las ejecuciones comparten el contexto JavaScript, por lo que las variables globales persisten. Cada runtime serializa las llamadas, limita la memoria a 64 MiB y detiene una ejecución que supere dos segundos. Para ejecutarlo junto con Python, activa ambas opciones de CMake. CTest agrega pruebas para salida, errores, estado persistente y uso posterior a un error.

## Uso sin Python

```cpp
#include <iostream>
#include <zafiro/zafiro.hpp>

int main() {
    std::cout << zafiro::to_upper(zafiro::trim("  hola  ")) << '\n';
    std::cout << zafiro::clamp(120, 0, 100) << '\n';
}
```

Configura y compila el ejemplo básico con CMake:

```sh
cmake -S . -B build
cmake --build build
```

Al activar `ZAFIRO_WITH_PYTHON=ON` o `ZAFIRO_WITH_JAVASCRIPT=ON`, CTest configura las pruebas del adaptador correspondiente. Ejecútalas así:

```sh
ctest --test-dir build --output-on-failure
```

Las pruebas cubren la captura de salida, el reporte de errores, variables globales persistentes entre llamadas y el uso del runtime después de un error.

## Límites de seguridad

Los adaptadores ejecutan código dentro del mismo proceso de la aplicación. **No son un sandbox.** El límite de tiempo y memoria de JavaScript no sustituye aislamiento a nivel de sistema operativo ni convierte código hostil en seguro. Ejecuta solo código de confianza; para código de terceros usa un proceso aislado y una política de permisos aparte.

Las llamadas a Python se serializan dentro del adaptador y se usa el GIL de CPython. Los valores globales de Python se comparten entre ejecuciones. El runtime se mantiene activo hasta que termina el proceso para evitar finalizar CPython mientras otros hilos todavía pueden usarlo.
