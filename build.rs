use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

fn shader(root: &Path, out: &Path, stage: &str) -> Vec<u32> {
    let source = root.join(format!("nova_bridge/shaders/{stage}"));
    let binary = out.join(format!("{stage}.spv"));
    println!("cargo:rerun-if-changed={}", source.display());
    let result = Command::new("glslc")
        .arg(&source)
        .arg("-o")
        .arg(&binary)
        .status()
        .expect("Install glslc to compile Nova shaders");
    assert!(result.success(), "Nova shader compilation failed");
    fs::read(binary)
        .expect("Read compiled shader")
        .as_chunks::<4>()
        .0
        .iter()
        .map(|word| u32::from_le_bytes(*word))
        .collect()
}

fn embed_shaders(root: &Path, out: &Path) {
    let mut header = String::from("#pragma once\n#include <cstdint>\n");
    for (stage, name) in [
        ("scene.vert", "vertex"),
        ("scene.frag", "fragment"),
        ("stroke.vert", "stroke_vertex"),
        ("stroke.frag", "stroke_fragment"),
    ] {
        let words = shader(root, out, stage);
        header.push_str(&format!(
            "inline constexpr uint32_t nova_{name}_shader[] = {{"
        ));
        for word in words {
            header.push_str(&format!("{word},"));
        }
        header.push_str("};\n");
    }
    fs::write(out.join("nova_shaders.h"), header).expect("Write embedded shaders");
}

fn main() {
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_NATIVE");
    if env::var_os("CARGO_FEATURE_NATIVE").is_none() {
        return;
    }
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    embed_shaders(&root, &out);
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++20")
        .include(&out)
        .flag_if_supported("-Wno-missing-field-initializers");
    for source in [
        "Nova.cpp",
        "Scene/window.cpp",
        "Scene/device.cpp",
        "Scene/presentation.cpp",
        "Scene/pipeline.cpp",
        "Scene/buffers.cpp",
        "Scene/render.cpp",
    ] {
        build.file(root.join("extern/Nova").join(source));
    }
    build
        .file(root.join("nova_bridge/nova_visualizer.cpp"))
        .compile("nova_scene");
    for directory in [
        "extern/Nova/Scene",
        "extern/Nova/Nova.h",
        "extern/Nova/Nova.cpp",
        "nova_bridge/nova_visualizer.cpp",
        "nova_bridge/nova_visualizer.h",
    ] {
        println!("cargo:rerun-if-changed={}", root.join(directory).display());
    }
    println!("cargo:rustc-link-lib=SDL2");
    println!("cargo:rustc-link-lib=vulkan");
    println!("cargo:rustc-link-lib=stdc++");
}
