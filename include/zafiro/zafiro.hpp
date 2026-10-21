#ifndef ZAFIRO_ZAFIRO_HPP
#define ZAFIRO_ZAFIRO_HPP

#include <algorithm>
#include <cctype>
#include <cmath>
#include <functional>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace zafiro {

// Text helpers
inline std::string trim(const std::string& text) {
    const auto first = std::find_if_not(text.begin(), text.end(), [](unsigned char c) {
        return std::isspace(c) != 0;
    });
    const auto last = std::find_if_not(text.rbegin(), text.rend(), [](unsigned char c) {
        return std::isspace(c) != 0;
    }).base();
    if (first >= last) return {};
    return std::string(first, last);
}

inline std::string to_upper(std::string text) {
    std::transform(text.begin(), text.end(), text.begin(), [](unsigned char c) {
        return static_cast<char>(std::toupper(c));
    });
    return text;
}

inline std::string to_lower(std::string text) {
    std::transform(text.begin(), text.end(), text.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return text;
}

inline std::vector<std::string> split(const std::string& text, char delimiter) {
    std::vector<std::string> parts;
    std::stringstream stream(text);
    std::string part;
    while (std::getline(stream, part, delimiter)) parts.push_back(part);
    if (!text.empty() && text.back() == delimiter) parts.emplace_back();
    return parts;
}

inline bool starts_with(const std::string& text, const std::string& prefix) {
    return text.size() >= prefix.size() && text.compare(0, prefix.size(), prefix) == 0;
}

// Number helpers
inline double clamp(double value, double minimum, double maximum) {
    if (minimum > maximum) std::swap(minimum, maximum);
    return std::max(minimum, std::min(value, maximum));
}

inline double map_range(double value, double in_min, double in_max,
                        double out_min, double out_max) {
    if (in_min == in_max) return out_min;
    const double progress = (value - in_min) / (in_max - in_min);
    return out_min + progress * (out_max - out_min);
}

inline bool approximately_equal(double a, double b, double tolerance = 1e-9) {
    return std::abs(a - b) <= tolerance;
}

// Multi-language command bridge. Each language runtime is supplied by an adapter.
// Zafiro does not embed or install Python, JavaScript, Lua, or other runtimes.
class LanguageHub {
public:
    using Runner = std::function<std::string(const std::string&)>;

    bool register_language(std::string name, Runner runner) {
        name = to_lower(trim(name));
        if (name.empty() || !runner) return false;
        return runners_.emplace(std::move(name), std::move(runner)).second;
    }

    bool has_language(const std::string& name) const {
        return runners_.find(to_lower(trim(name))) != runners_.end();
    }

    std::vector<std::string> languages() const {
        std::vector<std::string> result;
        result.reserve(runners_.size());
        for (const auto& entry : runners_) result.push_back(entry.first);
        return result;
    }

    // Run one snippet in the selected language. The adapter defines how it executes.
    std::string run(const std::string& language, const std::string& code) const {
        const auto it = runners_.find(to_lower(trim(language)));
        if (it == runners_.end()) throw std::runtime_error("Zafiro: lenguaje no registrado: " + language);
        return it->second(code);
    }

private:
    std::map<std::string, Runner> runners_;
};

} // namespace zafiro

#endif // ZAFIRO_ZAFIRO_HPP
