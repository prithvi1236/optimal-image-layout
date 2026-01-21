import React from 'react';
import { Coffee, Heart } from 'lucide-react';

interface Person {
  name: string;
  username: string;
}

interface BuyMeACoffeeProps {
  people?: Person[];
  className?: string;
}

const BuyMeACoffee: React.FC<BuyMeACoffeeProps> = ({
  people = [
    { name: 'Prithvi', username: 'prithvb' },
    { name: 'Adwin', username: 'adwintsunig' }
  ],
  className = ''
}) => {
  const handleClick = (username: string) => {
    window.open(
      `https://buymeacoffee.com/${username}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <div className={`flex gap-3 ${className}`}>
      {people.map((person) => (
        <button
          key={person.username}
          onClick={() => handleClick(person.username)}
          className="
            group relative overflow-hidden
            bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500
            hover:from-amber-500 hover:via-orange-500 hover:to-amber-600
            text-white font-bold text-sm
            px-4 py-2 rounded-lg
            shadow-lg hover:shadow-xl
            transform hover:scale-105 active:scale-95
            transition-all duration-200 ease-out
            border border-amber-300/50
          "
          title={`Support ${person.name}`}
        >
          <div className="relative flex items-center gap-2">
            <Coffee size={16} />
            <span>Buy {person.name} a coffee</span>
            <Heart size={12} fill="currentColor" />
          </div>
        </button>
      ))}
    </div>
  );
};

export default BuyMeACoffee;
