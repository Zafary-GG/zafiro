#include <iostream>
#include <zafiro/python.hpp>
#include <zafiro/javascript.hpp>

int main() {
    zafiro::LanguageHub hub;
    zafiro::register_python(hub);
    zafiro::register_javascript(hub);
    hub.context().set("numero", 20);
    const auto result = hub.run_pipeline({
        {"python", "zafiro['numero'] += 1\nprint('Python:', zafiro['numero'])"},
        {"javascript", "zafiro.numero *= 2; console.log('JavaScript:', zafiro.numero);"}
    });
    std::cout << result << "Resultado compartido: " << hub.context().get("numero")->as_number() << '\n';
}
