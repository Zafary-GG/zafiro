#ifndef ZAFIRO_ZAFIRO_HPP
#define ZAFIRO_ZAFIRO_HPP

#include <algorithm>
#include <cctype>
#include <cmath>
#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <variant>
#include <utility>
#include <vector>

namespace zafiro {

// JSON-compatible value type used to exchange data between language runtimes.
class Value {
public:
    using Array = std::vector<Value>;
    using Object = std::map<std::string, Value>;
    using Storage = std::variant<std::nullptr_t, bool, double, std::string, Array, Object>;

    Value() : data_(nullptr) {}
    Value(std::nullptr_t) : data_(nullptr) {}
    Value(bool value) : data_(value) {}
    Value(int value) : data_(static_cast<double>(value)) {}
    Value(double value) : data_(value) {
        if (!std::isfinite(value)) throw std::invalid_argument("Zafiro: los numeros deben ser finitos.");
    }
    Value(const char* value) : data_(std::string(value ? value : "")) {}
    Value(std::string value) : data_(std::move(value)) {}
    Value(Array value) : data_(std::move(value)) {}
    Value(Object value) : data_(std::move(value)) {}

    const Storage& storage() const noexcept { return data_; }
    Storage& storage() noexcept { return data_; }
    bool is_null() const noexcept { return std::holds_alternative<std::nullptr_t>(data_); }
    bool is_bool() const noexcept { return std::holds_alternative<bool>(data_); }
    bool is_number() const noexcept { return std::holds_alternative<double>(data_); }
    bool is_string() const noexcept { return std::holds_alternative<std::string>(data_); }
    bool is_array() const noexcept { return std::holds_alternative<Array>(data_); }
    bool is_object() const noexcept { return std::holds_alternative<Object>(data_); }
    bool as_bool() const { return std::get<bool>(data_); }
    double as_number() const { return std::get<double>(data_); }
    const std::string& as_string() const { return std::get<std::string>(data_); }
    const Array& as_array() const { return std::get<Array>(data_); }
    Array& as_array() { return std::get<Array>(data_); }
    const Object& as_object() const { return std::get<Object>(data_); }
    Object& as_object() { return std::get<Object>(data_); }

private:
    Storage data_;
};

class SharedContext {
public:
    void set(std::string key, Value value) {
        if (key.empty()) throw std::invalid_argument("Zafiro: la clave compartida no puede estar vacia.");
        std::lock_guard<std::mutex> lock(mutex_);
        values_[std::move(key)] = std::move(value);
    }
    std::optional<Value> get(const std::string& key) const {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto it = values_.find(key);
        return it == values_.end() ? std::nullopt : std::optional<Value>(it->second);
    }
    bool erase(const std::string& key) {
        std::lock_guard<std::mutex> lock(mutex_);
        return values_.erase(key) != 0;
    }
    Value::Object snapshot() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return values_;
    }
private:
    mutable std::mutex mutex_;
    Value::Object values_;
};

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
    using ContextRunner = std::function<std::string(const std::string&, SharedContext&)>;
    struct Command { std::string language; std::string code; };

    bool register_language(std::string name, Runner runner) {
        if (!runner) return false;
        return register_language(std::move(name), [runner = std::move(runner)](const std::string& code, SharedContext&) {
            return runner(code);
        });
    }

    bool register_language(std::string name, ContextRunner runner) {
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
    std::string run(const std::string& language, const std::string& code) {
        const auto it = runners_.find(to_lower(trim(language)));
        if (it == runners_.end()) throw std::runtime_error("Zafiro: lenguaje no registrado: " + language);
        return it->second(code, context_);
    }

    std::string run_pipeline(const std::vector<Command>& commands) {
        std::string output;
        for (const auto& command : commands) output += run(command.language, command.code);
        return output;
    }

    SharedContext& context() noexcept { return context_; }
    const SharedContext& context() const noexcept { return context_; }

private:
    std::map<std::string, ContextRunner> runners_;
    SharedContext context_;
};

} // namespace zafiro

#endif // ZAFIRO_ZAFIRO_HPP
