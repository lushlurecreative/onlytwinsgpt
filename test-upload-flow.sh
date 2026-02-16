#!/bin/bash
# Test script for /upload end-to-end flow

echo "=== STEP 1: Test /upload redirect while logged out ==="
echo "Checking if /upload redirects to /login..."
REDIRECT=$(curl -s -I http://localhost:3000/upload | grep -i location)
echo "Response: $REDIRECT"
if echo "$REDIRECT" | grep -q "login?redirectTo"; then
    echo "✅ PASS: Redirects to login with redirectTo parameter"
else
    echo "❌ FAIL: Does not redirect correctly"
fi

echo ""
echo "=== STEP 2-6: Manual Testing Required ==="
echo "Please manually test the following in your browser:"
echo ""
echo "2) Visit http://localhost:3000/login?redirectTo=/upload"
echo "   - Click 'Sign Up' tab"
echo "   - Use email: test+$(date +%s)@example.com"
echo "   - Use password: TestPassword123!"
echo "   - Click Sign Up button"
echo ""
echo "3) Verify you land on /upload after signup"
echo ""
echo "4) On /upload page:"
echo "   - Click 'Choose File' button"
echo "   - Select: /Users/shaunosborne/onlytwinsgpt/public/next.svg"
echo "   - Click 'Upload' button"
echo ""
echo "5) Record the following from the page:"
echo "   - Status text (Success/Error message)"
echo "   - Uploaded path shown"
echo "   - Signed URL if displayed"
echo ""
echo "6) Copy the signed URL and open in new tab"
echo "   - Verify the SVG file renders correctly"
echo ""
echo "=== Test endpoints availability ==="
curl -s http://localhost:3000/login | grep -q "login" && echo "✅ /login page exists" || echo "❌ /login page not found"
curl -s http://localhost:3000/upload -I | grep -q "307\|302\|200" && echo "✅ /upload endpoint exists" || echo "❌ /upload endpoint not found"
