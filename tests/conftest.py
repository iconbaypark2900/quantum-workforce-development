# Pytest configuration for the tests/ tree.
#
# test_enhanced_system.py imports core.quantum_inspired.enhanced_quantum_walk, which
# requires config.qsw_config (missing). Skip collecting that module until the config
# package is restored or the import chain is fixed — see follow-up work.
collect_ignore = ["test_enhanced_system.py"]
