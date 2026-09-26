#!/bin/bash

echo "🔍 Checking specific API endpoints mentioned by user..."
echo ""

cd /Users/mac/codex-backend/routes

# Files to check specifically
files_to_check=(
    "notion-api.js"
    "figma-api.js"
    "lsp.js"
    "vfs.js"
    "terminal.js"
    "git.js"
    "debug.js"
    "agent-confirmation.js"
    "github-advanced.js"
)

echo "📋 CHECKING SPECIFIC FILES:"
echo ""

for file in "${files_to_check[@]}"; do
    echo "=== $file ==="
    
    # Count total endpoints
    total_endpoints=$(grep -c "router\.[a-z]*(" "$file")
    
    # Count endpoints with @swagger
    # This is a rough count - looks for @swagger before router calls
    swagger_endpoints=$(awk '/@swagger/{found=1} found && /router\.[a-z]*\(/{count++; found=0} END{print count}' "$file")
    
    if [ "$swagger_endpoints" = "" ]; then
        swagger_endpoints=0
    fi
    
    echo "Total endpoints: $total_endpoints"
    echo "Endpoints with @swagger: $swagger_endpoints"
    
    if [ "$total_endpoints" -eq "$swagger_endpoints" ]; then
        echo "Status: ✅ All endpoints documented"
    else
        echo "Status: ⚠️  $((total_endpoints - swagger_endpoints)) endpoints missing documentation"
        
        # Show which endpoints might be missing
        echo "Possible missing endpoints:"
        grep -n "router\.[a-z]*(" "$file" | while read line; do
            line_num=$(echo "$line" | cut -d: -f1)
            # Check if there's @swagger within 20 lines before this
            if ! awk -v line="$line_num" 'NR >= line-20 && NR <= line && /@swagger/{found=1} END{exit !found}' "$file"; then
                echo "  - $line"
            fi
        done
    fi
    
    echo ""
done

echo "🎯 ISSUE ANALYSIS:"
echo "1. All files have SOME Swagger documentation"
echo "2. Some endpoints within files might not have individual @swagger tags"
echo "3. Swagger UI might not be picking up all endpoints due to:"
echo "   - Missing @swagger tags on some endpoints"
echo "   - Incorrect path definitions in @swagger tags"
echo "   - Swagger configuration issues"
echo ""
echo "🔧 RECOMMENDED FIX:"
echo "1. Check each file for endpoints without @swagger tags"
echo "2. Add missing @swagger documentation"
echo "3. Verify Swagger UI at /api-docs"
echo "4. Test with the new Postman collection"