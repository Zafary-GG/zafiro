#include <iostream>
#include <stdexcept>
#include <zafiro/lua.hpp>

int main() {
    zafiro::LanguageHub hub;
    if (!zafiro::register_lua(hub)) throw std::runtime_error("No se pudo registrar Lua.");
    hub.context().set("valor", 3);
    const auto output = hub.run("lua", "zafiro.valor = zafiro.valor + 4; print('lua', zafiro.valor)");
    if (output != "lua\t7.0\n") throw std::runtime_error("Lua no devolvio la salida esperada: [" + output + "]");
    if (hub.context().get("valor")->as_number() != 7) throw std::runtime_error("Lua no sincronizo el contexto.");
    bool caught_error = false;
    try { hub.run("lua", "error('fallo-intencional')"); }
    catch (const std::runtime_error& error) {
        if (std::string(error.what()).find("fallo-intencional") == std::string::npos) throw;
        caught_error = true;
    }
    if (!caught_error) throw std::runtime_error("Lua debio propagar el error.");
    try { hub.run("lua", "while true do end"); }
    catch (const std::runtime_error& error) {
        if (std::string(error.what()).find("Tiempo maximo de ejecucion") == std::string::npos) throw;
        std::cout << "PASS: adaptador Lua, contexto, salida, errores y limite de tiempo\n"; return 0;
    }
    throw std::runtime_error("Lua debio propagar el error o detener la ejecucion excedida.");
}
