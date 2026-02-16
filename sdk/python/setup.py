from setuptools import setup, find_packages

setup(
    name="foodblock",
    version="0.1.0",
    description="SDK for the FoodBlock protocol — a content-addressable primitive for universal food data",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "cryptography>=41.0.0",
    ],
    license="MIT",
    url="https://github.com/FoodXDevelopment/foodblock",
    classifiers=[
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
    ],
)
