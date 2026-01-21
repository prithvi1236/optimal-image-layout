import React from 'react';
import { Star, Github } from 'lucide-react';

interface GitHubStarProps {
  username?: string;
  repository?: string;
  className?: string;
}

const GitHubStar: React.FC<GitHubStarProps> = ({ 
  username = 'prithvi1236', 
  repository = 'optimal-image-layout',
  className = '' 
}) => {
  const handleClick = () => {
    window.open(`https://github.com/${username}/${repository}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      className={`
        group relative overflow-hidden
        bg-gradient-to-r from-gray-800 via-gray-900 to-black
        hover:from-gray-700 hover:via-gray-800 hover:to-gray-900
        text-white font-bold text-sm
        px-4 py-2 rounded-lg
        shadow-lg hover:shadow-xl
        transform hover:scale-105 active:scale-95
        transition-all duration-200 ease-out
        border border-gray-600/50
        ${className}
      `}
      title="Star on GitHub"
    >
      {/* Animated background shimmer */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
      
      {/* Content */}
      <div className="relative flex items-center gap-2">
        <Github 
          size={16} 
          className="group-hover:rotate-12 transition-transform duration-200" 
        />
        
        <span className="whitespace-nowrap">Star on GitHub</span>
        
        <Star 
          size={12} 
          className="text-yellow-300 group-hover:text-yellow-200 group-hover:scale-110 transition-all duration-200" 
          fill="currentColor"
        />
      </div>
      
      {/* Subtle glow effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-gray-700/20 to-gray-900/20 blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
    </button>
  );
};

export default GitHubStar;