from setuptools import setup, find_packages
from pathlib import Path

long_description = ""
readme_path = Path(__file__).parent / "README.md"
if readme_path.exists():
    long_description = readme_path.read_text(encoding="utf-8")

setup(
    name="foodblock",
    version="0.4.0",
    description="SDK for the FoodBlock protocol — a content-addressable primitive for universal food data",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="FoodX",
    author_email="developers@foodx.com",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "cryptography>=41.0.0",
    ],
    license="MIT",
    url="https://github.com/FoodXDevelopment/foodblock",
    project_urls={
        "Homepage": "https://www.foodx.world/developers",
        "Documentation": "https://www.foodx.world/developers",
        "Source": "https://github.com/FoodXDevelopment/foodblock",
    },
    classifiers=[
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
)
