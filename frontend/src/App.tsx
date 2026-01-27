import { useEffect, useState } from "react";
import ImageCanvasStudio from "./ImageCanvas";
import Login from "./Components/Login";
import BuyMeACoffee from "./BuyMeACoffee";
import GitHubStar from "./GitHubStar";
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
      <div className="w-screen h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
          <span className="text-zinc-400 text-sm font-medium tracking-wide">INITIALIZING GRIDLY...</span>
        </div>
      </div>
    );
  }

  // --- LOGGED OUT VIEW (Updated: Wider Content, Narrower Visuals) ---
  if (!session) {
    return (
      <div className="w-screen h-screen flex bg-white overflow-hidden font-sans selection:bg-zinc-900 selection:text-white">
        
        {/* LEFT SIDE: Content (Now Dominant) */}
        <div className="flex-1 h-full flex flex-col relative">
          
          {/* Header */}
          <header className="absolute top-0 left-0 w-full p-8 md:p-12 flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Gridly Logo"
              className="w-10 h-10 "
            />
            <span className="font-bold text-zinc-900 tracking-tight text-xl">
              Gridly.
            </span>
          </header>


          {/* Main Centered Content */}
          <main className="flex-1 flex flex-col justify-center items-center px-6 md:px-12">
            <div className="w-full max-w-md">
              <div className="mb-10">
                <h1 className="text-4xl md:text-5xl font-semibold text-zinc-900 tracking-tight mb-4">
                  Welcome to <br />
                  <span className="text-zinc-400">Smart Image Layouts</span>
                </h1>
                <p className="text-zinc-500 text-lg leading-relaxed">
                  Drag, drop, and let AI organize your chaos. Turn scattered images
            and PDFs into perfect A4 sheets in seconds.
                </p>
              </div>

              {/* Login Container */}
              <div className="w-full">
                <Login />
              </div>

              {/* Support Buttons */}
              <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full justify-center">
                <BuyMeACoffee className="flex-1 sm:flex-none sm:min-w-[140px]" />
                <GitHubStar className="flex-1 sm:flex-none sm:min-w-[140px]" />
              </div>

              {/* Feature Highlights */}
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-center">
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                  <div className="text-indigo-600 text-sm font-semibold">Smart AI</div>
                  <div className="text-xs text-zinc-500 mt-1">Optimal layouts</div>
                </div>
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                  <div className="text-purple-600 text-sm font-semibold">Images Extract</div>
                  <div className="text-xs text-zinc-500 mt-1">Auto-detect objects</div>
                </div>
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                  <div className="text-emerald-600 text-sm font-semibold">PDF Ready</div>
                  <div className="text-xs text-zinc-500 mt-1">Export instantly</div>
                </div>
  
              </div>

              {/* Footer Links */}
              <div className="mt-12 pt-8 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-400">
                <span>© 2026 Gridly Studio</span>
                <div className="flex gap-4">
                   <a href="#" className="hover:text-zinc-600 transition-colors">Help</a>
                   <a href="#" className="hover:text-zinc-600 transition-colors">Privacy</a>
                </div>
              </div>
            </div>
          </main>
        </div>

        {/* RIGHT SIDE: Sidebar Visual (Constrained Width) */}
        <div className="hidden lg:flex w-[400px] xl:w-[500px] h-full bg-zinc-50 border-l border-zinc-100 items-center justify-center relative overflow-hidden shrink-0">
          
          {/* Technical Grid Background */}
          <div className="absolute inset-0 opacity-[0.4]" 
               style={{ 
                 backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', 
                 backgroundSize: '24px 24px' 
               }}>
          </div>

          {/* Decorative Blur */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-100/80 rounded-full blur-3xl pointer-events-none"></div>

          {/* Logo Display */}
          <div className="relative z-10 flex flex-col items-center p-8">
             <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-zinc-200/50 border border-white ring-1 ring-zinc-50 transform transition-transform duration-700 hover:scale-105">
                <img 
                  src="/logo_web.png" 
                  alt="Gridly Logo" 
                  className="w-100 h-100 xl:w-108 xl:h-108 object-contain"
                />
             </div>
             <div className="mt-8 text-center space-y-1">
               <p className="text-zinc-900 font-medium text-sm">Workflow Optimized</p>
               <p className="text-zinc-400 text-xs">v1.0.0</p>
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
        <div className="fixed inset-0 bg-zinc-900/20 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl border border-zinc-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-4 text-amber-500">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-2">Session Expiring</h3>
              <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
                For security, your session will close in 10 minutes due to inactivity.
              </p>
              <div className="flex flex-col w-full gap-3">
                <button 
                  onClick={handleStayActive} 
                  className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-all"
                >
                  Continue Working
                </button>
                <button 
                  onClick={handleLogoutNow} 
                  className="w-full py-2.5 bg-white border border-zinc-200 text-zinc-600 text-sm font-medium rounded-lg hover:bg-zinc-50 transition-all"
                >
                  Sign Out
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
