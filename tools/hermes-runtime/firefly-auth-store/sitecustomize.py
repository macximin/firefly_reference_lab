"""Fail-closed bootstrap routing for Firefly's ephemeral Hermes capsule.

The capsule keeps HERMES_HOME in system temp so prompts, tool results, and
session state cannot persist into a Soul profile. Provider-owned credential
lifecycle and auth state remain in the authoritative global auth.json.
Python loads this module before the delegated Hermes entrypoint; it disables
ambient dotenv/external-secret loading, redirects Hermes's central auth-store
helpers, and leaves every other profile path ephemeral.
"""

from __future__ import annotations

import os
import stat
import sys
from pathlib import Path


CONTRACT = "hermes-global-auth-store-adapter/v1"
STORE_ENV = "FIREFLY_HERMES_AUTH_STORE"
CONTRACT_ENV = "FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT"
READY_ENV = "FIREFLY_HERMES_AUTH_ADAPTER_READY"
CAPSULE_HOME_ENV = "FIREFLY_HERMES_CAPSULE_HOME"

_AUTH_CONSUMER_BINDINGS = {
    "_load_auth_store": ("_auth_file_path",),
    "_save_auth_store": ("_auth_file_path",),
    "_load_global_auth_store": ("_global_auth_file_path",),
    "_recover_codex_tokens_from_cli": ("_import_codex_cli_tokens",),
    "_read_codex_tokens": ("_load_auth_store", "_load_provider_state"),
    "read_credential_pool": ("_load_auth_store", "_load_global_auth_store"),
    "write_credential_pool": ("_load_auth_store", "_save_auth_store"),
    "resolve_codex_runtime_credentials": (
        "_read_codex_tokens",
        "_recover_codex_tokens_from_cli",
    ),
}

_CREDENTIAL_POOL_AUTH_BINDINGS = (
    "_auth_store_lock",
    "_codex_access_token_is_expiring",
    "_decode_jwt_claims",
    "_load_auth_store",
    "_load_provider_state",
    "_resolve_kimi_base_url",
    "_resolve_zai_base_url",
    "_save_auth_store",
    "_save_provider_state",
    "_store_provider_state",
    "read_credential_pool",
    "write_credential_pool",
)


def _abort() -> None:
    try:
        sys.stderr.write("Firefly Hermes auth-store adapter failed closed.\n")
        sys.stderr.flush()
    finally:
        os._exit(78)


def _require_callable(module: object, name: str) -> object:
    value = getattr(module, name, None)
    if not callable(value):
        _abort()
    return value


def _require_consumer_binding(
    module: object,
    function: object,
    names: tuple[str, ...],
) -> None:
    code = getattr(function, "__code__", None)
    namespace = getattr(module, "__dict__", None)
    if (
        code is None
        or not set(names).issubset(code.co_names)
        or getattr(function, "__globals__", None) is not namespace
    ):
        _abort()


def _validate_adapter_origin() -> None:
    raw_pythonpath = os.environ.get("PYTHONPATH", "")
    adapter_file = Path(__file__)
    adapter_root = Path(raw_pythonpath)
    if (
        not raw_pythonpath
        or os.pathsep in raw_pythonpath
        or not adapter_root.is_absolute()
        or str(adapter_root) != raw_pythonpath
        or str(adapter_root) != os.path.abspath(raw_pythonpath)
        or adapter_file != adapter_root / "sitecustomize.py"
    ):
        _abort()
    try:
        resolved_root = adapter_root.resolve(strict=True)
        resolved_file = adapter_file.resolve(strict=True)
        root_info = os.lstat(adapter_root)
        file_info = os.lstat(adapter_file)
    except OSError:
        _abort()
        return
    current_uid = os.getuid() if hasattr(os, "getuid") else file_info.st_uid
    if (
        resolved_root != adapter_root
        or resolved_file != adapter_file
        or not stat.S_ISDIR(root_info.st_mode)
        or stat.S_IMODE(root_info.st_mode) != 0o700
        or root_info.st_uid != current_uid
        or not stat.S_ISREG(file_info.st_mode)
        or stat.S_IMODE(file_info.st_mode) != 0o600
        or file_info.st_nlink != 1
        or file_info.st_uid != current_uid
    ):
        _abort()


def _install() -> None:
    os.environ.pop(READY_ENV, None)
    raw_store = os.environ.get(STORE_ENV, "").strip()
    raw_contract = os.environ.get(CONTRACT_ENV, "").strip()
    raw_capsule_home = os.environ.get(CAPSULE_HOME_ENV, "").strip()
    if not raw_store and not raw_contract and not raw_capsule_home:
        return
    if not raw_store or raw_contract != CONTRACT or not raw_capsule_home:
        _abort()

    _validate_adapter_origin()

    store = Path(raw_store)
    capsule_home = Path(raw_capsule_home)
    if (
        not store.is_absolute()
        or str(store) != os.path.abspath(raw_store)
        or not capsule_home.is_absolute()
        or str(capsule_home) != os.path.abspath(raw_capsule_home)
        or os.environ.get("HERMES_HOME", "") != raw_capsule_home
    ):
        _abort()
    try:
        resolved = store.resolve(strict=True)
        info = os.lstat(store)
        root_info = os.lstat(store.parent)
        resolved_capsule_home = capsule_home.resolve(strict=True)
        capsule_info = os.lstat(capsule_home)
    except OSError:
        _abort()
        return
    current_uid = os.getuid() if hasattr(os, "getuid") else info.st_uid
    if (
        resolved != store
        or resolved_capsule_home != capsule_home
        or not stat.S_ISREG(info.st_mode)
        or stat.S_IMODE(info.st_mode) != 0o600
        or info.st_nlink != 1
        or info.st_uid != current_uid
        or not stat.S_ISDIR(root_info.st_mode)
        or stat.S_IMODE(root_info.st_mode) != 0o700
        or root_info.st_uid != current_uid
        or not stat.S_ISDIR(capsule_info.st_mode)
        or stat.S_IMODE(capsule_info.st_mode) != 0o700
        or capsule_info.st_uid != current_uid
    ):
        _abort()

    try:
        import hermes_cli.auth as hermes_auth
        import hermes_cli.env_loader as env_loader
    except BaseException:
        _abort()
        return

    for hook_name in (
        "_auth_file_path",
        "_global_auth_file_path",
        "_import_codex_cli_tokens",
    ):
        _require_callable(hermes_auth, hook_name)
    _require_callable(env_loader, "load_hermes_dotenv")
    for consumer_name, required_names in _AUTH_CONSUMER_BINDINGS.items():
        consumer = _require_callable(hermes_auth, consumer_name)
        _require_consumer_binding(hermes_auth, consumer, required_names)

    def _firefly_auth_file_path() -> Path:
        return store

    def _disable_ambient_environment_loading(
        *_args: object,
        **_kwargs: object,
    ) -> list[Path]:
        return []

    def _disable_codex_cli_import() -> None:
        return None

    def _disable_global_auth_file_path() -> None:
        return None

    hermes_auth._auth_file_path = _firefly_auth_file_path
    hermes_auth._global_auth_file_path = _disable_global_auth_file_path
    hermes_auth._import_codex_cli_tokens = _disable_codex_cli_import
    env_loader.load_hermes_dotenv = _disable_ambient_environment_loading

    try:
        import agent.credential_pool as credential_pool
        import hermes_cli.main as hermes_main
    except BaseException:
        _abort()
        return

    if credential_pool.auth_mod is not hermes_auth:
        _abort()
    for binding_name in _CREDENTIAL_POOL_AUTH_BINDINGS:
        auth_binding = _require_callable(hermes_auth, binding_name)
        if getattr(credential_pool, binding_name, None) is not auth_binding:
            _abort()
    load_pool = _require_callable(credential_pool, "load_pool")
    _require_consumer_binding(
        credential_pool,
        load_pool,
        ("read_credential_pool", "_load_auth_store", "write_credential_pool"),
    )
    if getattr(hermes_main, "load_hermes_dotenv", None) is not _disable_ambient_environment_loading:
        _abort()
    if (
        hermes_auth._auth_file_path is not _firefly_auth_file_path
        or hermes_auth._global_auth_file_path is not _disable_global_auth_file_path
        or hermes_auth._import_codex_cli_tokens is not _disable_codex_cli_import
        or env_loader.load_hermes_dotenv is not _disable_ambient_environment_loading
        or hermes_auth._auth_file_path() != store
        or hermes_auth._global_auth_file_path() is not None
        or hermes_auth._import_codex_cli_tokens() is not None
        or env_loader.load_hermes_dotenv(project_env=store.parent / ".forbidden") != []
        or os.environ.get("HERMES_HOME", "") != raw_capsule_home
    ):
        _abort()
    os.environ[READY_ENV] = CONTRACT


try:
    _install()
except BaseException:
    _abort()
