#!/usr/bin/env bash
set -eux

function test_project() {
    ./e2e/generate.cjs $1 
    cd e2e/$1
    cargo check --all-features
    cd ../..
}

function test_project_with_tests() {
    ./e2e/generate.cjs $1
    cd e2e/$1
    cargo test --all-features
    cd ../..
}

function test_anchor_project() {
    ./e2e/generate-anchor.cjs $1
    cd e2e/$1
    cargo test --all-features
    cd ../..
}

test_project dummy
test_project system
test_project memo
test_project governance
test_project_with_tests event-collision
# test_anchor_project meteora  # blocked: idl.json has no top-level `address`, so programs.rs emits address!("") which fails const-eval
test_anchor_project anchor
test_anchor_project raydium-cpmm
test_anchor_project raydium-launchpad