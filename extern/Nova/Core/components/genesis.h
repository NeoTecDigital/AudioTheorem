#pragma once

#include <string>
#include <vector>
#include "./vertex.h"

inline std::string getShaderPath(const std::string& name) {
    std::vector<std::string> candidates = {
        name,
        "/home/persist/Auto/extern/Nova/Core/components/shaders/" + name,
        "./extern/Nova/Core/components/shaders/" + name,
        "../extern/Nova/Core/components/shaders/" + name,
        "Core/components/shaders/" + name,
        "../Core/components/shaders/" + name,
        "../../Core/components/shaders/" + name
    };
    for (const auto& p : candidates) {
        FILE* f = fopen(p.c_str(), "rb");
        if (f) {
            fclose(f);
            return p;
        }
    }
    return "/home/persist/Auto/extern/Nova/Core/components/shaders/" + name;
}

const std::string vert_shader = getShaderPath("sq1_v.spv");
const std::string frag_shader = getShaderPath("sq1_f.spv");

namespace genesis {
    std::vector<char> loadFile(const std::string&);
    void createObjects(std::vector<Vertex>*, std::vector<uint32_t>*);
}