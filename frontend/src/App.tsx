import React from "react";
import ImageCanvasStudio from "./ImageCanvas"; // Ensure this path matches where you saved the previous code

function App() {
  return (
    // Force full viewport height and width, set base background and font
    <div className="w-screen h-screen bg-zinc-50 text-zinc-900 font-sans overflow-hidden selection:bg-indigo-100 selection:text-indigo-700">
      <ImageCanvasStudio />
    </div>
  );
}

export default App;