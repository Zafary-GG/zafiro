from conan import ConanFile
from conan.tools.cmake import CMake, cmake_layout


class ZafiroRecipe(ConanFile):
    name = "zafiro"
    version = "0.3.0"
    package_type = "header-library"
    license = "MIT"
    url = "https://github.com/Zafary-GG/zafiro"
    description = "C++17 header library for orchestrating embedded language runtimes"
    settings = "os", "compiler", "build_type", "arch"
    options = {"with_python": [True, False], "with_javascript": [True, False], "with_lua": [True, False]}
    default_options = {"with_python": False, "with_javascript": False, "with_lua": False}
    exports_sources = "CMakeLists.txt", "cmake/*", "include/*", "examples/*", "tests/*", "licenses/*", "README.md", "INSTALL.md", "LICENSE"

    def layout(self):
        cmake_layout(self)

    def generate(self):
        from conan.tools.cmake import CMakeDeps, CMakeToolchain
        tc = CMakeToolchain(self)
        tc.variables["ZAFIRO_WITH_PYTHON"] = bool(self.options.with_python)
        tc.variables["ZAFIRO_WITH_JAVASCRIPT"] = bool(self.options.with_javascript)
        tc.variables["ZAFIRO_WITH_LUA"] = bool(self.options.with_lua)
        tc.variables["ZAFIRO_BUILD_EXAMPLE"] = False
        tc.variables["BUILD_TESTING"] = False
        tc.generate()
        CMakeDeps(self).generate()

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def package(self):
        CMake(self).install()

    def package_info(self):
        self.cpp_info.set_property("cmake_file_name", "zafiro")
        self.cpp_info.set_property("cmake_target_name", "zafiro::zafiro")
        self.cpp_info.set_property("cmake_find_mode", "config")
        self.cpp_info.includedirs = ["include"]
        self.cpp_info.builddirs = ["lib/cmake/zafiro"]
