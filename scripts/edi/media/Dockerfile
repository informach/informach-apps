FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc-mingw-w64-x86-64-posix g++-mingw-w64-x86-64-posix \
    binutils-mingw-w64-x86-64 mingw-w64-tools nasm yasm pkg-config \
    autoconf automake libtool gettext meson ninja-build cmake python3 xz-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY sources /input/sources
COPY sources.lock.json build.sh cross.meson README.md /input/recipe/
COPY Dockerfile /input/recipe/Dockerfile
ARG BUILD_JOBS=2
ENV JOBS=${BUILD_JOBS}
RUN bash /input/recipe/build.sh prepare
RUN bash /input/recipe/build.sh zlib
RUN bash /input/recipe/build.sh libiconv
RUN bash /input/recipe/build.sh freetype
RUN bash /input/recipe/build.sh fribidi
RUN bash /input/recipe/build.sh harfbuzz
RUN bash /input/recipe/build.sh libunibreak
RUN bash /input/recipe/build.sh libass
RUN bash /input/recipe/build.sh lame
RUN bash /input/recipe/build.sh x264
RUN bash /input/recipe/build.sh libvpx
RUN bash /input/recipe/build.sh dav1d
RUN bash /input/recipe/build.sh nv-codec-headers
RUN bash /input/recipe/build.sh ffmpeg
RUN bash /input/recipe/build.sh package
FROM scratch AS artifacts
COPY --from=builder /output/ /
