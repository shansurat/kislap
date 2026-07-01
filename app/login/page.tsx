import { login, signup } from './actions'
import Link from 'next/link'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-white font-sans p-6">
      <div className="w-full max-w-sm bg-[#121212]/30 backdrop-blur-md border border-white/5 p-8 rounded-lg">
        <form className="flex flex-col w-full">
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-lg font-bold text-[#EFEFEF] tracking-widest uppercase mb-1">pulso</h1>
            <p className="text-[#666] text-[10px] tracking-widest uppercase">Admin Portal</p>
          </div>

          <label className="text-[10px] text-[#888] uppercase tracking-widest font-semibold mb-1.5" htmlFor="email">
            Email Address
          </label>
          <input
            className="rounded-md px-3 py-2 bg-[#121212]/40 border border-white/5 mb-5 text-[#A3A3A3] text-xs focus:text-[#EFEFEF] focus:outline-none focus:border-white/20 focus:bg-white/[0.04] placeholder-[#444] transition-all"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />

          <label className="text-[10px] text-[#888] uppercase tracking-widest font-semibold mb-1.5" htmlFor="password">
            Password
          </label>
          <input
            className="rounded-md px-3 py-2 bg-[#121212]/40 border border-white/5 mb-8 text-[#A3A3A3] text-xs focus:text-[#EFEFEF] focus:outline-none focus:border-white/20 focus:bg-white/[0.04] placeholder-[#444] transition-all"
            name="password"
            placeholder="••••••••"
            required
            type="password"
          />

          <button
            formAction={login}
            className="w-full bg-white/[0.07] hover:bg-white/[0.12] text-[#EFEFEF] border border-white/10 rounded-md py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-300 cursor-pointer"
          >
            Sign In
          </button>

          {message && (
            <p className="mt-4 p-3 bg-red-950/20 border border-red-500/10 text-red-400/80 text-xs text-center rounded-md font-mono">
              {message}
            </p>
          )}

          <Link
            href="/"
            className="text-center block text-[10px] text-[#555] hover:text-[#A3A3A3] uppercase tracking-wider mt-6 transition-colors"
          >
            &larr; Back to Graph
          </Link>
        </form>
      </div>
    </div>
  )
}
