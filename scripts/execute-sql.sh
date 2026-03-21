#!/bin/bash
# Execute SQL against Supabase database automatically
# Usage: ./scripts/execute-sql.sh "SELECT * FROM table"

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <sql-query>"
    exit 1
fi

PROJECT_ID="labqtctlgntdgkawjuul"
SQL_QUERY="$1"

echo "Executing SQL on Supabase project: $PROJECT_ID"
supabase db execute --project-id "$PROJECT_ID" << EOF
$SQL_QUERY
EOF

echo "✅ SQL executed successfully"
