import React from 'react';

export const formatViews = (views: number | null | undefined) => {
  if (!views) return '0';
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(0)}K`;
  return views.toLocaleString();
};

export const formatSeparators = (text: string) => {
  if (!text) return '';
  // First replace " & " with " / "
  let formatted = text.replaceAll(' & ', ' / ');
  
  // Then replace " / " with styled span
  formatted = formatted.split(' / ').map(part => {
    return part;
  }).join(' <span style="color: #737373; font-weight: 300; margin: 0 4px;">/</span> ');
  
  // Then replace " vs " or " vs. " (case-insensitive) with styled span
  formatted = formatted.replace(/\s+(?:vs|v\.?s\.?|versus)\s+/i, ' <span style="color: #737373; font-weight: 500; font-style: italic; text-transform: lowercase; margin: 0 4px;">vs</span> ');
  
  return formatted;
};

export const renderStyledName = (text: string) => {
  if (!text) return null;
  // Replace " & " with " / "
  const cleanText = text.replaceAll(' & ', ' / ');
  
  // Split by " vs " or " vs. " (case-insensitive)
  const battleParts = cleanText.split(/\s+(?:vs|v\.?s\.?|versus)\s+/i);
  
  return (
    <>
      {battleParts.map((battlePart, bIdx) => {
        // Split each part by " / "
        const teamParts = battlePart.split(' / ');
        return (
          <span key={bIdx}>
            {teamParts.map((name, tIdx) => (
              <span key={tIdx}>
                <span className="whitespace-nowrap">{name}</span>
                {tIdx < teamParts.length - 1 && (
                  <span className="text-neutral-500/60 font-light mx-1">/</span>
                )}
              </span>
            ))}
            {bIdx < battleParts.length - 1 && (
              <span className="text-neutral-500/60 font-medium italic lowercase mx-1.5">vs</span>
            )}
          </span>
        );
      })}
    </>
  );
};
