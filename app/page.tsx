import { fetchGraphDataForVisualization } from './actions';
import GraphClient from './ForceGraphWrapper';


export const dynamicConfig = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';

export default async function VisualizationAdminPage() {
  const result = await fetchGraphDataForVisualization();

  const graphData = result.success && result.data ? result.data : { nodes: [], links: [] };

  return (
    <div className="w-full h-[100dvh] bg-black text-white relative overflow-hidden">

      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-10 pointer-events-none">
        <div className="pointer-events-auto opacity-60 hover:opacity-100 transition-opacity duration-300 select-none">
          <h1 className="text-lg font-bold text-[#EFEFEF] tracking-widest uppercase mb-1">pulso</h1>
          <p className="text-[#666] text-[10px] tracking-wider uppercase max-w-xs leading-relaxed">
            Mapping the constellation of Filipino battle rap.
          </p>
        </div>
      </div>

      {/* <div className="absolute bottom-6 right-6 z-[60] pointer-events-auto flex items-center gap-2">

        <Link href="/admin" className="text-sm text-[#A3A3A3] hover:text-[#EFEFEF] transition-all bg-transparent md:px-3 md:py-2 md:rounded-md max-md:w-10 max-md:h-10 max-md:rounded-md max-md:bg-[#121212]/30 max-md:backdrop-blur-md max-md:border max-md:border-white/5 flex items-center justify-center opacity-60 hover:opacity-100">
          <span className="max-md:hidden">Admin &rarr;</span>
          <svg className="w-5 h-5 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </Link>
      </div> */}

      <div className="w-full h-full">
        <GraphClient graphData={graphData} />
      </div>


    </div>
  );
}
