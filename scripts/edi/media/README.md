# Edi native media runtime

FFmpeg and FFprobe are independent command-line programs used by EdiAula. This bundle is built from the exact source archives listed in `build-information/sources.lock.json`. It is distributed under GPLv3, with dependency licenses in `licenses/` and FFmpeg's license in `LICENSE.FFmpeg.txt`.

`Corresponding-Source.tar.xz` contains every original library source archive, the Dockerfile, cross-compilation configuration, complete build recipe, source checksums and toolchain version inventory used for this bundle. Edi does not modify these library sources. The archive is installed beside these programs and may be copied and redistributed under their respective licenses.

To rebuild, extract the source archive, copy `recipe/*` and `sources/` into a new build directory, and run `docker build --output type=local,dest=output .` in that directory. Docker needs network access to the pinned Ubuntu image and Ubuntu package repositories for the compiler. The input hashes are verified before compilation. The FFmpeg configuration and toolchain versions are recorded in `build-information/`.

The Edi application communicates with these programs through their documented command-line interfaces. Licensing terms for this native bundle do not replace the separate terms for Edi.
