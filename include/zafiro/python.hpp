#ifndef ZAFIRO_PYTHON_HPP
#define ZAFIRO_PYTHON_HPP

// Include this adapter only in targets that link against CPython's embedding API.
#include <Python.h>

#include <cstddef>
#include <mutex>
#include <stdexcept>
#include <string>

#include "zafiro.hpp"

namespace zafiro {
namespace detail {

class PyObjectRef {
public:
    explicit PyObjectRef(PyObject* value = nullptr) noexcept : value_(value) {}
    ~PyObjectRef() { Py_XDECREF(value_); }

    PyObjectRef(const PyObjectRef&) = delete;
    PyObjectRef& operator=(const PyObjectRef&) = delete;
    PyObjectRef(PyObjectRef&& other) noexcept : value_(other.release()) {}
    PyObjectRef& operator=(PyObjectRef&& other) noexcept {
        if (this != &other) {
            Py_XDECREF(value_);
            value_ = other.release();
        }
        return *this;
    }

    PyObject* get() const noexcept { return value_; }
    PyObject* release() noexcept {
        PyObject* result = value_;
        value_ = nullptr;
        return result;
    }

private:
    PyObject* value_;
};

class GilGuard {
public:
    GilGuard() : state_(PyGILState_Ensure()) {}
    ~GilGuard() { PyGILState_Release(state_); }

    GilGuard(const GilGuard&) = delete;
    GilGuard& operator=(const GilGuard&) = delete;

private:
    PyGILState_STATE state_;
};

class StreamRestore {
public:
    StreamRestore(PyObject* sys, PyObject* old_stdout, PyObject* old_stderr) noexcept
        : sys_(sys), old_stdout_(old_stdout), old_stderr_(old_stderr) {}
    ~StreamRestore() {
        if (stdout_changed_) PyObject_SetAttrString(sys_, "stdout", old_stdout_);
        if (stderr_changed_) PyObject_SetAttrString(sys_, "stderr", old_stderr_);
        PyErr_Clear();
    }

    void stdout_changed() noexcept { stdout_changed_ = true; }
    void stderr_changed() noexcept { stderr_changed_ = true; }

    StreamRestore(const StreamRestore&) = delete;
    StreamRestore& operator=(const StreamRestore&) = delete;

private:
    PyObject* sys_;
    PyObject* old_stdout_;
    PyObject* old_stderr_;
    bool stdout_changed_ = false;
    bool stderr_changed_ = false;
};

inline std::string unicode_to_string(PyObject* value) {
    if (!value || !PyUnicode_Check(value)) return {};
    Py_ssize_t size = 0;
    const char* utf8 = PyUnicode_AsUTF8AndSize(value, &size);
    if (!utf8) {
        PyErr_Clear();
        return {};
    }
    return std::string(utf8, static_cast<std::size_t>(size));
}

inline std::string capture_value(PyObject* stream) {
    PyObjectRef getter(PyObject_GetAttrString(stream, "getvalue"));
    if (!getter.get()) {
        PyErr_Clear();
        return {};
    }
    PyObjectRef value(PyObject_CallObject(getter.get(), nullptr));
    if (!value.get()) {
        PyErr_Clear();
        return {};
    }
    return unicode_to_string(value.get());
}

inline std::string format_python_exception() {
    PyObject* raw_type = nullptr;
    PyObject* raw_value = nullptr;
    PyObject* raw_traceback = nullptr;
    PyErr_Fetch(&raw_type, &raw_value, &raw_traceback);
    PyErr_NormalizeException(&raw_type, &raw_value, &raw_traceback);
    PyObjectRef type(raw_type);
    PyObjectRef value(raw_value);
    PyObjectRef traceback(raw_traceback);

    PyObjectRef module(PyImport_ImportModule("traceback"));
    PyObjectRef formatter(module.get() ? PyObject_GetAttrString(module.get(), "format_exception") : nullptr);
    PyObjectRef lines(formatter.get() ? PyObject_CallFunctionObjArgs(
        formatter.get(), type.get() ? type.get() : Py_None,
        value.get() ? value.get() : Py_None,
        traceback.get() ? traceback.get() : Py_None, nullptr) : nullptr);
    PyObjectRef separator(PyUnicode_FromString(""));
    PyObjectRef formatted(lines.get() && separator.get()
        ? PyUnicode_Join(separator.get(), lines.get()) : nullptr);

    std::string result = unicode_to_string(formatted.get());
    PyErr_Clear();
    if (!result.empty()) return result;

    if (value.get()) {
        PyObjectRef message(PyObject_Str(value.get()));
        result = unicode_to_string(message.get());
    }
    return result.empty() ? "Error de Python sin detalle." : result;
}

class PythonState {
public:
    PythonState() {
        const bool start_interpreter = Py_IsInitialized() == 0;
        if (start_interpreter) {
            Py_Initialize();
            if (!Py_IsInitialized()) {
                throw std::runtime_error("Zafiro: CPython no pudo inicializarse.");
            }
        }

        {
            GilGuard gil;
            PyObjectRef globals(PyDict_New());
            PyObjectRef module_name(PyUnicode_FromString("__zafiro__"));
            if (!globals.get()) throw std::runtime_error("Zafiro: no se pudo crear el espacio Python.");
            if (!module_name.get() ||
                PyDict_SetItemString(globals.get(), "__builtins__", PyEval_GetBuiltins()) != 0 ||
                PyDict_SetItemString(globals.get(), "__name__", module_name.get()) != 0) {
                throw std::runtime_error("Zafiro: no se pudo preparar el espacio Python.");
            }
            globals_ = globals.release();
        }

        // Py_Initialize leaves the creating thread holding the GIL. Release it so
        // calls from other C++ threads can safely enter through PyGILState_Ensure.
        if (start_interpreter) PyEval_SaveThread();
    }

    std::string run(const std::string& code) {
        if (code.find('\0') != std::string::npos) {
            throw std::invalid_argument("Zafiro Python: el código contiene un byte nulo.");
        }

        std::lock_guard<std::mutex> lock(execution_mutex_);
        GilGuard gil;

        PyObjectRef sys(PyImport_ImportModule("sys"));
        PyObjectRef io(PyImport_ImportModule("io"));
        if (!sys.get() || !io.get()) throw_python_error("Zafiro: no se pudieron cargar sys/io");

        PyObjectRef old_stdout(PyObject_GetAttrString(sys.get(), "stdout"));
        PyObjectRef old_stderr(PyObject_GetAttrString(sys.get(), "stderr"));
        PyObjectRef string_io(PyObject_GetAttrString(io.get(), "StringIO"));
        PyObjectRef captured_stdout(string_io.get() ? PyObject_CallObject(string_io.get(), nullptr) : nullptr);
        PyObjectRef captured_stderr(string_io.get() ? PyObject_CallObject(string_io.get(), nullptr) : nullptr);
        if (!old_stdout.get() || !old_stderr.get() || !captured_stdout.get() || !captured_stderr.get()) {
            throw_python_error("Zafiro: no se pudo preparar la captura de salida");
        }

        StreamRestore restore(sys.get(), old_stdout.get(), old_stderr.get());
        if (PyObject_SetAttrString(sys.get(), "stdout", captured_stdout.get()) != 0) {
            throw_python_error("Zafiro: no se pudo capturar stdout");
        }
        restore.stdout_changed();
        if (PyObject_SetAttrString(sys.get(), "stderr", captured_stderr.get()) != 0) {
            throw_python_error("Zafiro: no se pudo capturar stderr");
        }
        restore.stderr_changed();

        PyObject* result = PyRun_StringFlags(code.c_str(), Py_file_input, globals_, globals_, nullptr);
        const bool failed = result == nullptr;
        Py_XDECREF(result);

        // Preserve the active Python exception before calls used to read stdout/stderr.
        const std::string exception = failed ? format_python_exception() : std::string{};
        const std::string output = capture_value(captured_stdout.get());
        const std::string error_output = capture_value(captured_stderr.get());
        if (failed) {
            throw std::runtime_error("Zafiro Python: " + exception +
                (error_output.empty() ? "" : "\nSalida stderr:\n" + error_output));
        }
        return output + error_output;
    }

    // The process-global state intentionally remains alive until process exit.
    ~PythonState() = default;
    PythonState(const PythonState&) = delete;
    PythonState& operator=(const PythonState&) = delete;

private:
    [[noreturn]] static void throw_python_error(const char* context) {
        const std::string detail = format_python_exception();
        throw std::runtime_error(std::string(context) + ": " + detail);
    }

    std::mutex execution_mutex_;
    PyObject* globals_ = nullptr;
};

inline PythonState& python_state() {
    // CPython is process-global. Keeping this state for the process lifetime avoids
    // unsafe finalization while other C++ or Python threads may still be running.
    static PythonState* state = new PythonState();
    return *state;
}

} // namespace detail

class PythonRuntime {
public:
    std::string run(const std::string& code) const {
        return detail::python_state().run(code);
    }
};

// Convenience function: the hub owns the callback and dispatches "python" snippets.
inline bool register_python(LanguageHub& hub) {
    return hub.register_language("python", [](const std::string& code) {
        return PythonRuntime{}.run(code);
    });
}

} // namespace zafiro

#endif // ZAFIRO_PYTHON_HPP
