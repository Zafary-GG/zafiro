#ifndef ZAFIRO_JAVASCRIPT_HPP
#define ZAFIRO_JAVASCRIPT_HPP

// Include this adapter only in targets that link against QuickJS-NG.
#include <quickjs.h>

#include <chrono>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>

#include "zafiro.hpp"

namespace zafiro {
namespace detail {

struct JavaScriptState {
    std::string output;
    std::chrono::steady_clock::time_point deadline{};
    bool timed_out = false;
};

inline std::string js_value_to_string(JSContext* context, JSValueConst value) {
    size_t length = 0;
    const char* text = JS_ToCStringLen(context, &length, value);
    if (!text) {
        JSValue exception = JS_GetException(context);
        JS_FreeValue(context, exception);
        return "<valor no convertible a texto>";
    }
    std::string result(text, length);
    JS_FreeCString(context, text);
    return result;
}

inline std::string js_exception_message(JSContext* context);

inline JSValue js_print(JSContext* context, JSValueConst, int argc,
                        JSValueConst* argv) {
    auto* state = static_cast<JavaScriptState*>(JS_GetContextOpaque(context));
    if (!state) return JS_UNDEFINED;
    for (int i = 0; i < argc; ++i) {
        if (i != 0) state->output.push_back(' ');
        state->output += js_value_to_string(context, argv[i]);
    }
    state->output.push_back('\n');
    return JS_UNDEFINED;
}

inline int js_interrupt_handler(JSRuntime* runtime, void*) {
    auto* state = static_cast<JavaScriptState*>(JS_GetRuntimeOpaque(runtime));
    if (!state || std::chrono::steady_clock::now() < state->deadline) return 0;
    state->timed_out = true;
    return 1;
}

inline std::string js_exception_message(JSContext* context) {
    JSValue exception = JS_GetException(context);
    std::string description = js_value_to_string(context, exception);
    JSValue stack = JS_GetPropertyStr(context, exception, "stack");
    std::string stack_text;
    if (!JS_IsException(stack) && !JS_IsUndefined(stack) && !JS_IsNull(stack)) {
        stack_text = js_value_to_string(context, stack);
    }
    JS_FreeValue(context, stack);
    JS_FreeValue(context, exception);
    std::string message = description;
    if (!stack_text.empty() && stack_text.find(description) == std::string::npos) {
        if (!message.empty()) message.push_back('\n');
        message += stack_text;
    }
    return message.empty() ? "Error de JavaScript sin detalle." : message;
}

class JavaScriptEngine {
public:
    JavaScriptEngine() {
        runtime_ = JS_NewRuntime();
        if (!runtime_) throw std::runtime_error("Zafiro JavaScript: no se pudo crear QuickJS.");

        JS_SetMemoryLimit(runtime_, 64u * 1024u * 1024u);
        JS_SetMaxStackSize(runtime_, 1024u * 1024u);
        JS_SetRuntimeOpaque(runtime_, &state_);
        JS_SetInterruptHandler(runtime_, js_interrupt_handler, nullptr);

        context_ = JS_NewContext(runtime_);
        if (!context_) {
            JS_FreeRuntime(runtime_);
            runtime_ = nullptr;
            throw std::runtime_error("Zafiro JavaScript: no se pudo crear el contexto.");
        }
        JS_SetContextOpaque(context_, &state_);

        try {
            if (install_helpers() < 0) {
                const std::string error = js_exception_message(context_);
                throw std::runtime_error("Zafiro JavaScript: no se pudieron registrar print/console: " + error);
            }
        } catch (...) {
            JS_FreeContext(context_);
            JS_FreeRuntime(runtime_);
            context_ = nullptr;
            runtime_ = nullptr;
            throw;
        }
    }

    ~JavaScriptEngine() {
        if (context_) JS_FreeContext(context_);
        if (runtime_) JS_FreeRuntime(runtime_);
    }

    JavaScriptEngine(const JavaScriptEngine&) = delete;
    JavaScriptEngine& operator=(const JavaScriptEngine&) = delete;

    std::string run(const std::string& code) {
        std::lock_guard<std::mutex> lock(mutex_);
        state_.output.clear();
        state_.timed_out = false;
        state_.deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);

        JSValue result = JS_Eval(context_, code.data(), code.size(), "<zafiro>",
                                 JS_EVAL_TYPE_GLOBAL);
        const bool failed = JS_IsException(result);
        JS_FreeValue(context_, result);

        if (failed) {
            std::string message = js_exception_message(context_);
            if (state_.timed_out) message = "Tiempo máximo de ejecución excedido (2 segundos).";
            throw std::runtime_error("Zafiro JavaScript: " + message +
                (state_.output.empty() ? "" : "\nSalida antes del error:\n" + state_.output));
        }
        return state_.output;
    }

private:
    int install_helpers() {
        JSValue global = JS_GetGlobalObject(context_);
        JSValue print = JS_NewCFunction(context_, js_print, "print", 1);
        if (JS_IsException(print)) {
            JS_FreeValue(context_, global);
            return -1;
        }
        int result = JS_SetPropertyStr(context_, global, "print", print);
        if (result < 0) {
            JS_FreeValue(context_, global);
            return result;
        }

        JSValue console = JS_NewObject(context_);
        if (JS_IsException(console)) {
            JS_FreeValue(context_, global);
            return -1;
        }
        JSValue log = JS_NewCFunction(context_, js_print, "log", 1);
        JSValue error = JS_NewCFunction(context_, js_print, "error", 1);
        if (JS_IsException(log) || JS_IsException(error)) {
            JS_FreeValue(context_, log);
            JS_FreeValue(context_, error);
            JS_FreeValue(context_, console);
            JS_FreeValue(context_, global);
            return -1;
        }
        result = JS_SetPropertyStr(context_, console, "log", log);
        if (result >= 0) result = JS_SetPropertyStr(context_, console, "error", error);
        else JS_FreeValue(context_, error);
        if (result >= 0) result = JS_SetPropertyStr(context_, global, "console", console);
        else JS_FreeValue(context_, console);
        JS_FreeValue(context_, global);
        return result;
    }

    JSRuntime* runtime_ = nullptr;
    JSContext* context_ = nullptr;
    JavaScriptState state_;
    std::mutex mutex_;
};

} // namespace detail

class JavaScriptRuntime {
public:
    JavaScriptRuntime() : engine_(std::make_shared<detail::JavaScriptEngine>()) {}

    std::string run(const std::string& code) const {
        return engine_->run(code);
    }

private:
    std::shared_ptr<detail::JavaScriptEngine> engine_;
};

inline bool register_javascript(LanguageHub& hub) {
    auto runtime = std::make_shared<JavaScriptRuntime>();
    return hub.register_language("javascript", [runtime](const std::string& code) {
        return runtime->run(code);
    });
}

} // namespace zafiro

#endif // ZAFIRO_JAVASCRIPT_HPP
