#include <iostream>
#include <zafiro/javascript.hpp>

int main() {
    zafiro::LanguageHub hub;
    if (!zafiro::register_javascript(hub)) {
        std::cerr << "No se pudo registrar JavaScript.\n";
        return 1;
    }

    std::cout << hub.run("javascript",
        "const total = 6 * 7;\n"
        "console.log('Hola desde JavaScript:', total);\n");
}
