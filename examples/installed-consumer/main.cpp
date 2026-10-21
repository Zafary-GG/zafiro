#include <iostream>
#include <stdexcept>
#include <zafiro/zafiro.hpp>
#if defined(ZAFIRO_CONSUMER_PYTHON)
#include <zafiro/python.hpp>
#endif
#if defined(ZAFIRO_CONSUMER_JAVASCRIPT)
#include <zafiro/javascript.hpp>
#endif

int main() {
    zafiro::LanguageHub hub;
#if defined(ZAFIRO_CONSUMER_PYTHON)
    if (!zafiro::register_python(hub)) throw std::runtime_error("No se registró Python");
    std::cout << hub.run("python", "print('Python desde find_package')") << '\n';
#endif
#if defined(ZAFIRO_CONSUMER_JAVASCRIPT)
    if (!zafiro::register_javascript(hub)) throw std::runtime_error("No se registró JavaScript");
    std::cout << hub.run("javascript", "console.log('JavaScript desde find_package')") << '\n';
#endif
}

