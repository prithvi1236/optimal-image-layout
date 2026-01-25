import { useEffect, useState } from "react";
import ImageCanvasStudio from "./ImageCanvas";
import Login from "./Components/Login";
import { supabase } from "./Components/supabaseClient";
import { cleanupService } from "./cleanupService";
import type { Session } from "@supabase/supabase-js";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);

  useEffect(() => {
    // Setup cleanup service callbacks
    cleanupService.setInactivityWarningCallback(() => {
      setShowInactivityWarning(true);
    });

    cleanupService.setDataCleanupCallback(() => {
      // Refresh the page after cleanup (localStorage already cleared by cleanup service)
      window.location.reload();
    });

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      
      // Handle OAuth redirect
      if (event === 'SIGNED_IN' && session) {
        // Remove any URL fragments after successful OAuth
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }

      // Handle sign out
      if (event === 'SIGNED_OUT') {
        setShowInactivityWarning(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      cleanupService.destroy();
    };
  }, []);

  const handleStayActive = () => {
    cleanupService.resetActivityTimer();
    setShowInactivityWarning(false);
  };

  const handleLogoutNow = async () => {
    setShowInactivityWarning(false);
    await cleanupService.handleLogout();
  };

  if (loading) {
    return (
      <div className="w-screen h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-600">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          Loading...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="w-screen h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="max-w-4xl mx-auto px-6 text-center">
          {/* Hero Section */}
          <div className="mb-12">
            <h1 className="text-6xl font-black text-zinc-900 mb-6 leading-tight">
              Smart Layout
              <span className="block text-indigo-600">Studio</span>
            </h1>
            <p className="text-xl text-zinc-600 mb-8 max-w-2xl mx-auto leading-relaxed">
              Transform your images into perfectly optimized A4 layouts with AI-powered arrangement. 
              Upload, organize, and export professional layouts in seconds.
            </p>
            
            {/* Features */}
            <div className="grid md:grid-cols-3 gap-6 mb-12 max-w-3xl mx-auto">
              <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl border border-white/20 shadow-sm">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-zinc-900 mb-2">Smart Upload</h3>
                <p className="text-sm text-zinc-600">Upload images or extract figures from PDFs automatically</p>
              </div>
              
              <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl border border-white/20 shadow-sm">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-zinc-900 mb-2">AI Layout</h3>
                <p className="text-sm text-zinc-600">Automatically optimize image placement for perfect A4 layouts</p>
              </div>
              
              <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl border border-white/20 shadow-sm">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-zinc-900 mb-2">Export PDF</h3>
                <p className="text-sm text-zinc-600">Download your optimized layouts as professional PDFs</p>
              </div>
            </div>
          </div>

          {/* Sign In Card */}
          <div className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-white/20 max-w-md mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">Get Started</h2>
              <p className="text-zinc-600">Sign in to start creating beautiful layouts</p>
            </div>
            <Login />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-zinc-50 text-zinc-900 font-sans overflow-hidden selection:bg-indigo-100 selection:text-indigo-700">
      <ImageCanvasStudio />
      
      {/* Inactivity Warning Modal */}
      {showInactivityWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Inactivity Warning</h3>
              <p className="text-zinc-600 mb-6">
                You've been inactive for 50 minutes. Your data will be automatically deleted in 10 minutes due to inactivity.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleLogoutNow}
                  className="flex-1 px-4 py-2 text-zinc-600 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Logout Now
                </button>
                <button
                  onClick={handleStayActive}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Stay Active
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;