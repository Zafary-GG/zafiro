cmake_minimum_required(VERSION 3.18)
project(zafiro VERSION 0.2.1 LANGUAGES C CXX)

include(CTest)
include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

option(ZAFIRO_WITH_PYTHON "Enable the CPython embedding adapter" OFF)
option(ZAFIRO_WITH_JAVASCRIPT "Enable the QuickJS-NG JavaScript adapter" OFF)
option(ZAFIRO_BUILD_EXAMPLE "Build the basic example" ON)

add_library(zafiro INTERFACE)
add_library(zafiro::zafiro ALIAS zafiro)
target_include_directories(zafiro INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>)
target_compile_features(zafiro INTERFACE cxx_std_17)

set(ZAFIRO_CONFIG_PYTHON ${ZAFIRO_WITH_PYTHON})
set(ZAFIRO_CONFIG_JAVASCRIPT ${ZAFIRO_WITH_JAVASCRIPT})

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

install(TARGETS zafiro EXPORT zafiroTargets)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
install(FILES README.md INSTALL.md LICENSE
    DESTINATION ${CMAKE_INSTALL_DATADIR}/doc/zafiro)
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
