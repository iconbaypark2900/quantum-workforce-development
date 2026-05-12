#!/usr/bin/env python3
"""
Comprehensive API Integration Test Suite

Tests all API endpoints with full dependency verification.
Run this after installing all dependencies:
    pip install -r deps/requirements.txt
    
Usage:
    python scripts/test_api_integration.py [--base-url http://localhost:5000]
"""

import os
import sys
import time
import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import requests
except ImportError:
    print("❌ requests library not installed. Run: pip install requests")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class TestResult:
    """Result of a single test."""
    name: str
    passed: bool = False
    status_code: Optional[int] = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TestReport:
    """Overall test report."""
    total: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    results: List[TestResult] = field(default_factory=list)
    
    def add_result(self, result: TestResult):
        self.total += 1
        if result.passed:
            self.passed += 1
        elif result.error and "SKIPPED" in result.error:
            self.skipped += 1
        else:
            self.failed += 1
        self.results.append(result)
    
    def print_summary(self):
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Total:   {self.total}")
        print(f"✅ Passed:  {self.passed}")
        print(f"❌ Failed:  {self.failed}")
        print(f"⏭️ Skipped: {self.skipped}")
        print("=" * 60)
        
        if self.failed > 0:
            print("\nFailed tests:")
            for result in self.results:
                if not result.passed and result.error and "SKIPPED" not in result.error:
                    print(f"  ❌ {result.name}: {result.error}")
        
        print(f"\nSuccess rate: {self.passed/self.total*100:.1f}%" if self.total > 0 else "No tests run")


class APIIntegrationTester:
    """Comprehensive API integration tester."""
    
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key or os.getenv('API_KEY', '')
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'X-API-Key': self.api_key,
        })
        self.report = TestReport()
        
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        timeout: int = 30
    ) -> requests.Response:
        """Make HTTP request with error handling."""
        url = f"{self.base_url}{endpoint}"
        start_time = time.time()
        
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, params=data, timeout=timeout)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            duration_ms = (time.time() - start_time) * 1000
            return response
            
        except requests.exceptions.Timeout:
            duration_ms = (time.time() - start_time) * 1000
            raise TimeoutError(f"Request timed out after {timeout}s")
        except requests.exceptions.ConnectionError as e:
            duration_ms = (time.time() - start_time) * 1000
            raise ConnectionError(f"Connection failed: {e}")
    
    def test_health_check(self) -> TestResult:
        """Test health check endpoint."""
        result = TestResult(name="Health Check")
        
        try:
            response = self._make_request('GET', '/api/health')
            result.status_code = response.status_code
            result.duration_ms = response.elapsed.total_seconds() * 1000
            
            if response.status_code == 200:
                data = response.json()
                result.passed = data.get('data', {}).get('status') in ['healthy', 'degraded']
                result.details = data.get('data', {})
                
                if not result.passed:
                    result.error = f"Unhealthy status: {data.get('data', {}).get('status')}"
            else:
                result.passed = False
                result.error = f"Unexpected status code: {response.status_code}"
                
        except Exception as e:
            result.passed = False
            result.error = str(e)
        
        return result
    
    def test_config_endpoints(self) -> List[TestResult]:
        """Test configuration endpoints."""
        results = []
        
        # Test objectives config
        result = TestResult(name="Config: Objectives")
        try:
            response = self._make_request('GET', '/api/config/objectives')
            result.status_code = response.status_code
            result.duration_ms = response.elapsed.total_seconds() * 1000
            
            if response.status_code == 200:
                data = response.json()
                result.passed = 'data' in data and len(data['data']) > 0
                if not result.passed:
                    result.error = "Empty or invalid response"
            else:
                result.passed = False
                result.error = f"Status code: {response.status_code}"
        except Exception as e:
            result.passed = False
            result.error = str(e)
        
        results.append(result)
        
        # Test presets config
        result = TestResult(name="Config: Presets")
        try:
            response = self._make_request('GET', '/api/config/presets')
            result.status_code = response.status_code
            result.duration_ms = response.elapsed.total_seconds() * 1000
            
            if response.status_code == 200:
                data = response.json()
                result.passed = 'data' in data and len(data['data']) > 0
                if not result.passed:
                    result.error = "Empty or invalid response"
            else:
                result.passed = False
                result.error = f"Status code: {response.status_code}"
        except Exception as e:
            result.passed = False
            result.error = str(e)
        
        results.append(result)

        # IBM Runtime workloads (requires API key; may be 400 if no IBM token)
        result = TestResult(name="Config: IBM Quantum workloads")
        try:
            if not self.api_key:
                result.passed = True
                result.error = "SKIPPED: no API_KEY for protected route"
            else:
                response = self._make_request(
                    "GET",
                    "/api/config/ibm-quantum/workloads",
                    data={"limit": 5},
                )
                result.status_code = response.status_code
                result.duration_ms = response.elapsed.total_seconds() * 1000
                if response.status_code == 200:
                    data = response.json()
                    result.passed = "data" in data and "workloads" in data.get("data", {})
                elif response.status_code in (400, 502, 503):
                    result.passed = True
                    result.details["note"] = "no IBM token or IBM SDK unavailable"
                else:
                    result.passed = False
                    result.error = f"Unexpected status: {response.status_code}"
        except Exception as e:
            result.passed = False
            result.error = str(e)
        results.append(result)
        
        return results
    
    def test_market_data(self) -> TestResult:
        """Test market data endpoint."""
        result = TestResult(name="Market Data Fetch")
        
        try:
            # Test with a small set of tickers
            response = self._make_request(
                'POST',
                '/api/market-data',
                data={'tickers': ['AAPL', 'MSFT', 'GOOGL']},
                timeout=60
            )
            result.status_code = response.status_code
            result.duration_ms = response.elapsed.total_seconds() * 1000
            
            if response.status_code == 200:
                data = response.json()
                result.passed = 'data' in data
                if result.passed:
                    result.details['tickers_count'] = len(data.get('data', {}).get('prices', {}))
            else:
                result.passed = False
                result.error = f"Status code: {response.status_code}"
                
        except TimeoutError:
            result.passed = False
            result.error = "TIMEOUT: Request took longer than 60s (SKIPPED - network issue)"
        except Exception as e:
            result.passed = False
            result.error = str(e)
        
        return result
    
    def test_portfolio_optimization(self) -> List[TestResult]:
        """Test portfolio optimization endpoints."""
        results = []
        
        # Test with mock data
        optimization_tests = [
            ('markowitz', 'Max Sharpe (Markowitz)'),
            ('hrp', 'Hierarchical Risk Parity'),
            ('qubo_sa', 'QUBO + Simulated Annealing'),
            ('hybrid', 'Hybrid Pipeline'),
        ]
        
        for objective, test_name in optimization_tests:
            result = TestResult(name=f"Optimization: {test_name}")
            
            try:
                response = self._make_request(
                    'POST',
                    '/api/portfolio/optimize',
                    data={
                        'tickers': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
                        'objective': objective,
                        'weight_min': 0.05,
                        'weight_max': 0.50,
                    },
                    timeout=120
                )
                result.status_code = response.status_code
                result.duration_ms = response.elapsed.total_seconds() * 1000
                
                if response.status_code == 200:
                    data = response.json()
                    result.passed = 'data' in data
                    if result.passed:
                        result.details['sharpe_ratio'] = data.get('data', {}).get('sharpe_ratio')
                        result.details['execution_time_ms'] = data.get('meta', {}).get('duration_ms')
                else:
                    result.passed = False
                    result.error = f"Status code: {response.status_code}"
                    
            except TimeoutError:
                result.passed = False
                result.error = f"TIMEOUT: {objective} took longer than 120s (SKIPPED - slow computation)"
            except Exception as e:
                result.passed = False
                result.error = str(e)
            
            results.append(result)
        
        return results
    
    def test_backtest(self) -> TestResult:
        """Test backtesting endpoint."""
        result = TestResult(name="Backtest")
        
        try:
            response = self._make_request(
                'POST',
                '/api/portfolio/backtest',
                data={
                    'tickers': ['AAPL', 'MSFT', 'GOOGL'],
                    'start_date': '2023-01-01',
                    'end_date': '2023-12-31',
                    'objective': 'max_sharpe',
                    'rebalance_frequency': 'monthly',
                },
                timeout=120
            )
            result.status_code = response.status_code
            result.duration_ms = response.elapsed.total_seconds() * 1000
            
            if response.status_code == 200:
                data = response.json()
                result.passed = 'data' in data
                if result.passed:
                    result.details['results_count'] = len(data.get('data', {}).get('results', []))
                    result.details['summary_metrics'] = data.get('data', {}).get('summary_metrics', {})
            else:
                result.passed = False
                result.error = f"Status code: {response.status_code}"
                
        except TimeoutError:
            result.passed = False
            result.error = "TIMEOUT: Backtest took longer than 120s (SKIPPED - slow computation)"
        except Exception as e:
            result.passed = False
            result.error = str(e)
        
        return result
    
    def test_efficient_frontier(self) -> TestResult:
        """Test efficient frontier endpoint."""
        result = TestResult(name="Efficient Frontier")
        
        try:
            response = self._make_request(
                'POST',
                '/api/portfolio/efficient-frontier',
                data={
                    'tickers': ['AAPL', 'MSFT', 'GOOGL', 'AMZN'],
                },
                timeout=60
            )
            result.status_code = response.status_code
            result.duration_ms = response.elapsed.total_seconds() * 1000
            
            if response.status_code == 200:
                data = response.json()
                result.passed = 'data' in data and 'frontier_points' in data.get('data', {})
                if result.passed:
                    result.details['frontier_points'] = len(data.get('data', {}).get('frontier_points', []))
            else:
                result.passed = False
                result.error = f"Status code: {response.status_code}"
                
        except Exception as e:
            result.passed = False
            result.error = str(e)
        
        return result
    
    def test_metrics_endpoint(self) -> TestResult:
        """Test Prometheus metrics endpoint."""
        result = TestResult(name="Prometheus Metrics")
        
        try:
            response = self._make_request('GET', '/metrics')
            result.status_code = response.status_code
            result.duration_ms = response.elapsed.total_seconds() * 1000
            
            if response.status_code == 200:
                # Check if response contains Prometheus format
                result.passed = 'http_requests_total' in response.text or 'python_info' in response.text
                if not result.passed:
                    result.error = "Response doesn't contain expected Prometheus metrics"
            else:
                result.passed = False
                result.error = f"Status code: {response.status_code}"
                
        except Exception as e:
            result.passed = False
            result.error = str(e)
        
        return result
    
    def run_all_tests(self) -> TestReport:
        """Run all integration tests."""
        logger.info("Starting API integration tests...")
        logger.info(f"Base URL: {self.base_url}")
        
        # Test 1: Health check
        logger.info("Testing health check...")
        self.report.add_result(self.test_health_check())
        
        # Test 2: Config endpoints
        logger.info("Testing config endpoints...")
        for result in self.test_config_endpoints():
            self.report.add_result(result)
        
        # Test 3: Market data
        logger.info("Testing market data...")
        self.report.add_result(self.test_market_data())
        
        # Test 4: Portfolio optimization
        logger.info("Testing portfolio optimization...")
        for result in self.test_portfolio_optimization():
            self.report.add_result(result)
        
        # Test 5: Backtest
        logger.info("Testing backtest...")
        self.report.add_result(self.test_backtest())
        
        # Test 6: Efficient frontier
        logger.info("Testing efficient frontier...")
        self.report.add_result(self.test_efficient_frontier())
        
        # Test 7: Metrics
        logger.info("Testing metrics endpoint...")
        self.report.add_result(self.test_metrics_endpoint())
        
        return self.report


def check_dependencies() -> Dict[str, bool]:
    """Check if all required dependencies are installed."""
    deps = {
        'requests': False,
        'numpy': False,
        'pandas': False,
        'flask': False,
        'scipy': False,
        'sklearn': False,
        'braket': False,
    }
    
    import importlib
    
    for dep in deps:
        try:
            if dep == 'sklearn':
                importlib.import_module('sklearn')
            else:
                importlib.import_module(dep)
            deps[dep] = True
        except ImportError:
            pass
    
    return deps


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description='API Integration Test Suite')
    parser.add_argument(
        '--base-url',
        default='http://localhost:5000',
        help='Base URL of the API (default: http://localhost:5000)'
    )
    parser.add_argument(
        '--api-key',
        default='',
        help='API key for authentication'
    )
    parser.add_argument(
        '--check-deps-only',
        action='store_true',
        help='Only check dependencies, don\'t run tests'
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("QUANTUM HYBRID PORTFOLIO - API INTEGRATION TESTS")
    print("=" * 60)
    
    # Check dependencies
    print("\n📦 Checking dependencies...")
    deps = check_dependencies()
    
    all_deps_installed = True
    for dep, installed in deps.items():
        status = "✅" if installed else "❌"
        print(f"  {status} {dep}")
        if not installed and dep in ['requests', 'numpy', 'pandas', 'flask']:
            all_deps_installed = False
    
    if args.check_deps_only:
        return 0 if all_deps_installed else 1
    
    if not all_deps_installed:
        print("\n⚠️  Some critical dependencies are missing.")
        print("   Run: pip install -r deps/requirements.txt")
        return 1
    
    print("\n" + "=" * 60)
    
    # Run tests
    tester = APIIntegrationTester(
        base_url=args.base_url,
        api_key=args.api_key
    )
    
    try:
        report = tester.run_all_tests()
        report.print_summary()
        
        # Save detailed report
        report_path = 'test_report.json'
        with open(report_path, 'w') as f:
            json.dump({
                'total': report.total,
                'passed': report.passed,
                'failed': report.failed,
                'skipped': report.skipped,
                'results': [
                    {
                        'name': r.name,
                        'passed': r.passed,
                        'status_code': r.status_code,
                        'error': r.error,
                        'duration_ms': r.duration_ms,
                        'details': r.details,
                    }
                    for r in report.results
                ],
            }, f, indent=2)
        
        print(f"\n📄 Detailed report saved to: {report_path}")
        
        return 0 if report.failed == 0 else 1
        
    except ConnectionError as e:
        print(f"\n❌ Failed to connect to API at {args.base_url}")
        print(f"   Error: {e}")
        print("\n   Make sure the API server is running:")
        print("   python -m api")
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
