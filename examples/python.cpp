#include <iostream>
#include <zafiro/python.hpp>

int main() {
    zafiro::LanguageHub hub;
    if (!zafiro::register_python(hub)) {
        std::cerr << "No se pudo registrar Python.\n";
        return 1;
    }

    try {
        const std::string output = hub.run("python", "nombre = 'Zafiro'\nprint(f'Hola desde {nombre}')\nprint(6 * 7)");
        std::cout << output;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
