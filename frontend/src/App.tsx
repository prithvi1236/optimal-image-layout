import { useEffect, useState } from "react";
import ImageCanvasStudio from "./ImageCanvas";
import Login from "./Components/Login";
import { supabase } from "./Components/supabaseClient";
import { cleanupService } from "./cleanupService";
import type { Session } from "@supabase/supabase-js";
import logoWeb from "./assets/logo_web.png";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);

  useEffect(() => {
    cleanupService.setInactivityWarningCallback(() => {
      setShowInactivityWarning(true);
    });

    cleanupService.setDataCleanupCallback(() => {
      window.location.reload();
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN' && session) {
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
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

  // --- LOGGED OUT VIEW (Split Screen) ---
  if (!session) {
    return (
      <div className="w-screen h-screen flex flex-col md:flex-row bg-white overflow-hidden">
        
        {/* LEFT SIDE: CONTENT & LOGIN */}
        <div className="w-full md:w-1/2 h-full overflow-y-auto px-8 md:px-16 flex flex-col justify-center py-12">
          <div className="max-w-xl mx-auto">
            <header className="mb-10">
              <h1 className="text-5xl font-black text-zinc-900 leading-tight mb-4">
                Smart Layout
                <span className="block text-indigo-600">Studio</span>
              </h1>
              <p className="text-lg text-zinc-600 leading-relaxed">
                Transform your images into perfectly optimized A4 layouts with AI-powered arrangement. 
                Upload, organize, and export professional layouts in seconds.
              </p>
            </header>

            {/* Features List */}
            <div className="space-y-6 mb-12">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 shrink-0 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Smart Upload</h3>
                  <p className="text-sm text-zinc-500">Extract figures from PDFs automatically.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 shrink-0 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">AI Optimization</h3>
                  <p className="text-sm text-zinc-500">Perfect A4 image placement in one click.</p>
                </div>
              </div>
            </div>

            {/* Login Card */}
            <div className="bg-zinc-50 p-8 rounded-3xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-bold text-zinc-900 mb-4">Get Started</h2>
              <Login />
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: FULL IMAGE */}
        <div className="hidden md:block md:w-1/2 h-full bg-indigo-600 relative overflow-hidden">
          {/* Decorative background pattern */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg className="h-full w-full" fill="currentColor"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)" /></svg>
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <div className="relative group">
              {/* Image with glass effect border */}
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-[3rem] border border-white/20 shadow-2xl transition-transform duration-700 hover:scale-105">
                <img 
                  src={logoWeb} 
                  alt="Studio Interface Preview" 
                  className="w-full max-w-xl aspect-square object-cover rounded-[2.5rem] shadow-2xl"
                />
              </div>
              {/* Floating accent elements */}
              <div className="absolute -top-6 -left-6 w-24 h-24 bg-purple-400 rounded-full blur-3xl opacity-50 animate-pulse"></div>
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-indigo-400 rounded-full blur-3xl opacity-50 animate-pulse delay-700"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- LOGGED IN VIEW ---
  return (
    <div className="w-screen h-screen bg-zinc-50 text-zinc-900 font-sans overflow-hidden">
      <ImageCanvasStudio />
      
      {showInactivityWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Inactivity Warning</h3>
              <p className="text-zinc-600 mb-6">Your data will be automatically deleted in 10 minutes due to inactivity.</p>
              <div className="flex gap-3">
                <button onClick={handleLogoutNow} className="flex-1 px-4 py-2 text-zinc-600 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors">Logout Now</button>
                <button onClick={handleStayActive} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Stay Active</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
