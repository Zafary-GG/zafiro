#include <iostream>
#include <zafiro/lua.hpp>

int main() {
    zafiro::LanguageHub hub;
    zafiro::register_lua(hub);
    hub.context().set("mensaje", "Hola desde C++");
    std::cout << hub.run("lua", "print(zafiro.mensaje); zafiro.veces = 2")
              << "Veces guardadas: " << hub.context().get("veces")->as_number() << '\n';
}
