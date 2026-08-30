"""Pathless exact-input reader for isolated Firefly Hermes attempts."""

from .reader import READ_SOURCE_SCHEMA, read_source


def register(ctx):
    """Expose only the manifest-bound reader in its dedicated toolset."""
    ctx.register_tool(
        name="firefly_read_source",
        toolset="firefly-source-read",
        schema=READ_SOURCE_SCHEMA,
        handler=read_source,
        max_result_size_chars=5_000_000,
    )
