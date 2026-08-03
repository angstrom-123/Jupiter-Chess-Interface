#pragma once

#include <stacktrace>
#include <string>
class Exception : public std::runtime_error {
public:
    explicit Exception(const std::string& message)
        : std::runtime_error{Format(message, std::stacktrace::current(1))} {}

    explicit Exception(const char *message)
        : std::runtime_error{Format(message, std::stacktrace::current(1))} {}

private:
    static std::string Format(const std::string& message, const std::stacktrace& trace)
    {
        std::stringstream ss;
        ss << message << "\n\n==== C++ Stack Trace ====\n" << trace;
        return ss.str();
    }
};
