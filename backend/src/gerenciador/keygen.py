"""Print fresh keys for .env: `uv run python -m gerenciador.keygen`."""

from gerenciador.config import generate_key


def main() -> None:
    print(f"FIELD_ENCRYPTION_KEY={generate_key()}")
    print(f"CPF_LOOKUP_KEY={generate_key()}")


if __name__ == "__main__":
    main()
