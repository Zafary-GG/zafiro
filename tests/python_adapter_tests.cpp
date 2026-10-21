#include <exception>
#include <iostream>
#include <stdexcept>
#include <string>

#include <zafiro/python.hpp>

namespace {

void require_equal(const std::string& actual, const std::string& expected,
                   const char* behavior) {
    if (actual != expected) {
        throw std::runtime_error(std::string(behavior) + "\nEsperado: [" + expected +
                                 "]\nRecibido: [" + actual + "]");
    }
}

void require_contains(const std::string& actual, const std::string& expected,
                     const char* behavior) {
    if (actual.find(expected) == std::string::npos) {
        throw std::runtime_error(std::string(behavior) + "\nFalta: [" + expected +
                                 "]\nRecibido: [" + actual + "]");
    }
}

void test_captures_stdout_and_stderr(zafiro::LanguageHub& hub) {
    const std::string output = hub.run(
        "python",
        "import sys\n"
        "print('salida normal')\n"
        "print('mensaje de error', file=sys.stderr)\n");
    require_equal(output, "salida normal\nmensaje de error\n",
                  "Debe devolver stdout seguido de stderr.");
}

void test_returns_traceback_for_python_errors(zafiro::LanguageHub& hub) {
    try {
        hub.run("python", "raise ValueError('fallo-intencional')");
    } catch (const std::runtime_error& error) {
        const std::string message = error.what();
        require_contains(message, "Traceback (most recent call last):",
                         "El error debe incluir el traceback.");
        require_contains(message, "ValueError: fallo-intencional",
                         "El error debe incluir el tipo y el mensaje de Python.");
        return;
    }
    throw std::runtime_error("Debe propagar las excepciones de Python como runtime_error.");
}

void test_keeps_globals_between_calls(zafiro::LanguageHub& hub) {
    require_equal(hub.run("python", "contador = 40\nprint(contador)"), "40\n",
                  "La primera ejecución debe crear el global.");
    require_equal(hub.run("python", "contador += 2\nprint(contador)"), "42\n",
                  "La siguiente ejecución debe conservar el global.");
}

void test_streams_are_restored_after_an_error(zafiro::LanguageHub& hub) {
    require_equal(hub.run("python", "print('captura restaurada')"), "captura restaurada\n",
                  "La captura debe seguir funcionando tras una excepción.");
}

} // namespace

int main() {
    try {
        zafiro::LanguageHub hub;
        if (!zafiro::register_python(hub)) {
            throw std::runtime_error("No se pudo registrar el adaptador Python.");
        }

        test_captures_stdout_and_stderr(hub);
        std::cout << "PASS: captura stdout y stderr\n";

        test_returns_traceback_for_python_errors(hub);
        std::cout << "PASS: traceback de errores Python\n";

        test_keeps_globals_between_calls(hub);
        std::cout << "PASS: globals persistentes entre ejecuciones\n";

        test_streams_are_restored_after_an_error(hub);
        std::cout << "PASS: restauración de streams después de error\n";
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        return 1;
    }
    return 0;
}
