#ifndef ZAFIRO_LUA_HPP
#define ZAFIRO_LUA_HPP

// Include this adapter only in targets that link against Lua 5.4.
extern "C" {
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>
}

#include <chrono>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>

#include "zafiro.hpp"

namespace zafiro {
namespace detail {

struct LuaState {
    lua_State* state = nullptr;
    SharedContext* shared = nullptr;
    std::string output;
    std::chrono::steady_clock::time_point deadline;
};

inline void lua_push_value(lua_State* L, const Value& value) {
    if (value.is_null()) lua_pushnil(L);
    else if (value.is_bool()) lua_pushboolean(L, value.as_bool());
    else if (value.is_number()) lua_pushnumber(L, value.as_number());
    else if (value.is_string()) lua_pushlstring(L, value.as_string().data(), value.as_string().size());
    else if (value.is_array()) {
        lua_createtable(L, static_cast<int>(value.as_array().size()), 0);
        lua_Integer i = 1;
        for (const auto& item : value.as_array()) { lua_push_value(L, item); lua_rawseti(L, -2, i++); }
    } else {
        lua_createtable(L, 0, static_cast<int>(value.as_object().size()));
        for (const auto& item : value.as_object()) { lua_push_value(L, item.second); lua_setfield(L, -2, item.first.c_str()); }
    }
}

inline std::optional<Value> lua_read_value(lua_State* L, int index, unsigned depth = 0) {
    if (depth > 32) return std::nullopt;
    switch (lua_type(L, index)) {
        case LUA_TNIL: return Value{};
        case LUA_TBOOLEAN: return Value(lua_toboolean(L, index) != 0);
        case LUA_TNUMBER: { const double n = lua_tonumber(L, index); if (!std::isfinite(n)) return std::nullopt; return Value(n); }
        case LUA_TSTRING: { size_t n = 0; const char* s = lua_tolstring(L, index, &n); return Value(std::string(s, n)); }
        case LUA_TTABLE: {
            index = lua_absindex(L, index);
            Value::Object object; Value::Array array; bool is_array = true; std::size_t max_index = 0, count = 0;
            lua_pushnil(L);
            while (lua_next(L, index) != 0) {
                ++count;
                if (lua_isinteger(L, -2) && lua_tointeger(L, -2) > 0) max_index = (std::max)(max_index, static_cast<std::size_t>(lua_tointeger(L, -2)));
                else is_array = false;
                lua_pop(L, 1);
            }
            if (is_array && max_index == count) {
                array.reserve(count);
                for (std::size_t i = 1; i <= max_index; ++i) { lua_rawgeti(L, index, static_cast<lua_Integer>(i)); auto v = lua_read_value(L, -1, depth + 1); lua_pop(L, 1); if (!v) return std::nullopt; array.push_back(std::move(*v)); }
                return Value(std::move(array));
            }
            lua_pushnil(L);
            while (lua_next(L, index) != 0) {
                if (lua_type(L, -2) != LUA_TSTRING) { lua_pop(L, 2); return std::nullopt; }
                size_t n = 0; const char* key = lua_tolstring(L, -2, &n); auto v = lua_read_value(L, -1, depth + 1);
                if (!v) { lua_pop(L, 2); return std::nullopt; }
                object.emplace(std::string(key, n), std::move(*v)); lua_pop(L, 1);
            }
            return Value(std::move(object));
        }
        default: return std::nullopt;
    }
}

inline int lua_print(lua_State* L) {
    auto* state = static_cast<LuaState*>(lua_touserdata(L, lua_upvalueindex(1)));
    const int count = lua_gettop(L);
    for (int i = 1; i <= count; ++i) {
        if (i > 1) state->output.push_back('\t');
        size_t length = 0; const char* text = luaL_tolstring(L, i, &length);
        state->output.append(text, length); lua_pop(L, 1);
    }
    state->output.push_back('\n'); return 0;
}

inline void lua_timeout_hook(lua_State* L, lua_Debug*) {
    auto* state = *static_cast<LuaState**>(lua_getextraspace(L));
    if (state && std::chrono::steady_clock::now() >= state->deadline) luaL_error(L, "Tiempo maximo de ejecucion excedido (2 segundos).");
}

class LuaEngine {
public:
    LuaEngine() {
        state_.state = luaL_newstate();
        if (!state_.state) throw std::runtime_error("Zafiro Lua: no se pudo crear el estado.");
        *static_cast<LuaState**>(lua_getextraspace(state_.state)) = &state_;
        luaL_openlibs(state_.state);
        lua_pushlightuserdata(state_.state, &state_); lua_pushcclosure(state_.state, lua_print, 1); lua_setglobal(state_.state, "print");
    }
    ~LuaEngine() { if (state_.state) lua_close(state_.state); }
    std::string run(const std::string& code, SharedContext& shared) {
        std::lock_guard<std::mutex> lock(mutex_); state_.shared = &shared; state_.output.clear(); state_.deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
        lua_getglobal(state_.state, "zafiro"); if (!lua_istable(state_.state, -1)) { lua_pop(state_.state, 1); lua_newtable(state_.state); }
        int table = lua_gettop(state_.state);
        for (const auto& item : shared.snapshot()) { lua_push_value(state_.state, item.second); lua_setfield(state_.state, table, item.first.c_str()); }
        lua_setglobal(state_.state, "zafiro");
        lua_sethook(state_.state, lua_timeout_hook, LUA_MASKCOUNT, 10000);
        const int result = luaL_loadbuffer(state_.state, code.data(), code.size(), "<zafiro>");
        const int status = result == LUA_OK ? lua_pcall(state_.state, 0, LUA_MULTRET, 0) : result;
        lua_sethook(state_.state, nullptr, 0, 0);
        if (status != LUA_OK) { size_t n = 0; const char* message = lua_tolstring(state_.state, -1, &n); std::string error = message ? std::string(message, n) : "error desconocido"; lua_pop(state_.state, 1); throw std::runtime_error("Zafiro Lua: " + error); }
        lua_settop(state_.state, 0);
        lua_getglobal(state_.state, "zafiro"); table = lua_gettop(state_.state);
        lua_pushnil(state_.state);
        while (lua_next(state_.state, table) != 0) {
            if (lua_type(state_.state, -2) != LUA_TSTRING) { lua_pop(state_.state, 2); throw std::runtime_error("Zafiro Lua: las claves de zafiro deben ser texto."); }
            size_t n = 0; const char* key = lua_tolstring(state_.state, -2, &n); auto value = lua_read_value(state_.state, -1);
            if (!value) { lua_pop(state_.state, 2); throw std::runtime_error("Zafiro Lua: valor no compatible con JSON."); }
            shared.set(std::string(key, n), std::move(*value)); lua_pop(state_.state, 1);
        }
        lua_settop(state_.state, 0); return state_.output;
    }
private:
    LuaState state_;
    std::mutex mutex_;
};

} // namespace detail

class LuaRuntime {
public:
    LuaRuntime() : engine_(std::make_shared<detail::LuaEngine>()) {}
    std::string run(const std::string& code, SharedContext& context) const { return engine_->run(code, context); }
private:
    std::shared_ptr<detail::LuaEngine> engine_;
};

inline bool register_lua(LanguageHub& hub) {
    auto runtime = std::make_shared<LuaRuntime>();
    return hub.register_language("lua", [runtime](const std::string& code, SharedContext& context) { return runtime->run(code, context); });
}
} // namespace zafiro

#endif // ZAFIRO_LUA_HPP
