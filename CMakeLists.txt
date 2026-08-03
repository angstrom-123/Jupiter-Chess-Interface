cmake_minimum_required(VERSION 3.12)
project(jupiter VERSION 0.0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(CMAKE_CXX_FLAGS "-Wall -Wextra")
set(CMAKE_CXX_FLAGS_DEBUG "-g")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

find_package(Python3 COMPONENTS Development REQUIRED)

set(SOURCES
    engine/src/bitboard.cpp 
    engine/src/board.cpp 
    engine/src/move.cpp
    engine/src/core.cpp 
    engine/src/searcher.cpp
    engine/src/evaluator.cpp
    engine/src/attackTable.cpp
    engine/src/boardState.cpp
    engine/src/movegen.cpp
    engine/src/pieceSquareTable.cpp
    engine/src/zobrist.cpp
    engine/src/rng.cpp
    engine/src/transpositionTable.cpp
    engine/src/history.cpp
    engine/src/pythonModule.cpp
)

add_library(jupiter SHARED ${SOURCES})

target_include_directories(jupiter 
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/include>
        $<INSTALL_INTERFACE:include>
    PRIVATE
        ${Python3_INCLUDE_DIRS}
        ${CMAKE_CURRENT_SOURCE_DIR}/engine/src
)

# Link in stack trace library per compiler
if (CMAKE_CXX_COMPILER_ID MATCHES "GNU")
    target_link_libraries(jupiter PRIVATE stdc++_libbacktrace)
elseif (CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    target_compile_options(jupiter PRIVATE -stdlib=libstdc++)
    target_link_options(jupiter PRIVATE -stdlib=libstdc++)
    target_link_libraries(jupiter PRIVATE stdc++_libbacktrace dl backtrace)
elseif (MSVC)
    target_link_libraries(jupiter PRIVATE dbghelp)
endif()

target_link_libraries(jupiter PRIVATE ${Python3_LIBRARIES})

target_compile_options(jupiter PRIVATE -msse4.2 -mpopcnt)

if(WIN32)
    set_target_properties(jupiter PROPERTIES SUFFIX ".pyd")
else()
    set_target_properties(jupiter PROPERTIES SUFFIX ".so")
endif()

set(PACKAGE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/build/libjupiter")
file(MAKE_DIRECTORY ${PACKAGE_DIR})

set_target_properties(jupiter PROPERTIES 
    LIBRARY_OUTPUT_DIRECTORY ${PACKAGE_DIR}
    RUNTIME_OUTPUT_DIRECTORY ${PACKAGE_DIR}
)

if(NOT EXISTS "${PACKAGE_DIR}/__init__.py")
    file(WRITE "${PACKAGE_DIR}/__init__.py" "from .libjupiter import *")
endif()

message(STATUS "Python module will be built as: $<TARGET_FILE_NAME:jupiter>")
