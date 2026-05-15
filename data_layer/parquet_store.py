"""
Parquet store — read/write helpers with deterministic path conventions.

Cache layout under `default_cache_root()`:

    cache/
      prices/
        {provider}/{ticker_hash}/{start}_{end}.parquet
      returns/
        {provider}/{ticker_hash}/{start}_{end}_{kind}.parquet
      features/
        {provider}/{ticker_hash}/{name}.parquet

The store accepts pandas DataFrames for write and returns pandas on read by
default. When polars is installed, callers can request a polars frame instead.
"""
from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, List, Optional, Tuple, Union

# pandas is a hard dep (already in requirements.txt)
import pandas as pd

# Polars / pyarrow are soft deps — degrade to pandas-only when missing.
try:
    import polars as pl  # type: ignore
    _POLARS_AVAILABLE = True
except ImportError:  # pragma: no cover
    pl = None  # type: ignore
    _POLARS_AVAILABLE = False

try:
    import pyarrow  # noqa: F401
    _PYARROW_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PYARROW_AVAILABLE = False


class DataLayerError(RuntimeError):
    """Raised for cache/IO errors that callers should surface, not swallow."""


def default_cache_root() -> Path:
    """
    Return the default cache root.

    Resolution order:
      1. $QHP_CACHE_DIR
      2. $XDG_CACHE_HOME/quantum-hybrid-portfolio
      3. ~/.cache/quantum-hybrid-portfolio    Created lazily; never raises here.
    """
    env = os.environ.get("QHP_CACHE_DIR")
    if env:
        return Path(env).expanduser().resolve()
    xdg = os.environ.get("XDG_CACHE_HOME")
    if xdg:
        return Path(xdg).expanduser().resolve() / "quantum-hybrid-portfolio"
    return Path.home() / ".cache" / "quantum-hybrid-portfolio"


def _ticker_hash(tickers: Iterable[str]) -> str:
    """
    Stable, short hash for a set of tickers.

    Order-independent so the cache key for ['AAPL','MSFT'] matches ['MSFT','AAPL'].
    """
    canonical = ",".join(sorted({t.strip().upper() for t in tickers if t}))
    h = hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]
    return h


@dataclass
class CacheKey:
    """Immutable cache key components."""

    kind: str               # "prices" | "returns" | "features"
    provider: str
    ticker_hash: str
    leaf: str               # filename without extension


class ParquetStore:
    """
    Filesystem-backed Parquet cache.

    Designed for read-mostly workflows: writes are atomic (write-temp-rename),
    reads return a fresh DataFrame each call. Concurrent reads are safe;
    concurrent writes to the *same* leaf may race but the store will only
    publish a complete file.
    """

    KIND_PRICES = "prices"
    KIND_RETURNS = "returns"
    KIND_FEATURES = "features"

    def __init__(self, root: Optional[Union[str, Path]] = None) -> None:
        self.root = Path(root).expanduser().resolve() if root else default_cache_root()

    # ── Capability ──────────────────────────────────────────────────────────

    @property
    def polars_available(self) -> bool:
        return _POLARS_AVAILABLE

    @property
    def pyarrow_available(self) -> bool:
        return _PYARROW_AVAILABLE

    # ── Path resolution ─────────────────────────────────────────────────────

    def key_for_prices(
        self, provider: str, tickers: Iterable[str], start: str, end: str
    ) -> CacheKey:
        return CacheKey(
            kind=self.KIND_PRICES,
            provider=provider,
            ticker_hash=_ticker_hash(tickers),
            leaf=f"{start}_{end}",
        )

    def key_for_returns(
        self, provider: str, tickers: Iterable[str], start: str, end: str, kind: str
    ) -> CacheKey:
        return CacheKey(
            kind=self.KIND_RETURNS,
            provider=provider,
            ticker_hash=_ticker_hash(tickers),
            leaf=f"{start}_{end}_{kind}",
        )

    def key_for_features(
        self, provider: str, tickers: Iterable[str], name: str
    ) -> CacheKey:
        return CacheKey(
            kind=self.KIND_FEATURES,
            provider=provider,
            ticker_hash=_ticker_hash(tickers),
            leaf=name,
        )

    def path_for(self, key: CacheKey) -> Path:
        return self.root / "cache" / key.kind / key.provider / key.ticker_hash / f"{key.leaf}.parquet"

    # ── IO ──────────────────────────────────────────────────────────────────

    def exists(self, key: CacheKey) -> bool:
        return self.path_for(key).is_file()

    def write_dataframe(self, key: CacheKey, df: pd.DataFrame) -> Path:
        """Atomic Parquet write. Creates parent directories as needed."""
        if df is None or len(df) == 0:
            raise DataLayerError(f"Refusing to cache empty DataFrame for {key}")
        target = self.path_for(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + f".tmp-{os.getpid()}-{int(time.time()*1000)}")
        try:
            df.to_parquet(tmp, index=True)
            os.replace(tmp, target)
        except Exception as exc:  # pragma: no cover — IO error surface
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
            raise DataLayerError(f"Failed to write {target}: {exc}") from exc
        return target

    def read_dataframe(
        self,
        key: CacheKey,
        as_polars: bool = False,
    ) -> Union[pd.DataFrame, "pl.DataFrame"]:
        """Read a cached Parquet file. Returns pandas by default, polars on request."""
        path = self.path_for(key)
        if not path.is_file():
            raise DataLayerError(f"Cache miss for {key} at {path}")
        if as_polars:
            if not _POLARS_AVAILABLE:
                raise DataLayerError("polars is not installed; pass as_polars=False")
            return pl.read_parquet(path)
        return pd.read_parquet(path)

    def delete(self, key: CacheKey) -> bool:
        """Remove a single cached file. Returns True if removed."""
        path = self.path_for(key)
        try:
            path.unlink()
            return True
        except FileNotFoundError:
            return False
        except OSError as exc:
            raise DataLayerError(f"Failed to delete {path}: {exc}") from exc

    # ── Listing ─────────────────────────────────────────────────────────────

    def list_keys(self, kind: Optional[str] = None) -> List[Tuple[CacheKey, Path]]:
        """List cached entries (optionally filtered by kind)."""
        root = self.root / "cache"
        if not root.is_dir():
            return []
        out: List[Tuple[CacheKey, Path]] = []
        kinds = [kind] if kind else [self.KIND_PRICES, self.KIND_RETURNS, self.KIND_FEATURES]
        for k in kinds:
            base = root / k
            if not base.is_dir():
                continue
            for provider_dir in base.iterdir():
                if not provider_dir.is_dir():
                    continue
                for hash_dir in provider_dir.iterdir():
                    if not hash_dir.is_dir():
                        continue
                    for file in hash_dir.glob("*.parquet"):
                        out.append(
                            (
                                CacheKey(
                                    kind=k,
                                    provider=provider_dir.name,
                                    ticker_hash=hash_dir.name,
                                    leaf=file.stem,
                                ),
                                file,
                            )
                        )
        return out

    def cache_size_bytes(self) -> int:
        total = 0
        root = self.root / "cache"
        if root.is_dir():
            for p in root.rglob("*.parquet"):
                try:
                    total += p.stat().st_size
                except OSError:
                    continue
        return total
