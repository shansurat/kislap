'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '../login/actions';


export default function Neo4jLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', href: '/admin' },
  ];

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-[#A3A3A3] font-sans">
      {/* Sidebar */}
      <div className="w-64 fixed h-screen top-0 left-0 bg-[#0a0a0a] border-r border-white/5 flex flex-col z-50">
        <div className="p-4 border-b border-white/5">
          <h1 className="text-xs font-bold text-[#EFEFEF] tracking-widest uppercase">kislap Admin</h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`block px-3 py-2 rounded-md text-xs tracking-wider uppercase transition-all duration-200 ${isActive
                  ? 'bg-white/[0.06] text-[#EFEFEF] font-semibold'
                  : 'text-[#888] hover:bg-white/[0.02] hover:text-[#EFEFEF]'
                  }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">

          <Link href="/" className="w-full text-left px-3 py-2 rounded-md text-xs tracking-wider uppercase text-[#888] hover:bg-white/[0.02] hover:text-[#EFEFEF] transition-all mb-2 block">
            &larr; Public Page
          </Link>
          <button
            onClick={async () => {
              await signOut();
            }}
            className="w-full text-left px-3 py-2 rounded-md text-xs tracking-wider uppercase text-red-400/80 hover:bg-red-950/20 hover:text-red-300 transition-all cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 max-w-5xl ml-64">
        {children}
      </div>


    </div>
  );
}
