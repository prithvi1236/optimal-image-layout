import React, { useEffect, useState } from "react";
import ImageCanvasStudio from "./ImageCanvas";
import Login from "./Components/Login";
import { supabase } from "./Components/supabaseClient";

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    });

    return () => subscription.unsubscribe();
  }, []);

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
      <div className="w-screen h-screen bg-zinc-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-zinc-900 mb-2">
              Smart Image Layout
            </h1>
            <p className="text-zinc-600 text-sm">
              Optimize your image layouts with AI-powered arrangement
            </p>
          </div>
          <Login />
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-zinc-50 text-zinc-900 font-sans overflow-hidden selection:bg-indigo-100 selection:text-indigo-700">
      <ImageCanvasStudio />
    </div>
  );
}

export default App;