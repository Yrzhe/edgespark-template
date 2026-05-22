/**
 * App.tsx — Main application component.
 *
 * This is the entry point for your web UI. Replace the placeholder
 * below with your own components and pages.
 *
 * Stack: React 19, TypeScript, Tailwind CSS v4, Vite
 *
 * Getting started:
 * - EdgeSpark client is ready at src/lib/edgespark.ts (auth + API)
 * - Add components in src/components/
 * - Add pages in src/pages/
 * - Add routing with react-router-dom
 * - Tailwind CSS is ready — use utility classes directly
 */

import logo from '/logo-edgespark.svg'

function App() {
  // TODO: Replace this placeholder with your application UI
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="text-center max-w-2xl mx-auto px-6 py-8">
        <img src={logo} alt="EdgeSpark" className="w-48 sm:w-64 lg:w-80 mx-auto mb-8" />

        <h1 className="text-white font-normal leading-tight text-4xl sm:text-5xl lg:text-6xl mb-4">
          EdgeSpark App
        </h1>

        <p className="text-neutral-400 font-normal leading-relaxed text-base sm:text-lg lg:text-xl max-w-xl mx-auto">
          Every Spark Ships.
        </p>
      </div>
    </main>
  )
}

export default App
