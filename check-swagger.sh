#!/bin/bash

echo "🔍 Checking Swagger documentation in route files..."
echo ""

cd /Users/mac/codex-backend/routes

total_files=0
with_swagger=0
without_swagger=0

echo "📋 DETAILED BREAKDOWN:"
echo ""

for file in *.js; do
    total_files=$((total_files + 1))
    
    if grep -q "@swagger" "$file"; then
        status="✅"
        with_swagger=$((with_swagger + 1))
    else
        status="❌"
        without_swagger=$((without_swagger + 1))
    fi
    
    # Count endpoints (router.METHOD calls)
    endpoints=$(grep -c "router\.[a-z]*(" "$file" || echo "0")
    
    printf "%-30s %s Endpoints: %s\n" "$file" "$status" "$endpoints"
done

echo ""
echo "📊 SUMMARY:"
echo "Total route files: $total_files"
echo "With Swagger documentation: $with_swagger"
echo "Without Swagger documentation: $without_swagger"

if [ $total_files -gt 0 ]; then
    coverage=$(echo "scale=1; $with_swagger * 100 / $total_files" | bc)
    echo "Coverage: ${coverage}%"
fi

echo ""
echo "🚨 FILES NEEDING SWAGGER DOCUMENTATION:"
echo ""

for file in *.js; do
    if ! grep -q "@swagger" "$file"; then
        echo "❌ $file"
    fi
done

echo ""
echo "🎯 RECOMMENDED ACTIONS:"
echo "1. Add @swagger documentation to files marked with ❌"
echo "2. Run this script again to verify completion"
echo "3. Test Swagger UI at /api-docs"