"""
Enhanced API with real market data integration and optimization functionality
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
import json
import os
from datetime import datetime
import logging

# Import quantum hybrid portfolio modules
from core.quantum_inspired.enhanced_quantum_walk import EnhancedQuantumStochasticWalkOptimizer
from config.qsw_config import QSWConfig

# Import market data service
from services.market_data import fetch_market_data, validate_tickers, get_asset_metadata

# Import backtesting service
from services.backtest import run_backtest

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

def calculate_portfolio_metrics(weights, returns, covariance):
    """Calculate comprehensive portfolio metrics."""
    # Portfolio return
    portfolio_return = np.dot(weights, returns)
    
    # Portfolio volatility
    portfolio_variance = np.dot(weights, np.dot(covariance, weights))
    portfolio_vol = np.sqrt(portfolio_variance)
    
    # Sharpe ratio (assuming 0% risk-free rate)
    sharpe_ratio = portfolio_return / portfolio_vol if portfolio_vol != 0 else 0
    
    # Diversification ratio
    weighted_vol = np.dot(weights, np.sqrt(np.diag(covariance)))
    diversification_ratio = weighted_vol / portfolio_vol if portfolio_vol != 0 else 1.0
    
    # Information ratio (vs equal weight benchmark)
    equal_weights = np.array([1.0/len(weights)] * len(weights))
    benchmark_return = np.dot(equal_weights, returns)
    excess_return = portfolio_return - benchmark_return
    
    # Tracking error
    active_weights = weights - equal_weights
    tracking_error = np.sqrt(np.dot(active_weights, np.dot(covariance, active_weights)))
    information_ratio = excess_return / tracking_error if tracking_error != 0 else 0
    
    # Alpha and Beta
    benchmark_variance = np.dot(equal_weights, np.dot(covariance, equal_weights))
    portfolio_benchmark_cov = np.dot(weights, np.dot(covariance, equal_weights))
    beta = portfolio_benchmark_cov / benchmark_variance if benchmark_variance != 0 else 1.0
    alpha = portfolio_return - beta * benchmark_return
    
    # Return metrics
    return {
        'expected_return': float(portfolio_return),
        'volatility': float(portfolio_vol),
        'sharpe_ratio': float(sharpe_ratio),
        'diversification_ratio': float(diversification_ratio),
        'information_ratio': float(information_ratio),
        'alpha': float(alpha),
        'beta': float(beta)
    }

def compute_risk_metrics(data, weights, confidence=0.95):
    """Compute risk metrics like VaR and CVaR."""
    n = weights.shape[0]
    n_sim = 2000
    losses = []
    
    # Generate random portfolio returns based on the data
    for s in range(n_sim):
        # Pick random days for each asset
        day_returns = []
        for i in range(n):
            if hasattr(data, 'assets') and len(data.assets) > 0:
                # Use actual returns if available
                asset_returns = data.assets[i].get('returns', [0] * 252)  # Default to 252 days of zeros
                if len(asset_returns) > 0:
                    day_idx = np.random.randint(0, len(asset_returns))
                    day_returns.append(asset_returns[day_idx])
                else:
                    day_returns.append(0)
            else:
                day_returns.append(0)
        
        # Calculate portfolio return for this simulation
        portfolio_return = np.dot(weights, day_returns)
        losses.append(-portfolio_return)
    
    losses.sort()
    var_idx = int(n_sim * confidence)
    var95 = losses[var_idx] if var_idx < len(losses) else 0
    cvar = sum(losses[var_idx:]) / (n_sim - var_idx) if var_idx < len(losses) else 0
    
    return {'var95': var95 * 100, 'cvar': cvar * 100}

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'message': 'Quantum Portfolio Backend is running'})

@app.route('/api/optimize', methods=['POST'])
def optimize_portfolio():
    """
    Optimize portfolio with user-provided tickers and parameters.
    
    Request body should contain:
    {
        "tickers": ["AAPL", "MSFT", "GOOGL", ...],
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD",
        "regime": "normal|bull|bear|volatile",
        "omega": 0.3,
        "evolution_time": 10,
        "max_weight": 0.1,
        "turnover_limit": 0.2,
        "evolution_method": "continuous|discrete|decoherent|adiabatic|variational",
        "objective": "balanced|diversification|momentum|conservative"
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or 'tickers' not in data:
            return jsonify({'error': 'Tickers list is required'}), 400
            
        tickers = data.get('tickers', [])
        if not tickers or not isinstance(tickers, list):
            return jsonify({'error': 'Tickers must be a non-empty list'}), 400
            
        # Validate tickers
        validated_tickers = validate_tickers(tickers)
        if not validated_tickers:
            return jsonify({'error': 'No valid tickers provided'}), 400
            
        # Get optional parameters with defaults
        start_date = data.get('start_date', (datetime.now().replace(year=datetime.now().year-1)).strftime('%Y-%m-%d'))
        end_date = data.get('end_date', datetime.now().strftime('%Y-%m-%d'))
        regime = data.get('regime', 'normal')
        omega = float(data.get('omega', 0.30))
        evolution_time = int(data.get('evolution_time', 10))
        max_weight = float(data.get('max_weight', 0.10))
        turnover_limit = float(data.get('turnover_limit', 0.20))
        evolution_method = data.get('evolution_method', 'continuous')
        objective = data.get('objective', 'balanced')
        
        # Fetch market data
        market_data = fetch_market_data(validated_tickers, start_date, end_date)
        
        if not market_data.get('success', False):
            return jsonify({'error': f"Failed to fetch market data: {market_data.get('message', 'Unknown error')}"}), 400
            
        # Extract data
        returns = np.array(market_data['returns'])
        covariance = np.array(market_data['covariance'])
        assets = market_data['assets']
        sectors = market_data['sectors']
        
        # Validate data dimensions
        if len(returns) != len(covariance) or len(returns) != len(assets):
            return jsonify({'error': 'Data dimension mismatch'}), 400
            
        # Initialize enhanced optimizer with custom config
        config = QSWConfig()
        config.default_omega = omega
        config.evolution_time = evolution_time
        config.max_weight = max_weight
        config.max_turnover = turnover_limit
        
        enhanced_optimizer = EnhancedQuantumStochasticWalkOptimizer(config=config)
        
        # Run optimization
        result = enhanced_optimizer.optimize(
            returns=returns,
            covariance=covariance,
            market_regime=regime,
            sectors=sectors,
            constraints={
                'min_positions': 3,
                'neutralize_factors': False
            }
        )
        
        # Calculate additional metrics
        portfolio_metrics = calculate_portfolio_metrics(result.weights, returns, covariance)
        
        # Calculate risk metrics
        risk_metrics = {
            'var95': 0.0,  # Placeholder - would need actual historical returns for proper calculation
            'cvar': 0.0
        }
        
        # Prepare holdings data
        holdings = []
        for i, (asset, weight, sector) in enumerate(zip(assets, result.weights, sectors)):
            holdings.append({
                'name': asset,
                'weight': float(weight),
                'sector': sector,
                'return': float(returns[i]),
                'volatility': float(np.sqrt(covariance[i][i])),
                'sharpe': float(returns[i] / np.sqrt(covariance[i][i])) if covariance[i][i] > 0 else 0
            })
        
        # Sort holdings by weight (descending)
        holdings.sort(key=lambda x: x['weight'], reverse=True)
        
        # Calculate sector allocation
        sector_allocation = {}
        for holding in holdings:
            sector = holding['sector']
            weight = holding['weight']
            if sector in sector_allocation:
                sector_allocation[sector] += weight
            else:
                sector_allocation[sector] = weight
        
        sector_data = [{'name': k, 'value': round(float(v) * 100, 2)} for k, v in sector_allocation.items()]
        sector_data.sort(key=lambda x: x['value'], reverse=True)
        
        # Prepare response
        response = {
            'success': True,
            'qsw_result': {
                'weights': [float(w) for w in result.weights],
                'sharpe_ratio': float(result.sharpe_ratio),
                'expected_return': float(result.expected_return),
                'volatility': float(result.volatility),
                'n_active': int(result.nActive),
                'turnover': float(result.turnover),
                'diversification_ratio': float(result.diversification_ratio),
                'information_ratio': float(result.information_ratio),
                'alpha': float(result.alpha),
                'beta': float(result.beta)
            },
            'holdings': holdings,
            'sector_allocation': sector_data,
            'risk_metrics': {
                'var_95': float(risk_metrics['var95']),
                'cvar': float(risk_metrics['cvar'])
            },
            'portfolio_metrics': portfolio_metrics,
            'assets': [{'name': a, 'sector': s, 'return': float(r), 'volatility': float(np.sqrt(cov[i][i])), 
                       'sharpe': float(r / np.sqrt(cov[i][i])) if cov[i][i] > 0 else 0} 
                      for i, (a, s, r, cov) in enumerate(zip(assets, sectors, returns, covariance))],
            'metadata': {
                'tickers': validated_tickers,
                'start_date': start_date,
                'end_date': end_date,
                'regime': regime,
                'omega': omega,
                'evolution_time': evolution_time,
                'max_weight': max_weight,
                'turnover_limit': turnover_limit,
                'evolution_method': evolution_method,
                'objective': objective,
                'data_points': market_data.get('data_points', 0)
            }
        }
        
        return jsonify(response)
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in optimize_portfolio: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/backtest', methods=['POST'])
def run_backtest_endpoint():
    """
    Run backtest with user-provided parameters.
    
    Request body should contain:
    {
        "tickers": ["AAPL", "MSFT", "GOOGL", ...],
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD",
        "rebalance_frequency": "weekly|monthly|quarterly|yearly",
        "objective": "max_sharpe|min_variance|target_return|risk_parity",
        "omega": 0.3,
        "evolution_time": 10,
        "max_weight": 0.1
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or 'tickers' not in data:
            return jsonify({'error': 'Tickers list is required'}), 400
            
        tickers = data.get('tickers', [])
        if not tickers or not isinstance(tickers, list):
            return jsonify({'error': 'Tickers must be a non-empty list'}), 400
            
        # Validate tickers
        validated_tickers = validate_tickers(tickers)
        if not validated_tickers:
            return jsonify({'error': 'No valid tickers provided'}), 400
            
        # Get other parameters
        start_date = data.get('start_date', (datetime.now().replace(year=datetime.now().year-2)).strftime('%Y-%m-%d'))
        end_date = data.get('end_date', datetime.now().strftime('%Y-%m-%d'))
        rebalance_frequency = data.get('rebalance_frequency', 'monthly')
        objective = data.get('objective', 'max_sharpe')
        
        # Get optimization parameters
        optimization_params = {
            'omega': float(data.get('omega', 0.3)),
            'evolution_time': int(data.get('evolution_time', 10)),
            'max_weight': float(data.get('max_weight', 0.1))
        }
        
        # Run backtest
        results = run_backtest(
            tickers=validated_tickers,
            start_date=start_date,
            end_date=end_date,
            rebalance_frequency=rebalance_frequency,
            objective=objective,
            **optimization_params
        )
        
        return jsonify({
            'success': True,
            'results': results['results'],
            'summary_metrics': results['summary_metrics'],
            'parameters': results['parameters']
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in run_backtest_endpoint: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/ticker-metadata', methods=['POST'])
def get_ticker_metadata():
    """
    Get metadata for a list of tickers.
    
    Request body should contain:
    {
        "tickers": ["AAPL", "MSFT", "GOOGL", ...]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'tickers' not in data:
            return jsonify({'error': 'Tickers list is required'}), 400
            
        tickers = data.get('tickers', [])
        if not tickers or not isinstance(tickers, list):
            return jsonify({'error': 'Tickers must be a list'}), 400
            
        # Validate tickers
        validated_tickers = validate_tickers(tickers)
        
        # Get metadata
        metadata = get_asset_metadata(validated_tickers)
        
        return jsonify({
            'success': True,
            'metadata': metadata,
            'requested_tickers': tickers,
            'valid_tickers': validated_tickers
        })
        
    except Exception as e:
        logger.error(f"Error in get_ticker_metadata: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/scenarios', methods=['GET'])
def get_market_scenarios():
    """
    Get predefined market scenarios for testing.
    """
    scenarios = [
        {
            'name': 'Bull Market',
            'description': 'Strong upward market trend, low volatility',
            'start_date': '2017-01-01',
            'end_date': '2017-12-31',
            'tickers': ['SPY', 'QQQ', 'VTI', 'VEA', 'VWO'],
            'regime': 'bull'
        },
        {
            'name': 'Bear Market',
            'description': 'Significant market decline, high volatility',
            'start_date': '2008-01-01',
            'end_date': '2009-03-09',
            'tickers': ['SPY', 'QQQ', 'VTI', 'VEA', 'VWO'],
            'regime': 'bear'
        },
        {
            'name': 'Volatile Market',
            'description': 'High market volatility, mixed performance',
            'start_date': '2020-01-01',
            'end_date': '2020-03-31',
            'tickers': ['SPY', 'QQQ', 'VTI', 'VEA', 'VWO'],
            'regime': 'volatile'
        },
        {
            'name': 'Sideways Market',
            'description': 'Range-bound market with moderate volatility',
            'start_date': '2018-01-01',
            'end_date': '2018-12-31',
            'tickers': ['SPY', 'QQQ', 'VTI', 'VEA', 'VWO'],
            'regime': 'normal'
        }
    ]
    
    return jsonify({
        'success': True,
        'scenarios': scenarios
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)