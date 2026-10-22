#include <iostream>
#include <stdexcept>
#include <zafiro/zafiro.hpp>

int main() {
    zafiro::LanguageHub hub;
    hub.context().set("valor", 1);
    hub.register_language("uno", [](const std::string&, zafiro::SharedContext& context) {
        context.set("valor", context.get("valor")->as_number() + 1); return "uno\n";
    });
    hub.register_language("dos", [](const std::string&, zafiro::SharedContext& context) {
        context.set("valor", context.get("valor")->as_number() * 3); return "dos\n";
    });
    const auto output = hub.run_pipeline({{"uno", ""}, {"dos", ""}});
    if (output != "uno\ndos\n" || hub.context().get("valor")->as_number() != 6)
        throw std::runtime_error("El pipeline no compartio el contexto y la salida correctamente.");
    std::cout << "PASS: contexto compartido y pipeline\n";
}
