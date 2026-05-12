# Quantum Hybrid Portfolio — Documentation

Welcome to the Quantum Hybrid Portfolio documentation. Guides live under **`docs/`** with subfolders for dashboards, guides, frontend notes, project reference, planning, and misc.

## Master index

**[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** — Complete table of contents (all paths).

## Quick links

| Document | Purpose |
|----------|---------|
| [GETTING_STARTED.md](GETTING_STARTED.md) | Installation and first steps |
| [PUBLIC_DEMO.md](PUBLIC_DEMO.md) | Public demo: hosting, disclaimer, audience |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and data flow |
| [API_REFERENCE.md](API_REFERENCE.md) | Complete API documentation |
| [API_PRODUCT_GUIDE.md](API_PRODUCT_GUIDE.md) | API usage patterns and best practices |
| [DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md) | Dashboard user guide |
| [TECHNICAL_PAPER.md](TECHNICAL_PAPER.md) | Technical background and research |
| [HUGGINGFACE_SPACES.md](HUGGINGFACE_SPACES.md) | Deploying to Hugging Face Spaces |
| [NEXT_STEPS.md](NEXT_STEPS.md) | Development roadmap and tasks |

## Folder layout

```
docs/
├── README.md                 # This file
├── DOCUMENTATION_INDEX.md    # Master index
├── PROJECT_OVERVIEW.md       # High-level product overview
├── TECHNICAL_DOCUMENTATION.md # Technical documentation (companion to project/)
├── GETTING_STARTED.md        # Install & run (canonical)
├── PUBLIC_DEMO.md            # Public demo narrative
├── ARCHITECTURE.md
├── API_REFERENCE.md
├── API_PRODUCT_GUIDE.md
├── DASHBOARD_GUIDE.md        # Dashboard user guide (canonical)
├── TECHNICAL_PAPER.md
├── HUGGINGFACE_SPACES.md
├── NEXT_STEPS.md
├── dashboard/                # Dashboard walkthroughs, summaries, and supplemental READMEs
├── specs/                    # Product specs (e.g. core_features_spec PDF/DOCX)
├── guides/                   # HOW_TO_RUN, QUICKSTART
├── frontend/                 # frontend-guide, ui-design
├── project/                  # DIRECTORY_GUIDE, PROJECT_OVERVIEW, etc.
├── planning/                 # Roadmaps and enhancement docs
└── misc/                     # Supplementary notes
```

## Getting started

1. **[GETTING_STARTED.md](GETTING_STARTED.md)** — Installation, configuration, and running your first optimization
2. **[PUBLIC_DEMO.md](PUBLIC_DEMO.md)** — Public demo: audience, hosting, disclaimer
3. **[DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md)** — Learn to use the interactive dashboard
4. **[examples/](../examples/)** — Run code examples to understand the API

## API documentation

### Reference

- **[API_REFERENCE.md](API_REFERENCE.md)** — Complete endpoint documentation with request/response examples
- **OpenAPI Spec** — Available at `http://localhost:5000/api/docs/openapi` when running the API

### Usage guide

- **[API_PRODUCT_GUIDE.md](API_PRODUCT_GUIDE.md)** — Patterns for integrating the API into your applications
- Authentication, rate limiting, caching strategies
- Error handling and best practices

## Architecture

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — High-level system architecture
- Data flow diagrams
- Component descriptions
- Deployment options

## Technical background

- **[TECHNICAL_PAPER.md](TECHNICAL_PAPER.md)** — Quantum algorithms explained
  - Quantum Stochastic Walks (QSW)
  - Quantum Annealing and QUBO
  - QAOA and VQE
  - Performance benchmarks

## Dashboard

- **[DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md)** — **Canonical** user guide for the React dashboard
- **[dashboard/DASHBOARD_README.md](dashboard/DASHBOARD_README.md)** — Dashboard overview (supplemental to the canonical guide)
- **[frontend/frontend-guide.md](frontend/frontend-guide.md)** / **[frontend/ui-design.md](frontend/ui-design.md)** — Frontend and UI notes

Additional dashboard material lives under **`dashboard/`**; the **canonical** operator guide remains **[DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md)** — see **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)**.

## Deployment

- **[HUGGINGFACE_SPACES.md](HUGGINGFACE_SPACES.md)** — Deploy to Hugging Face Spaces
- **[../docker-compose.yml](../docker-compose.yml)** — Docker Compose configuration
- **[../deploy_production.sh](../deploy_production.sh)** — Production deployment script

## Development

### Roadmap

- **[NEXT_STEPS.md](NEXT_STEPS.md)** — Current development priorities and tasks

### Related documentation

- **[project/DIRECTORY_GUIDE.md](project/DIRECTORY_GUIDE.md)** — Project directory structure
- **[../.env.example](../.env.example)** — Environment variable reference

## Examples

The `examples/` directory contains working code:

- **basic_qsw_example.py** — Basic QSW optimization
- **advanced_quantum_methods.py** — Advanced quantum techniques
- **quantum_integration_example.py** — Quantum integration patterns

## Testing

```bash
pytest tests/
pytest tests/test_api_integration.py
pytest --cov=core --cov=services --cov=api tests/
```

## Support

- **GitHub Issues:** [Report bugs or request features](https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio/issues)
- **Documentation:** Browse this directory or the root [README.md](../README.md)
- **API Health:** `GET /api/health` when running the API

## Contributing

We welcome contributions! See the root [README.md](../README.md) for contribution guidelines.

## License

MIT License — see [../LICENSE](../LICENSE) for details.
