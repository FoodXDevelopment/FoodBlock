"""Build the Rust core (../rust, the C ABI as a shared library) into the package, so `pip install .` is one step.
Needs a Rust toolchain (cargo). To skip, set FOODBLOCK_LIB at run time to a library you built yourself."""

import os
import shutil
import subprocess
import sys

from setuptools import Distribution, setup
from setuptools.command.build_py import build_py

CORE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rust")
NAME = {"darwin": "libfoodblock.dylib", "win32": "foodblock.dll"}.get(sys.platform, "libfoodblock.so")


class BuildWithCore(build_py):
    def run(self):
        if os.path.isdir(CORE):
            subprocess.check_call(["cargo", "rustc", "--locked", "--release", "--features", "ffi", "--crate-type", "cdylib"], cwd=CORE)
            package = os.path.join(os.path.dirname(os.path.abspath(__file__)), "foodblock")
            shutil.copy(os.path.join(CORE, "target", "release", NAME), os.path.join(package, NAME))
        super().run()


class BinaryDistribution(Distribution):
    """The wheel carries a native library, so it is a platform wheel (never tagged py3-none-any)."""

    def has_ext_modules(self):
        return True


setup(cmdclass={"build_py": BuildWithCore}, distclass=BinaryDistribution)
