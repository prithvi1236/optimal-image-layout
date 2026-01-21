import React from 'react';
import { Coffee, Heart } from 'lucide-react';

interface BuyMeACoffeeProps {
  username?: string;
  className?: string;
}

const BuyMeACoffee: React.FC<BuyMeACoffeeProps> = ({ 
  username = 'prithvb', 
  className = '' 
}) => {
  const handleClick = () => {
    window.open(`https://buymeacoffee.com/${username}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      className={`
        group relative overflow-hidden
        bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500
        hover:from-amber-500 hover:via-orange-500 hover:to-amber-600
        text-white font-bold text-sm
        px-4 py-2 rounded-lg
        shadow-lg hover:shadow-xl
        transform hover:scale-105 active:scale-95
        transition-all duration-200 ease-out
        border border-amber-300/50
        ${className}
      `}
      title="Support this project"
    >
      {/* Animated background shimmer */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
      
      {/* Content */}
      <div className="relative flex items-center gap-2">
        <div className="relative">
          <Coffee 
            size={16} 
            className="group-hover:rotate-12 transition-transform duration-200" 
          />
          {/* Steam animation */}
          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
            <div className="w-0.5 h-2 bg-white/60 rounded-full animate-pulse opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        </div>
        
        <span className="whitespace-nowrap">Buy me a coffee</span>
        
        <Heart 
          size={12} 
          className="text-red-200 group-hover:text-red-100 group-hover:scale-110 transition-all duration-200" 
          fill="currentColor"
        />
      </div>
      
      {/* Subtle glow effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-amber-400/20 to-orange-400/20 blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
    </button>
  );
};

export default BuyMeACoffee;