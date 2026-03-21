#!/usr/bin/env python3
"""
Execute SQL against Supabase database via internal API
Usage: python3 scripts/execute_sql.py "SELECT * FROM table"
"""

import os
import sys
import json
import urllib.request

def execute_sql(sql_query):
    """Execute SQL query via internal API endpoint"""

    # Get credentials from .env.local
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    env_vars = {}

    try:
        with open(env_file) as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    env_vars[key] = value.strip('"')
    except FileNotFoundError:
        print("❌ .env.local not found")
        return False

    WORKER_SECRET = env_vars.get("WORKER_SECRET")
    APP_URL = env_vars.get("NEXT_PUBLIC_APP_URL", "https://onlytwins.dev")

    if not WORKER_SECRET:
        print("❌ WORKER_SECRET not set in .env.local")
        return False

    # Call internal API
    url = f"{APP_URL}/api/internal/execute-sql"
    data = json.dumps({
        "secret": WORKER_SECRET,
        "sql": sql_query
    }).encode()

    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            if result.get("success"):
                print("✅ SQL executed successfully")
                return True
            else:
                print(f"❌ {result.get('error')}")
                return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/execute_sql.py '<sql-query>'")
        sys.exit(1)

    sql = sys.argv[1]
    success = execute_sql(sql)
    sys.exit(0 if success else 1)
