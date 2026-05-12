#!/usr/bin/env python3
"""
Launch the Gradio **lite** UI — same Flask API flows as the Next.js `web/` app (Portfolio Lab + Quantum Engine).

Prereq: API running, e.g. `python -m api` on :5000

  pip install -r deps/requirements-gradio.txt
  python scripts/gradio_portfolio_demo.py

Options:

  python scripts/gradio_portfolio_demo.py --api-url http://127.0.0.1:5000 --port 7861
"""
from __future__ import annotations

import os
import sys

# Resolve `gradio_lite` when invoked as `python scripts/gradio_portfolio_demo.py` from repo root.
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from gradio_lite.app import main

if __name__ == "__main__":
    main()
