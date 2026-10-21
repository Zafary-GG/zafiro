#include <iostream>
#include "zafiro/zafiro.hpp"

int main() {
    const std::string name = zafiro::trim("  zafiro  ");
    std::cout << zafiro::to_upper(name) << '\n';

    for (const auto& word : zafiro::split("rojo,azul,verde", ',')) {
        std::cout << "- " << word << '\n';
    }

    std::cout << "Valor limitado: " << zafiro::clamp(120, 0, 100) << '\n';

    // Demo de adaptador. Sustituye esto por una llamada a un runtime real
    // (por ejemplo, CPython o Lua) para ejecutar ese lenguaje.
    zafiro::LanguageHub hub;
    hub.register_language("demo", [](const std::string& code) {
        return "El adaptador recibió: " + code;
    });
    std::cout << hub.run("demo", "hola desde otro lenguaje") << '\n';
    return 0;
}
