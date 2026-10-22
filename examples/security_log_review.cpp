#include <iostream>
#include <stdexcept>
#include <string>

#include <zafiro/python.hpp>

int main() {
    zafiro::LanguageHub hub;
    if (!zafiro::register_python(hub)) {
        std::cerr << "No se pudo registrar Python.\n";
        return 1;
    }

    // Datos de demostración: dirección TEST-NET reservada para documentación.
    hub.context().set("log_lines", zafiro::Value::Array{
        "auth: inicio de sesión rechazado desde 192.0.2.44",
        "auth: usuario inválido desde 192.0.2.44",
        "auth: inicio de sesión rechazado desde 192.0.2.44",
        "auth: inicio de sesión correcto desde 198.51.100.20"
    });

    try {
        const std::string report = hub.run("python", R"PY(
from collections import Counter

fallos = Counter()
for linea in zafiro["log_lines"]:
    if "rechazado desde " in linea or "usuario inválido desde " in linea:
        fallos[linea.rsplit(" desde ", 1)[-1]] += 1

zafiro["alertas"] = [
    {"ip": ip, "fallos": cantidad}
    for ip, cantidad in fallos.items()
    if cantidad >= 3
]
print(f"Revisadas {len(zafiro['log_lines'])} líneas")
print(f"Alertas para revisión: {len(zafiro['alertas'])}")
)PY");
        std::cout << report;
        const auto alerts = hub.context().get("alertas");
        if (alerts && alerts->is_array()) {
            for (const auto& alert : alerts->as_array()) {
                std::cout << "Revisar origen " << alert.as_object().at("ip").as_string()
                          << " (" << alert.as_object().at("fallos").as_number()
                          << " intentos fallidos)\n";
            }
        }
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
