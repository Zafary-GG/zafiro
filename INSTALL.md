# Instalación de Zafiro 0.3.0

## Apps web con Zafiro WebScript

Abre [`site/language-studio.html`](site/language-studio.html) en un navegador para escribir WebScript, revisar su vista previa y descargar un HTML independiente. El archivo [`examples/ubicacion_web.zafiro`](examples/ubicacion_web.zafiro) muestra variables, aritmética, funciones de un parámetro y condiciones. El intérprete valida las expresiones admitidas y no ejecuta código arbitrario del usuario. Hay una extensión básica para VS Code en [`editors/vscode`](editors/vscode).

Para permitir ubicación, publica la app en HTTPS (localhost funciona durante desarrollo). El navegador solicita el permiso después de que el usuario pulse el botón. Solo consulta la ubicación del dispositivo que está usando la página, y el ejemplo presenta las coordenadas en el propio dispositivo sin enviarlas al servidor. No permite localizar otro teléfono a distancia. WebScript 0.2 es un lenguaje de dominio web temprano; todavía carece de ciclos, módulos, tipos estáticos, almacenamiento, autocompletado y compilación a apps nativas.

Zafiro es una librería C++17. El núcleo solo necesita sus cabeceras; los adaptadores son opcionales.

## Requisitos

- CMake 3.24 o posterior.
- Un compilador compatible con C++17: GCC, Clang o MSVC.
- Para JavaScript: conexión a Internet durante la primera configuración para descargar QuickJS-NG v0.17.0.
- Para Python: CPython 3.9 o posterior instalado con sus archivos de desarrollo y embedding.
- Para los presets de VS Code/Visual Studio: CMake 3.24 o posterior y Ninja.
- Lua 5.4.9 y QuickJS-NG se descargan al habilitar esos adaptadores.

## Descargar el código

Descarga el código fuente y los paquetes compilados desde la sección **Releases** del repositorio. Para Linux y macOS, compila desde el código fuente en el sistema de destino y verifica cada archivo con el manifiesto SHA-256 incluido en la publicación.

## Compilar el núcleo

Desde la carpeta que contiene `CMakeLists.txt`:

```sh
cmake -S . -B build
cmake --build build --config Release
```

El ejemplo `zafiro_basic` muestra las utilidades de texto y números. El núcleo es header-only; también puedes incluir `include/zafiro/zafiro.hpp` y compilar con C++17 directamente.

## Instalar el núcleo y los adaptadores

Los adaptadores se incluyen al configurar la instalación de Zafiro. Python requiere CPython 3.9+ con `Development.Embed`; JavaScript descarga QuickJS-NG v0.17.0. Selecciona solo los que necesites:

```sh
cmake -S . -B build \
  -DCMAKE_INSTALL_PREFIX=/ruta/a/zafiro \
  -DZAFIRO_WITH_PYTHON=ON \
  -DZAFIRO_WITH_JAVASCRIPT=ON
cmake --build build --config Release
cmake --install build --config Release
```

El paquete instala cabeceras y targets CMake `zafiro::zafiro`, `zafiro::python` y `zafiro::javascript`. Cuando JavaScript está activado, también instala la biblioteca y cabeceras QuickJS-NG requeridas por el adaptador.

Para generar archivos versionados después de compilar, ejecuta `cmake --build build --target package`. CPack genera `zafiro-0.3.0-<sistema>-<arquitectura>.zip` y `.tar.gz`; ambos contienen los componentes seleccionados, cabeceras, configuración CMake y documentación. Compila en cada sistema de destino para que el paquete incluya las bibliotecas nativas correspondientes.

El proyecto [examples/installed-consumer](examples/installed-consumer) sirve para comprobar la instalación desde un consumidor independiente. Configúralo con `-DCMAKE_PREFIX_PATH=/ruta/a/zafiro` y, si no instalaste algún runtime, desactiva su opción, por ejemplo `-DZAFIRO_CONSUMER_PYTHON=OFF`.

Comandos completos para el consumidor incluido:

```sh
cmake -S examples/installed-consumer -B consumer-build \
  -DCMAKE_PREFIX_PATH=/ruta/a/zafiro
cmake --build consumer-build --config Release
```

Las opciones `ZAFIRO_CONSUMER_PYTHON` y `ZAFIRO_CONSUMER_JAVASCRIPT` vienen activadas por defecto; ponlas en `OFF` para omitir un runtime.

## VS Code, Visual Studio, Conan y vcpkg

Abre la carpeta del repositorio en VS Code o Visual Studio; ambos reconocen los presets CMake incluidos. En VS Code acepta las extensiones recomendadas y selecciona `default` o `all-adapters`. Compilación base: `cmake --preset default`, `cmake --build --preset default`, `ctest --preset default`.

La receta `conanfile.py` usa Conan 2 (`conan create .`) y acepta `with_python`, `with_javascript` y `with_lua`. El puerto overlay de vcpkg está en `ports/zafiro`; desde la raíz del repositorio puedes instalarlo con `vcpkg install zafiro --overlay-ports=ports`. El puerto instala el núcleo C++; activa los adaptadores opcionales con CMake para compilar sus runtimes.

El adaptador Lua puede instalarse como componente `lua` y enlazarse como `zafiro::lua`.

## Usar desde otro proyecto CMake

Indica el prefijo de instalación al configurar el proyecto consumidor:

```cmake
find_package(zafiro 0.3 CONFIG REQUIRED COMPONENTS python javascript)

add_executable(mi_app main.cpp)
target_link_libraries(mi_app PRIVATE
    zafiro::zafiro
    zafiro::python
    zafiro::javascript)
```

Si no quieres un adaptador, quítalo de `COMPONENTS` y de `target_link_libraries`. Solicitar un componente que no se incluyó al instalar Zafiro produce un error claro de `find_package`.

## Compilar y probar adaptadores desde el código fuente

```sh
cmake -S . -B build -DZAFIRO_WITH_JAVASCRIPT=ON
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
```

CMake descarga QuickJS-NG v0.17.0. El adaptador proporciona `print`, `console.log` y `console.error`, conserva el contexto entre llamadas, limita memoria a 64 MiB y solicita interrumpir una ejecución tras dos segundos. La prueba de integración se llama `zafiro.javascript_adapter`.

## Activar el adaptador Python

Instala CPython 3.9+ y sus componentes de desarrollo/embedding. Luego:

```sh
cmake -S . -B build -DZAFIRO_WITH_PYTHON=ON
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
```

La prueba de integración se llama `zafiro.python_adapter`.

## Sistemas operativos

- **Windows:** instala Visual Studio Build Tools con el componente de C++ y CMake. Ejecuta los comandos desde Developer PowerShell. Si activas Python, instala además el paquete de desarrollo de CPython.
- **Linux:** instala CMake, GCC o Clang y Git. Para JavaScript, permite que CMake acceda a GitHub durante la primera configuración. Para Python, instala el paquete de desarrollo de Python 3.
- **macOS:** instala Xcode Command Line Tools y CMake. Para JavaScript, permite acceso a GitHub durante la configuración. Para Python, usa una instalación de CPython con headers y biblioteca embedding.

En Windows puedes distribuir el `.zip`; en Linux y macOS puedes distribuir el `.tar.gz`. Los paquetes son específicos de la plataforma y arquitectura donde se compilaron, especialmente cuando incluyen los adaptadores.

## Uso mínimo

```cpp
#include <iostream>
#include <zafiro/zafiro.hpp>

int main() {
    std::cout << zafiro::to_upper("hola") << '\n';
}
```

## Seguridad

Zafiro sirve para automatizar tareas defensivas como revisar registros, correlacionar alertas y validar configuraciones con scripts conectados. El ejemplo [`examples/security_log_review.cpp`](examples/security_log_review.cpp) muestra un análisis local de registros de demostración.

La librería coordina runtimes; no es un IDS ni un escáner y no sustituye herramientas especializadas. Los adaptadores ejecutan scripts en el proceso anfitrión. No son un sandbox; ejecuta análisis solo con autorización y usa aislamiento de sistema operativo para código no confiable.
