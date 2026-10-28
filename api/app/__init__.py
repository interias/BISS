import tomllib
from pathlib import Path

# The api project is no installed package, so its version is read from pyproject.toml.
VERSION = tomllib.loads(
    (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text(encoding="utf-8")
)["project"]["version"]
