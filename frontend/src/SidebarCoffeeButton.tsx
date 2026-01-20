import React from 'react';
import { Coffee } from 'lucide-react';

interface SidebarCoffeeButtonProps {
  username?: string;
  className?: string;
}

const SidebarCoffeeButton: React.FC<SidebarCoffeeButtonProps> = ({ 
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
        w-full group relative overflow-hidden
        bg-gradient-to-r from-amber-50 to-orange-50
        hover:from-amber-100 hover:to-orange-100
        border border-amber-200 hover:border-amber-300
        text-amber-700 hover:text-amber-800
        font-medium text-xs
        px-3 py-2 rounded-lg
        transition-all duration-200 ease-out
        flex items-center justify-center gap-2
        ${className}
      `}
      title="Support this project ☕"
    >
      <Coffee 
        size={14} 
        className="group-hover:rotate-12 transition-transform duration-200" 
      />
      <span>Support Dev</span>
      
      {/* Subtle hover effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-100/50 to-orange-100/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg" />
    </button>
  );
};

export default SidebarCoffeeButton;