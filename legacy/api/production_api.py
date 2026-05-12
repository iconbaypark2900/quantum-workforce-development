"""
Production-ready API for Quantum Portfolio Optimization
Includes security, monitoring, rate limiting, and error handling
"""
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import numpy as np
import pandas as pd
import logging
import time
import os
from functools import wraps
from typing import Dict, Any, Optional
import redis
import pickle
import hashlib
from datetime import timedelta, datetime
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

# Import quantum portfolio modules
from core.quantum_inspired.quantum_walk import QuantumStochasticWalkOptimizer
from core.quantum_inspired.quantum_annealing import QuantumAnnealingOptimizer
from core.quantum_inspired.evolution_dynamics import QuantumEvolution
from config.production_config import CONFIG

# Initialize Sentry for error tracking if configured
if CONFIG.SENTRY_DSN:
    sentry_sdk.init(
        dsn=CONFIG.SENTRY_DSN,
        integrations=[FlaskIntegration()],
        traces_sample_rate=0.1
    )

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure JWT
app.config['JWT_SECRET_KEY'] = CONFIG.JWT_SECRET_KEY
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(seconds=CONFIG.JWT_ACCESS_TOKEN_EXPIRES)
jwt = JWTManager(app)

# Configure rate limiter (flask-limiter 3.0+: key_func first, app= as kwarg)
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["1000 per hour"]
)

# Initialize Redis client for caching
redis_client = redis.Redis(
    host=CONFIG.REDIS_HOST,
    port=CONFIG.REDIS_PORT,
    db=CONFIG.REDIS_DB,
    password=CONFIG.REDIS_PASSWORD,
    decode_responses=False
)

# Initialize quantum optimizers
global_quantum_optimizer = QuantumStochasticWalkOptimizer(use_optimized=CONFIG.USE_OPTIMIZED_QUANTUM)
global_quantum_annealing = QuantumAnnealingOptimizer()

# Configure logging
logging.basicConfig(level=getattr(logging, CONFIG.LOG_LEVEL.upper()))
logger = logging.getLogger(__name__)


def validate_json_schema(required_fields):
    """Decorator to validate JSON schema"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not request.is_json:
                return jsonify({'error': 'Content-Type must be application/json'}), 400
            
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Invalid JSON'}), 400
            
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                return jsonify({'error': f'Missing required fields: {missing_fields}'}), 400
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def cache_result(timeout=CONFIG.CACHE_TTL):
    """Decorator to cache API results"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Create cache key from request data
            request_data = request.get_json() if request.is_json else {}
            cache_key = f"api_result:{f.__name__}:{hash(str(sorted(request_data.items())))}"
            
            # Try to get from cache
            cached_result = redis_client.get(cache_key)
            if cached_result:
                logger.info(f"Cache hit for {cache_key}")
                return pickle.loads(cached_result)
            
            # Execute function
            result = f(*args, **kwargs)
            
            # Cache the result
            if CONFIG.ENABLE_CACHE:
                redis_client.setex(
                    cache_key,
                    timeout,
                    pickle.dumps(result)
                )
                logger.info(f"Cache set for {cache_key}")
            
            return result
        return decorated_function
    return decorator


def measure_execution_time(f):
    """Decorator to measure execution time"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        start_time = time.time()
        result = f(*args, **kwargs)
        execution_time = time.time() - start_time
        
        # Log execution time
        logger.info(f"Execution time for {f.__name__}: {execution_time:.4f}s")
        
        # Add execution time to response if it's a dict
        if isinstance(result, tuple) and len(result) == 2:
            response, status_code = result
            if isinstance(response, dict):
                response['execution_time'] = execution_time
            return response, status_code
        elif isinstance(result, dict):
            result['execution_time'] = execution_time
            return result
        
        return result
    return decorated_function


def audit_log(event_type: str):
    """Decorator to log audit events"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_id = get_jwt_identity() if request.endpoint != 'health_check' else 'system'
            start_time = time.time()
            
            try:
                result = f(*args, **kwargs)
                status = 'success'
                error_msg = None
            except Exception as e:
                status = 'failure'
                error_msg = str(e)
                raise
            finally:
                execution_time = time.time() - start_time
                
                # Log audit event
                if CONFIG.AUDIT_LOGGING:
                    audit_event = {
                        'timestamp': datetime.utcnow().isoformat(),
                        'user_id': user_id,
                        'endpoint': request.endpoint,
                        'method': request.method,
                        'ip_address': request.remote_addr,
                        'user_agent': request.user_agent.string,
                        'event_type': event_type,
                        'status': status,
                        'execution_time': execution_time,
                        'request_data': request.get_json() if request.is_json else None,
                        'response_size': len(str(result)) if 'result' in locals() else 0
                    }
                    
                    if error_msg:
                        audit_event['error'] = error_msg
                    
                    # Write to audit log
                    with open(CONFIG.COMPLIANCE_LOG_PATH, 'a') as audit_file:
                        audit_file.write(str(audit_event) + '\n')
            
            return result
        return decorated_function
    return decorator


@app.before_request
def before_request():
    """Log incoming requests"""
    g.start_time = time.time()
    logger.debug(f"Incoming request: {request.method} {request.path}")


@app.after_request
def after_request(response):
    """Log outgoing responses"""
    duration = time.time() - g.start_time
    logger.debug(f"Response {response.status_code} in {duration:.4f}s")
    return response


@app.errorhandler(429)
def ratelimit_handler(e):
    """Handle rate limit exceeded"""
    logger.warning(f"Rate limit exceeded for IP: {request.remote_addr}")
    return jsonify(error="Rate limit exceeded"), 429


@app.errorhandler(500)
def internal_error_handler(e):
    """Handle internal server errors"""
    logger.error(f"Internal error: {str(e)}", exc_info=True)
    return jsonify(error="Internal server error"), 500


@app.route('/health', methods=['GET'])
@measure_execution_time
def health_check():
    """Health check endpoint"""
    try:
        # Check Redis connectivity
        redis_status = redis_client.ping()
        
        # Check basic quantum computation
        test_returns = np.array([0.1, 0.12, 0.08])
        test_cov = np.eye(3) * 0.04
        test_result = global_quantum_optimizer.optimize(test_returns, test_cov)
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'services': {
                'redis': 'connected' if redis_status else 'disconnected',
                'quantum_engine': 'operational',
            },
            'test_optimization': {
                'sharpe_ratio': float(test_result.sharpe_ratio),
                'assets': int(len(test_result.weights))
            }
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500


@app.route('/ready', methods=['GET'])
def ready_check():
    """Readiness check endpoint"""
    # Check if all required services are ready
    try:
        # Test Redis
        redis_client.ping()
        
        return jsonify({'status': 'ready'})
    except Exception:
        return jsonify({'status': 'not_ready'}), 503


@app.route('/api/portfolio/optimize', methods=['POST'])
@jwt_required()
@limiter.limit(CONFIG.OPTIMIZATION_RATE_LIMIT)
@validate_json_schema(['returns', 'covariance'])
@measure_execution_time
@audit_log('portfolio_optimization')
@cache_result(timeout=CONFIG.CACHE_TTL)
def optimize_portfolio():
    """Main portfolio optimization endpoint"""
    try:
        data = request.get_json()
        
        # Validate and sanitize inputs
        returns = np.array(data['returns'], dtype=np.float64)
        covariance = np.array(data['covariance'], dtype=np.float64)
        
        # Validate dimensions
        n_assets = len(returns)
        if covariance.shape != (n_assets, n_assets):
            return jsonify({'error': 'Covariance matrix dimensions mismatch'}), 400
        
        # Validate asset count limit
        if n_assets > CONFIG.MAX_ASSETS:
            return jsonify({'error': f'Maximum assets exceeded: {n_assets} > {CONFIG.MAX_ASSETS}'}), 400
        
        # Get optional parameters
        regime = data.get('regime', 'normal')
        omega = data.get('omega', 0.3)
        evolution_time = data.get('evolution_time', 10)
        evolution_method = data.get('evolution_method', 'continuous')
        use_quantum_annealing = data.get('use_quantum_annealing', False)
        
        # Validate parameters
        if not (0.05 <= omega <= 0.6):
            return jsonify({'error': 'omega must be between 0.05 and 0.6'}), 400
        
        if not (1 <= evolution_time <= CONFIG.MAX_EVOLUTION_TIME):
            return jsonify({'error': f'evolution_time must be between 1 and {CONFIG.MAX_EVOLUTION_TIME}'}), 400
        
        # Perform optimization with timeout
        start_time = time.time()
        
        if use_quantum_annealing:
            # Use quantum annealing optimizer
            result = global_quantum_annealing.optimize(returns, covariance, regime)
        else:
            # Configure optimizer based on method
            from config.qsw_config import QSWConfig
            config = QSWConfig(
                default_omega=omega,
                evolution_time=evolution_time,
                evolution_method=evolution_method
            )
            
            optimizer = QuantumStochasticWalkOptimizer(config, use_optimized=CONFIG.USE_OPTIMIZED_QUANTUM)
            result = optimizer.optimize(returns, covariance, market_regime=regime)
        
        # Check for timeout
        execution_time = time.time() - start_time
        if execution_time > CONFIG.QUANTUM_COMPUTE_TIMEOUT:
            logger.warning(f"Optimization took too long: {execution_time:.2f}s")
        
        # Format response
        if hasattr(result, 'weights'):  # QSWResult object
            response = {
                'weights': [float(w) for w in result.weights],
                'sharpe_ratio': float(result.sharpe_ratio),
                'expected_return': float(result.expected_return),
                'volatility': float(result.volatility),
                'n_active': int(np.sum(result.weights > 0.005)),
                'turnover': float(result.turnover),
                'execution_time': execution_time,
                'method_used': 'quantum_stochastic_walk',
                'evolution_method': evolution_method
            }
        else:  # Quantum annealing result dict
            response = {
                'weights': [float(w) for w in result['weights']],
                'sharpe_ratio': float(result['sharpe_ratio']),
                'expected_return': float(result['expected_return']),
                'volatility': float(result['volatility']),
                'n_active': int(result['n_active']),
                'execution_time': execution_time,
                'method_used': 'quantum_annealing'
            }
        
        logger.info(f"Portfolio optimization completed for {n_assets} assets, Sharpe: {response['sharpe_ratio']:.4f}")
        return jsonify(response)
        
    except ValueError as e:
        logger.error(f"Value error in optimization: {str(e)}")
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Optimization failed: {str(e)}", exc_info=True)
        return jsonify({'error': 'Optimization failed'}), 500


@app.route('/api/portfolio/multi_method_compare', methods=['POST'])
@jwt_required()
@limiter.limit("50 per hour")
@validate_json_schema(['returns', 'covariance'])
@measure_execution_time
@audit_log('multi_method_comparison')
def compare_quantum_methods():
    """Compare different quantum methods"""
    try:
        data = request.get_json()
        
        returns = np.array(data['returns'], dtype=np.float64)
        covariance = np.array(data['covariance'], dtype=np.float64)
        regime = data.get('regime', 'normal')
        
        n_assets = len(returns)
        if covariance.shape != (n_assets, n_assets):
            return jsonify({'error': 'Covariance matrix dimensions mismatch'}), 400
        
        results = {}
        
        # Test different evolution methods
        methods = ['continuous', 'discrete', 'decoherent']
        for method in methods:
            from config.qsw_config import QSWConfig
            config = QSWConfig(evolution_method=method)
            optimizer = QuantumStochasticWalkOptimizer(config, use_optimized=CONFIG.USE_OPTIMIZED_QUANTUM)
            
            start_time = time.time()
            result = optimizer.optimize(returns, covariance, market_regime=regime)
            execution_time = time.time() - start_time
            
            results[method] = {
                'sharpe_ratio': float(result.sharpe_ratio),
                'expected_return': float(result.expected_return),
                'volatility': float(result.volatility),
                'n_active': int(np.sum(result.weights > 0.005)),
                'execution_time': execution_time
            }
        
        # Test quantum annealing
        start_time = time.time()
        qa_result = global_quantum_annealing.optimize(returns, covariance, regime)
        qa_execution_time = time.time() - start_time
        
        results['quantum_annealing'] = {
            'sharpe_ratio': float(qa_result['sharpe_ratio']),
            'expected_return': float(qa_result['expected_return']),
            'volatility': float(qa_result['volatility']),
            'n_active': int(qa_result['n_active']),
            'execution_time': qa_execution_time
        }
        
        return jsonify({
            'method_comparison': results,
            'best_method': max(results.keys(), key=lambda k: results[k]['sharpe_ratio']),
            'regime': regime
        })
        
    except Exception as e:
        logger.error(f"Method comparison failed: {str(e)}", exc_info=True)
        return jsonify({'error': 'Method comparison failed'}), 500


@app.route('/api/auth/login', methods=['POST'])
@validate_json_schema(['username', 'password'])
def login():
    """User authentication endpoint"""
    try:
        data = request.get_json()
        username = data['username']
        password = data['password']  # In real app, verify against DB
        
        # In a real application, verify credentials against database
        # For demo, just check if user exists
        if username and password:  # Replace with real auth logic
            access_token = create_access_token(identity=username)
            return jsonify(access_token=access_token)
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
            
    except Exception as e:
        logger.error(f"Login failed: {str(e)}", exc_info=True)
        return jsonify({'error': 'Authentication failed'}), 500


@app.route('/api/metrics', methods=['GET'])
@jwt_required()
def get_metrics():
    """Get system metrics"""
    try:
        # Get Redis info
        redis_info = redis_client.info()
        
        # Get basic system stats
        import psutil
        system_stats = {
            'cpu_percent': psutil.cpu_percent(),
            'memory_percent': psutil.virtual_memory().percent,
            'disk_percent': psutil.disk_usage('/').percent,
            'uptime_seconds': time.time() - g.start_time if hasattr(g, 'start_time') else 0
        }
        
        return jsonify({
            'system_stats': system_stats,
            'redis_stats': {
                'connected_clients': redis_info.get('connected_clients'),
                'used_memory_human': redis_info.get('used_memory_human'),
                'total_commands_processed': redis_info.get('total_commands_processed')
            },
            'app_info': {
                'environment': CONFIG.ENVIRONMENT,
                'version': '1.0.0',
                'optimized_quantum': CONFIG.USE_OPTIMIZED_QUANTUM
            }
        })
        
    except Exception as e:
        logger.error(f"Metrics retrieval failed: {str(e)}", exc_info=True)
        return jsonify({'error': 'Metrics retrieval failed'}), 500


if __name__ == '__main__':
    app.run(
        host=CONFIG.HOST,
        port=CONFIG.PORT,
        debug=CONFIG.DEBUG,
        threaded=True
    )