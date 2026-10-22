vcpkg_cmake_configure(
    SOURCE_PATH "${CURRENT_PORT_DIR}/../.."
    OPTIONS
        -DZAFIRO_BUILD_EXAMPLE=OFF
        -DBUILD_TESTING=OFF
)
vcpkg_cmake_install()
vcpkg_cmake_config_fixup(CONFIG_PATH lib/cmake/zafiro)
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include" "${CURRENT_PACKAGES_DIR}/debug/share")
file(INSTALL "${CURRENT_PORT_DIR}/../../LICENSE" DESTINATION "${CURRENT_PACKAGES_DIR}/share/${PORT}" RENAME copyright)
