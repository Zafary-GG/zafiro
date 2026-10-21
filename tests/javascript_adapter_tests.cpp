#include <exception>
#include <iostream>
#include <stdexcept>
#include <string>

#include <zafiro/javascript.hpp>

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

void test_captures_output(zafiro::LanguageHub& hub) {
    require_equal(hub.run("javascript",
        "print('salida'); console.log('normal', 42); console.error('aviso');"),
        "salida\nnormal 42\naviso\n",
        "Debe capturar print y console en el orden de ejecución.");
}

void test_reports_javascript_errors(zafiro::LanguageHub& hub) {
    try {
        hub.run("javascript", "throw new TypeError('fallo-intencional');");
    } catch (const std::runtime_error& error) {
        require_contains(error.what(), "TypeError: fallo-intencional",
                         "El error debe incluir el tipo y mensaje de JavaScript.");
        return;
    }
    throw std::runtime_error("Debe propagar errores de JavaScript como runtime_error.");
}

void test_keeps_globals_between_calls(zafiro::LanguageHub& hub) {
    require_equal(hub.run("javascript", "var contador = 40; print(contador);"),
                  "40\n", "La primera ejecución debe crear el global.");
    require_equal(hub.run("javascript", "contador += 2; print(contador);"),
                  "42\n", "La siguiente ejecución debe conservar el global.");
}

void test_interrupts_long_running_scripts(zafiro::LanguageHub& hub) {
    try {
        hub.run("javascript", "while (true) {}\n");
    } catch (const std::runtime_error& error) {
        require_contains(error.what(), "Tiempo máximo de ejecución excedido",
                         "Debe interrumpir un script que supera el límite de tiempo.");
        return;
    }
    throw std::runtime_error("Debe interrumpir la ejecución JavaScript excedida.");
}

void test_runtime_recovers_after_error(zafiro::LanguageHub& hub) {
    require_equal(hub.run("javascript", "console.log('captura restaurada');"),
                  "captura restaurada\n",
                  "El runtime debe seguir disponible después de un error.");
}

} // namespace

int main() {
    try {
        zafiro::LanguageHub hub;
        if (!zafiro::register_javascript(hub)) {
            throw std::runtime_error("No se pudo registrar el adaptador JavaScript.");
        }
        test_captures_output(hub);
        std::cout << "PASS: captura de salida\n";
        test_reports_javascript_errors(hub);
        std::cout << "PASS: errores JavaScript\n";
        test_keeps_globals_between_calls(hub);
        std::cout << "PASS: estado persistente entre ejecuciones\n";
        test_interrupts_long_running_scripts(hub);
        std::cout << "PASS: interrupción por tiempo límite\n";
        test_runtime_recovers_after_error(hub);
        std::cout << "PASS: recuperación después de error\n";
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        return 1;
    }
    return 0;
}
