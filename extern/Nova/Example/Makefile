VULKAN_SDK_PATH = /usr/include/vulkan
STB_PATH = /usr/include/stb
TINYOBJ_PATH = ../Core/external/tinyobj/
VK_EXP_PATH = /etc/vulkan/explicit_layer.d

CFLAGS = -std=c++20 -I $(VULKAN_SDK_PATH) -I $(STB_PATH) -I $(TINYOBJ_PATH) -I ../Core/components/extern/fastgltf/include
LDFLAGS = -L $(VULKAN_SDK_PATH) -lSDL2 -lvulkan -lsimdjson -ldl -pthread 
DBFLAGS = -fsanitize=address,undefined --debug
INCLUDES = ../*.cpp ../*/*.cpp ../*/*/*.cpp ../*/*/*/*.cpp ../Core/components/extern/fastgltf/src/*.cpp 

all: clean compute 
	./compute

compute: main.cpp
	g++ $(CFLAGS) -o compute $(LDFLAGS) $(INCLUDES)

.PHONY: test clean

debug:
	g++ $(CFLAGS) -o compute $(LDFLAGS) $(INCLUDES) $(DBFLAGS)

test: compute
	LD_LIBRARY_PATH=$(VULKAN_SDK_PATH) VK_LAYER_PATH=$(VK_EXP_PATH) ./compute

clean:
	rm -f compute
