# Zafiro

Versión actual: **0.2.1**.

Zafiro es una librería de utilidades C++17 con un puente opcional para integrar runtimes de otros lenguajes dentro de una aplicación C++.

La guía detallada está en [INSTALL.md](INSTALL.md). El proyecto incluye licencia MIT.

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
find_package(zafiro 0.2 CONFIG REQUIRED COMPONENTS python javascript)
target_link_libraries(mi_app PRIVATE zafiro::zafiro zafiro::python zafiro::javascript)
```

Si un adaptador no se habilitó al instalar Zafiro, no lo agregues a `COMPONENTS` ni a `target_link_libraries`.

Para generar paquetes versionados ZIP y TGZ, compila Zafiro con los adaptadores que quieras distribuir y ejecuta `cmake --build build --target package`. El consumidor de ejemplo en `examples/installed-consumer` prueba la instalación usando únicamente `find_package`.

## Incluye

- Texto: `trim`, `to_upper`, `to_lower`, `split` y `starts_with`.
- Números: `clamp`, `map_range` y `approximately_equal`.
- `LanguageHub`: registra adaptadores de lenguajes y despacha fragmentos de código.
- Adaptador CPython: ejecuta código Python, captura `stdout`/`stderr` y devuelve el traceback si hay un error.
- Adaptador JavaScript: integra QuickJS-NG, captura `print` y `console`, conserva el contexto entre llamadas y propaga errores.

## Adaptador real de Python

El adaptador usa la API de embedding oficial de CPython. Python es opcional: el objetivo normal `zafiro::zafiro` sigue siendo una librería de cabecera sin dependencias externas. Para habilitar el adaptador, instala Python con sus archivos de desarrollo y CMake 3.18 o posterior.

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
