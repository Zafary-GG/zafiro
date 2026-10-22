cmake_minimum_required(VERSION 3.24)
project(zafiro VERSION 0.3.0 LANGUAGES C CXX)

include(CTest)
include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

option(ZAFIRO_WITH_PYTHON "Enable the CPython embedding adapter" OFF)
option(ZAFIRO_WITH_JAVASCRIPT "Enable the QuickJS-NG JavaScript adapter" OFF)
option(ZAFIRO_WITH_LUA "Enable the Lua 5.4 adapter" OFF)
option(ZAFIRO_BUILD_EXAMPLE "Build the basic example" ON)
add_library(zafiro INTERFACE)
add_library(zafiro::zafiro ALIAS zafiro)
target_include_directories(zafiro INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>)
target_compile_features(zafiro INTERFACE cxx_std_17)

set(ZAFIRO_CONFIG_PYTHON ${ZAFIRO_WITH_PYTHON})
set(ZAFIRO_CONFIG_JAVASCRIPT ${ZAFIRO_WITH_JAVASCRIPT})
set(ZAFIRO_CONFIG_LUA ${ZAFIRO_WITH_LUA})

if(ZAFIRO_WITH_LUA)
    include(FetchContent)
    if(POLICY CMP0169)
        cmake_policy(SET CMP0169 OLD)
    endif()
    FetchContent_Declare(lua54
        URL https://www.lua.org/ftp/lua-5.4.9.tar.gz
        URL_HASH SHA256=2335b6c582a52654f94612bf10d2f4672805d05329aa6568b1d8cd9e5c6fb8e6
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
    FetchContent_GetProperties(lua54)
    if(NOT lua54_POPULATED)
        FetchContent_Populate(lua54)
    endif()
    file(GLOB LUA_SOURCES CONFIGURE_DEPENDS "${lua54_SOURCE_DIR}/src/*.c")
    list(FILTER LUA_SOURCES EXCLUDE REGEX "/(lua|luac)\\.c$")
    add_library(zafiro_lua_engine STATIC ${LUA_SOURCES})
    target_include_directories(zafiro_lua_engine PUBLIC
        $<BUILD_INTERFACE:${lua54_SOURCE_DIR}/src>
        $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}/zafiro/lua>)
    if(NOT WIN32)
        target_link_libraries(zafiro_lua_engine PUBLIC ${CMAKE_DL_LIBS} m)
    endif()
    add_library(zafiro_lua INTERFACE)
    add_library(zafiro::lua ALIAS zafiro_lua)
    set_target_properties(zafiro_lua PROPERTIES EXPORT_NAME lua)
    target_link_libraries(zafiro_lua INTERFACE zafiro::zafiro zafiro_lua_engine)
    install(TARGETS zafiro_lua_engine zafiro_lua EXPORT zafiroTargets
        ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
        LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
        RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
    install(DIRECTORY "${lua54_SOURCE_DIR}/src/" DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}/zafiro/lua"
        FILES_MATCHING PATTERN "*.h")
endif()

if(BUILD_TESTING)
    add_executable(zafiro_context_tests tests/context_tests.cpp)
    target_link_libraries(zafiro_context_tests PRIVATE zafiro::zafiro)
    add_test(NAME zafiro.shared_context_pipeline COMMAND zafiro_context_tests)
endif()

if(ZAFIRO_WITH_PYTHON)
    find_package(Python3 3.9 COMPONENTS Development.Embed REQUIRED)
    add_library(zafiro_python INTERFACE)
    add_library(zafiro::python ALIAS zafiro_python)
    set_target_properties(zafiro_python PROPERTIES EXPORT_NAME python)
    target_link_libraries(zafiro_python INTERFACE zafiro::zafiro Python3::Python)
    install(TARGETS zafiro_python EXPORT zafiroTargets)
endif()

if(ZAFIRO_WITH_JAVASCRIPT)
    include(FetchContent)
    FetchContent_Declare(quickjs_ng
        GIT_REPOSITORY https://github.com/quickjs-ng/quickjs.git
        GIT_TAG v0.17.0
        GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(quickjs_ng)

    # QuickJS-NG is installed as part of the Zafiro package so consumers do
    # not need to recreate the FetchContent target in their own project.
    add_library(zafiro::qjs ALIAS qjs)
    set_target_properties(qjs PROPERTIES
        INTERFACE_INCLUDE_DIRECTORIES
            "$<BUILD_INTERFACE:${quickjs_ng_SOURCE_DIR}>;$<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}/zafiro/quickjs>")
    install(TARGETS qjs EXPORT zafiroTargets
        ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
        LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
        RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
    install(DIRECTORY "${quickjs_ng_SOURCE_DIR}/"
        DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}/zafiro/quickjs"
        FILES_MATCHING PATTERN "*.h")
    install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/licenses/QuickJS-NG-LICENSE"
        DESTINATION "${CMAKE_INSTALL_DATADIR}/licenses/zafiro")

    add_library(zafiro_javascript INTERFACE)
    add_library(zafiro::javascript ALIAS zafiro_javascript)
    set_target_properties(zafiro_javascript PROPERTIES EXPORT_NAME javascript)
    target_link_libraries(zafiro_javascript INTERFACE zafiro::zafiro zafiro::qjs)
    install(TARGETS zafiro_javascript EXPORT zafiroTargets)
endif()

if(ZAFIRO_WITH_PYTHON AND ZAFIRO_WITH_JAVASCRIPT)
    add_executable(zafiro_multilanguage_example examples/multilanguage.cpp)
    target_link_libraries(zafiro_multilanguage_example PRIVATE zafiro::python zafiro::javascript)
endif()

if(ZAFIRO_WITH_LUA)
    set_target_properties(zafiro_lua_engine PROPERTIES EXPORT_NAME lua_engine)
    option(ZAFIRO_BUILD_LUA_EXAMPLE "Build the Lua adapter example" ON)
    if(ZAFIRO_BUILD_LUA_EXAMPLE)
        add_executable(zafiro_lua_example examples/lua.cpp)
        target_link_libraries(zafiro_lua_example PRIVATE zafiro::lua)
    endif()
    if(BUILD_TESTING)
        add_executable(zafiro_lua_tests tests/lua_adapter_tests.cpp)
        target_link_libraries(zafiro_lua_tests PRIVATE zafiro::lua)
        add_test(NAME zafiro.lua_adapter COMMAND zafiro_lua_tests)
    endif()
endif()

install(TARGETS zafiro EXPORT zafiroTargets)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
install(FILES README.md INSTALL.md LICENSE
    DESTINATION ${CMAKE_INSTALL_DATADIR}/doc/zafiro)
if(ZAFIRO_WITH_LUA)
    install(FILES "${lua54_SOURCE_DIR}/doc/readme.html" DESTINATION "${CMAKE_INSTALL_DATADIR}/licenses/zafiro" RENAME Lua-NOTICE.html)
endif()
install(EXPORT zafiroTargets
    FILE zafiroTargets.cmake
    NAMESPACE zafiro::
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/zafiro)
configure_package_config_file(
    cmake/zafiroConfig.cmake.in
    ${CMAKE_CURRENT_BINARY_DIR}/zafiroConfig.cmake
    INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/zafiro)
write_basic_package_version_file(
    ${CMAKE_CURRENT_BINARY_DIR}/zafiroConfigVersion.cmake
    VERSION ${PROJECT_VERSION}
    COMPATIBILITY SameMajorVersion)
install(FILES
    ${CMAKE_CURRENT_BINARY_DIR}/zafiroConfig.cmake
    ${CMAKE_CURRENT_BINARY_DIR}/zafiroConfigVersion.cmake
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/zafiro)

if(ZAFIRO_BUILD_EXAMPLE)
    add_executable(zafiro_basic examples/basic.cpp)
    target_link_libraries(zafiro_basic PRIVATE zafiro::zafiro)
endif()

if(ZAFIRO_WITH_PYTHON)
    option(ZAFIRO_BUILD_PYTHON_EXAMPLE "Build the CPython adapter example" ON)
    if(ZAFIRO_BUILD_PYTHON_EXAMPLE)
        add_executable(zafiro_python_example examples/python.cpp)
        target_link_libraries(zafiro_python_example PRIVATE zafiro::python)

        add_executable(zafiro_security_log_example examples/security_log_review.cpp)
        target_link_libraries(zafiro_security_log_example PRIVATE zafiro::python)
    endif()

    if(BUILD_TESTING)
        add_executable(zafiro_python_tests tests/python_adapter_tests.cpp)
        target_link_libraries(zafiro_python_tests PRIVATE zafiro::python)
        add_test(NAME zafiro.python_adapter COMMAND zafiro_python_tests)
    endif()
endif()

if(ZAFIRO_WITH_JAVASCRIPT)
    option(ZAFIRO_BUILD_JAVASCRIPT_EXAMPLE "Build the JavaScript adapter example" ON)
    if(ZAFIRO_BUILD_JAVASCRIPT_EXAMPLE)
        add_executable(zafiro_javascript_example examples/javascript.cpp)
        target_link_libraries(zafiro_javascript_example PRIVATE zafiro::javascript)
    endif()

    if(BUILD_TESTING)
        add_executable(zafiro_javascript_tests tests/javascript_adapter_tests.cpp)
        target_link_libraries(zafiro_javascript_tests PRIVATE zafiro::javascript)
        add_test(NAME zafiro.javascript_adapter COMMAND zafiro_javascript_tests)
    endif()
endif()

set(CPACK_PACKAGE_NAME "zafiro")
set(CPACK_PACKAGE_VENDOR "Zafiro contributors")
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Libreria C++17 para combinar runtimes de varios lenguajes")
set(CPACK_PACKAGE_INSTALL_DIRECTORY "Zafiro ${PROJECT_VERSION}")
if(NOT ZAFIRO_PACKAGE_ARCHITECTURE)
    set(ZAFIRO_PACKAGE_ARCHITECTURE "${CMAKE_SYSTEM_PROCESSOR}")
endif()
if(NOT ZAFIRO_PACKAGE_ARCHITECTURE)
    set(ZAFIRO_PACKAGE_ARCHITECTURE "${CMAKE_HOST_SYSTEM_PROCESSOR}")
endif()
if(NOT ZAFIRO_PACKAGE_ARCHITECTURE)
    set(ZAFIRO_PACKAGE_ARCHITECTURE "$ENV{PROCESSOR_ARCHITECTURE}")
endif()
set(CPACK_PACKAGE_FILE_NAME "zafiro-${PROJECT_VERSION}-${CMAKE_SYSTEM_NAME}-${ZAFIRO_PACKAGE_ARCHITECTURE}")
set(CPACK_RESOURCE_FILE_LICENSE "${CMAKE_CURRENT_SOURCE_DIR}/LICENSE")
set(CPACK_GENERATOR "ZIP;TGZ")
include(CPack)
