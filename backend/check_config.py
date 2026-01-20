#!/usr/bin/env python3
"""
Diagnostic Tool for Image Layout App
Checks configuration and provides setup guidance.
"""

import os
import sys

def main():
    """Main diagnostic function"""
    
    print("🔍 Image Layout App - Configuration Check")
    print("=" * 50)
    
    # Check environment variables
    supabase_url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
    service_key = os.getenv("SUPABASE_SERVICE_KEY")
    
    print("📋 Environment Variables:")
    print(f"   SUPABASE_URL: {'✅ Set' if supabase_url else '❌ Missing'}")
    print(f"   SUPABASE_ANON_KEY: {'✅ Set' if anon_key else '❌ Missing'}")
    print(f"   SUPABASE_SERVICE_KEY: {'✅ Set' if service_key else '❌ Missing'}")
    print()
    
    if not supabase_url:
        print("❌ SUPABASE_URL is required. Add it to your .env file.")
        return
    
    # Recommendations
    print("💡 SETUP CHECKLIST:")
    print()
    
    if service_key:
        print("✅ Service key found - this bypasses RLS issues")
    elif anon_key:
        print("⚠️  Using anon key - make sure RLS is disabled on images table")
        print("   Run: ALTER TABLE images DISABLE ROW LEVEL SECURITY;")
    else:
        print("❌ No Supabase key found")
        print("   Add SUPABASE_SERVICE_KEY to your .env file")
    
    print()
    print("📝 REQUIRED SETUP STEPS:")
    print("   1. Run backend/setup_database.sql in Supabase SQL editor")
    print("   2. Create 'assets' bucket in Supabase Storage (make it public)")
    print("   3. Start backend: python app.py")
    print("   4. Start frontend: npm run dev")
    print()
    
    print("🧪 TEST COMMANDS:")
    print("   curl http://localhost:5001/health")
    print("   # Should return: {\"status\": \"healthy\"}")

if __name__ == "__main__":
    main()