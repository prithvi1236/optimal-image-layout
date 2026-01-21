import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ImageCanvasStudio from "./ImageCanvas";
import Login from "./Components/Login";

export default function App() {
  return (
    <BrowserRouter>
      <div className="w-screen h-screen bg-zinc-50 text-zinc-900 font-sans overflow-hidden">
        <Routes>
          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          <Route path="/login" element={<Login />} />
          
          {/* Ensure this matches your login navigate("/studio") */}
          <Route path="/studio" element={<ImageCanvasStudio />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}