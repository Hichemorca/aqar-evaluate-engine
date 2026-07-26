"""
AQAR Learning Engine v1.0
Trains XGBoost model on DLD transactions, compares with current median method,
and deploys only if performance improves.
"""
import json
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_percentage_error, r2_score
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb
import pickle
import os
import sys

# Paths
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
INPUT_FILE = os.path.join(DATA_DIR, 'dld-transactions.json')
MODEL_FILE = os.path.join(MODEL_DIR, 'aqar_xgboost_v1.pkl')
ENCODER_FILE = os.path.join(MODEL_DIR, 'aqar_encoders.pkl')
METRICS_FILE = os.path.join(MODEL_DIR, 'model_metrics.json')

def load_data():
    """Load and prepare DLD transactions for training"""
    if not os.path.exists(INPUT_FILE):
        print("❌ No DLD data found")
        return None
    
    with open(INPUT_FILE, 'r') as f:
        data = json.load(f)
    
    df = pd.DataFrame(data)
    print(f"📋 Loaded {len(df):,} transactions")
    
    # Filter: only valid transactions
    df = df[df['actualSalePrice'] > 0]
    df = df[df['area'] > 0]
    
    # Calculate target
    df['pricePerSqm'] = df['actualSalePrice'] / df['area']
    
    # Remove extreme outliers (log-scale IQR)
    Q1 = np.log(df['pricePerSqm']).quantile(0.25)
    Q3 = np.log(df['pricePerSqm']).quantile(0.75)
    IQR = Q3 - Q1
    lower = np.exp(Q1 - 1.5 * IQR)
    upper = np.exp(Q3 + 1.5 * IQR)
    df = df[(df['pricePerSqm'] >= lower) & (df['pricePerSqm'] <= upper)]
    
    print(f"📊 After filtering: {len(df):,} transactions")
    return df

def prepare_features(df):
    """Prepare features for training"""
    # Categorical features
    categorical_cols = ['propertyType', 'district', 'project']
    label_encoders = {}
    
    for col in categorical_cols:
        if col in df.columns:
            le = LabelEncoder()
            df[col + '_encoded'] = le.fit_transform(df[col].fillna('Unknown').astype(str))
            label_encoders[col] = le
    
    # Numerical features
    numerical_cols = ['area', 'rooms', 'parking']
    for col in numerical_cols:
        if col in df.columns:
            df[col] = df[col].fillna(0)
    
    # Binary features
    if 'nearestMetro' in df.columns:
        df['hasMetro'] = df['nearestMetro'].apply(
            lambda x: 1 if x and str(x).lower() not in ['no', 'none', 'n/a', ''] and len(str(x)) > 2 else 0
        )
    
    if 'nearestMall' in df.columns:
        df['hasMall'] = df['nearestMall'].apply(
            lambda x: 1 if x and str(x).lower() not in ['no', 'none', 'n/a', ''] and len(str(x)) > 2 else 0
        )
    
    # Feature list
    feature_cols = ['area', 'rooms', 'parking']
    if 'propertyType_encoded' in df.columns:
        feature_cols.append('propertyType_encoded')
    if 'district_encoded' in df.columns:
        feature_cols.append('district_encoded')
    if 'project_encoded' in df.columns:
        feature_cols.append('project_encoded')
    if 'hasMetro' in df.columns:
        feature_cols.append('hasMetro')
    if 'hasMall' in df.columns:
        feature_cols.append('hasMall')
    
    # Drop rows with missing features
    df_clean = df.dropna(subset=feature_cols + ['pricePerSqm'])
    
    X = df_clean[feature_cols].values
    y = df_clean['pricePerSqm'].values
    
    return X, y, label_encoders, feature_cols

def train_model(X, y):
    """Train XGBoost model"""
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    model = xgb.XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1
    )
    
    print("🧠 Training XGBoost model...")
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    mape = mean_absolute_percentage_error(y_test, y_pred) * 100
    r2 = r2_score(y_test, y_pred)
    
    print(f"📊 Test MAPE: {mape:.1f}%")
    print(f"📊 Test R²: {r2:.3f}")
    
    # Feature importance
    importance = model.feature_importances_
    print("\n📊 Feature Importance:")
    for i, imp in enumerate(importance):
        print(f"   Feature {i}: {imp:.4f}")
    
    return model, mape, r2

def load_current_metrics():
    """Load metrics from current median method"""
    accuracy_file = os.path.join(DATA_DIR, 'accuracy-data.json')
    if os.path.exists(accuracy_file):
        with open(accuracy_file, 'r') as f:
            data = json.load(f)
        return data.get('metrics', {})
    return {}

def save_model(model, encoders, feature_cols, metrics):
    """Save trained model and metadata"""
    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR)
    
    # Save model
    with open(MODEL_FILE, 'wb') as f:
        pickle.dump(model, f)
    
    # Save encoders
    with open(ENCODER_FILE, 'wb') as f:
        pickle.dump({'encoders': encoders, 'feature_cols': feature_cols}, f)
    
    # Save metrics
    metrics['trainedAt'] = datetime.now().isoformat()
    metrics['modelVersion'] = '1.0.0'
    with open(METRICS_FILE, 'w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"\n✅ Model saved to {MODEL_FILE}")
    print(f"✅ Metrics saved to {METRICS_FILE}")

def main():
    print("🚀 AQAR Learning Engine v1.0\n")
    print("=" * 50)
    
    # Load data
    df = load_data()
    if df is None or len(df) < 100:
        print("❌ Insufficient data for training (need >100 records)")
        return
    
    # Prepare features
    X, y, encoders, feature_cols = prepare_features(df)
    print(f"\n📊 Training data: {X.shape[0]:,} samples, {X.shape[1]} features")
    
    # Train model
    model, mape, r2 = train_model(X, y)
    
    # Compare with current method
    current_metrics = load_current_metrics()
    current_accuracy = current_metrics.get('avgAccuracy', 0)
    
    print(f"\n📊 Performance Comparison:")
    print(f"   Current (Median): {current_accuracy:.1f}%")
    print(f"   XGBoost Model:    {100-mape:.1f}% (MAPE: {mape:.1f}%)")
    
    # Decision: deploy only if better
    ml_accuracy = 100 - mape
    if ml_accuracy > current_accuracy:
        print(f"\n✅ ML model is BETTER (+{ml_accuracy - current_accuracy:.1f}%) — DEPLOYING")
        metrics = {
            'modelAccuracy': round(ml_accuracy, 1),
            'mape': round(mape, 1),
            'r2': round(r2, 3),
            'trainingSamples': X.shape[0],
            'features': feature_cols,
            'previousAccuracy': current_accuracy,
            'improvement': round(ml_accuracy - current_accuracy, 1)
        }
        save_model(model, encoders, feature_cols, metrics)
    else:
        print(f"\n⚠️ ML model is NOT better ({ml_accuracy:.1f}% vs {current_accuracy:.1f}%) — KEEPING current")
    
    print("\n" + "=" * 50)
    print("✅ Learning cycle complete")

if __name__ == '__main__':
    main()