#!/usr/bin/env bash
set -euo pipefail
export TARGET=x86_64-w64-mingw32
export PREFIX=/opt/edi-media
export CC=$TARGET-gcc CXX=$TARGET-g++ AR=$TARGET-ar RANLIB=$TARGET-ranlib STRIP=$TARGET-strip WINDRES=$TARGET-windres
export PKG_CONFIG_LIBDIR=$PREFIX/lib/pkgconfig
export CPPFLAGS="-I$PREFIX/include -D_WIN32_WINNT=0x0A00"
export CFLAGS='-O2' CXXFLAGS='-O2'
export LDFLAGS="-L$PREFIX/lib -static"
JOBS=${JOBS:-2}
name=$1
if [[ $name == prepare ]]; then
  mkdir -p /build /output/bin /output/licenses /output/build-information "$PREFIX"
  python3 - <<'PY'
import hashlib,json,pathlib,tarfile
for item in json.load(open('/input/recipe/sources.lock.json')):
    path=pathlib.Path('/input/sources')/item['file']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256'], item['name']
    target=pathlib.Path('/build')/item['name']; target.mkdir()
    with tarfile.open(path) as archive:
        members=archive.getmembers()
        for member in members:
            parts=pathlib.PurePosixPath(member.name).parts
            if len(parts)<2: continue
            member.name='/'.join(parts[1:])
            archive.extract(member,target,filter='data')
PY
  dpkg-query -W > /output/build-information/toolchain-packages.txt
  mkdir -p /output/licenses/toolchain
  cp /usr/share/doc/gcc-13-base/copyright /output/licenses/toolchain/compiler-COPYRIGHT
  cp /usr/share/doc/mingw-w64-common/copyright /output/licenses/toolchain/mingw-COPYRIGHT
  cp /input/recipe/sources.lock.json /output/build-information/
  exit
fi
if [[ $name == package ]]; then
  cp /build/ffmpeg/COPYING.GPLv3 /output/LICENSE.FFmpeg.txt
  for source in /build/*; do
    component=$(basename "$source")
    mkdir -p "/output/licenses/$component"
    find "$source" -maxdepth 3 -type f \( -iname '*license*' -o -iname 'copying*' -o -iname 'notice*' \) -print0 |
      while IFS= read -r -d '' license; do
        relative=${license#"$source/"}; destination="/output/licenses/$component/$relative"
        mkdir -p "$(dirname "$destination")"; cp "$license" "$destination"
      done
  done
  cp /build/ffmpeg/ffbuild/config.mak /output/build-information/ffmpeg-config.mak
  cp /input/recipe/README.md /output/README.md
  # This is the complete source input and exact recipes used for these binaries.
  # Sources travel with the installer, independently of any upstream URL lifetime.
  tar -cJf /output/Corresponding-Source.tar.xz -C /input sources recipe -C /output build-information
  (cd /output && find bin -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
  exit
fi
cd "/build/$name"
case "$name" in
  zlib)
    CHOST="$TARGET" ./configure --static --prefix="$PREFIX"
    make -j"$JOBS"; make install ;;
  libiconv)
    ./configure --host="$TARGET" --prefix="$PREFIX" --disable-shared --enable-static --disable-nls
    make -j"$JOBS"; make install ;;
  freetype)
    ./configure --host="$TARGET" --prefix="$PREFIX" --disable-shared --enable-static --with-zlib=yes --with-bzip2=no --with-png=no --with-harfbuzz=no --with-brotli=no
    make -j"$JOBS"; make install ;;
  fribidi)
    meson setup build --cross-file=/input/recipe/cross.meson --prefix="$PREFIX" --libdir=lib --default-library=static --buildtype=release -Ddocs=false -Dtests=false -Dbin=false
    ninja -C build -j"$JOBS"; ninja -C build install ;;
  harfbuzz)
    meson setup build --cross-file=/input/recipe/cross.meson --prefix="$PREFIX" --libdir=lib --default-library=static --buildtype=release -Dglib=disabled -Dgobject=disabled -Dcairo=disabled -Dicu=disabled -Dgraphite2=disabled -Dfreetype=enabled -Dtests=disabled -Ddocs=disabled -Dutilities=disabled -Dintrospection=disabled -Dsubset=disabled
    ninja -C build -j"$JOBS"; ninja -C build install ;;
  libunibreak)
    ./configure --host="$TARGET" --prefix="$PREFIX" --disable-shared --enable-static
    make -j"$JOBS"; make install ;;
  libass)
    meson setup build --cross-file=/input/recipe/cross.meson --prefix="$PREFIX" --libdir=lib --default-library=static --buildtype=release -Dtest=disabled -Dcompare=disabled -Dprofile=disabled -Dfuzz=disabled -Dcheckasm=disabled -Dfontconfig=disabled -Ddirectwrite=enabled -Dasm=enabled -Dlibunibreak=enabled
    ninja -C build -j"$JOBS"; ninja -C build install ;;
  lame)
    ./configure --host="$TARGET" --prefix="$PREFIX" --disable-shared --enable-static --disable-frontend --disable-decoder
    make -j"$JOBS"; make install ;;
  x264)
    ./configure --host="$TARGET" --cross-prefix="$TARGET-" --prefix="$PREFIX" --enable-static --disable-cli --disable-lavf --disable-swscale
    make -j"$JOBS"; make install ;;
  libvpx)
    CROSS="$TARGET-" ./configure --target=x86_64-win64-gcc --prefix="$PREFIX" --disable-shared --enable-static --disable-examples --disable-tools --disable-docs --disable-unit-tests --enable-vp9-highbitdepth
    make -j"$JOBS"; make install ;;
  dav1d)
    meson setup build --cross-file=/input/recipe/cross.meson --prefix="$PREFIX" --libdir=lib --default-library=static --buildtype=release -Denable_tools=false -Denable_tests=false
    ninja -C build -j"$JOBS"; ninja -C build install ;;
  nv-codec-headers)
    make PREFIX="$PREFIX" install ;;
  amf)
    # Headers only: the AMD runtime ships with the graphics driver and is loaded on demand.
    mkdir -p "$PREFIX/include"; cp -R AMF "$PREFIX/include/AMF"
    # The MIT notice lives inside each header; keep a copy beside the other component licenses.
    sed -n '1,/^\/\/ THE SOFTWARE\.$/p' AMF/core/Version.h | sed -E 's|^// ?||' > LICENSE.txt
    grep -q 'MIT license' LICENSE.txt ;;
  ffmpeg)
    # arnndn rounds GRU input widths up to four floats. Its stack inputs must have
    # zero padding: zero weights do not neutralize an uninitialized NaN (0 * NaN).
    # Keep the source patch in the corresponding-source recipe and reject drift.
    python3 - <<'PY'
import pathlib
path = pathlib.Path('libavfilter/af_arnndn.c')
source = path.read_text()
before = '''    LOCAL_ALIGNED_32(float, dense_out,     [MAX_NEURONS]);
    LOCAL_ALIGNED_32(float, noise_input,   [MAX_NEURONS * 3]);
    LOCAL_ALIGNED_32(float, denoise_input, [MAX_NEURONS * 3]);

    compute_dense(rnn->model->input_dense, dense_out, input);'''
after = before.replace('    compute_dense(', '''    RNN_CLEAR(dense_out, MAX_NEURONS);
    RNN_CLEAR(noise_input, MAX_NEURONS * 3);
    RNN_CLEAR(denoise_input, MAX_NEURONS * 3);

    compute_dense(''')
assert source.count(before) == 1, 'FFmpeg arnndn input context changed'
path.write_text(source.replace(before, after))
PY
    ./configure --prefix="$PREFIX" --target-os=mingw32 --arch=x86_64 --enable-cross-compile --cross-prefix="$TARGET-" \
      --pkg-config=pkg-config --pkg-config-flags=--static --extra-cflags="$CPPFLAGS" --extra-ldflags="$LDFLAGS" \
      --extra-libs='-lstdc++ -lpthread' --disable-autodetect --disable-shared --enable-static --disable-debug --disable-doc --disable-ffplay \
      --enable-gpl --enable-version3 --enable-zlib --enable-iconv --enable-schannel --enable-libx264 --enable-libvpx --enable-libmp3lame \
      --enable-libass --enable-libfreetype --enable-libharfbuzz --enable-libfribidi --enable-libdav1d --enable-ffnvcodec --enable-nvenc --enable-nvdec --enable-cuvid --enable-d3d11va --enable-dxva2 \
      --enable-mediafoundation --enable-amf
    make -j"$JOBS"; cp ffmpeg.exe ffprobe.exe /output/bin/ ;;
  *) echo "Unknown source component: $name" >&2; exit 1 ;;
esac
