import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="max-w-5xl mx-auto px-6 pt-8">
        <span className="text-xl font-semibold text-accent-700 tracking-tight">
          Intake
        </span>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-24 pb-20">
        <h1 className="text-5xl font-bold text-gray-900 tracking-tight leading-tight mb-6">
          Track nutrition through conversation
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mb-10 leading-relaxed">
          Tell Claude what you ate. It logs the nutrition data automatically via
          MCP, and you review everything here.
        </p>
        <Link
          href="/app"
          className="inline-block px-6 py-3 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-700 transition-colors"
        >
          Open dashboard
        </Link>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 pb-32">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-8">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <p className="text-sm font-medium text-accent-600 mb-2">01</p>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Tell Claude what you ate
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Describe your meals in natural language. No forms, no barcode
              scanning.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-accent-600 mb-2">02</p>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              AI logs the data
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Claude uses MCP tools to look up nutrition info and save your meal
              with full macro breakdowns.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-accent-600 mb-2">03</p>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Review your dashboard
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              See daily totals, meal history, and tracked metrics at a glance.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <p className="text-center text-xs text-gray-400">
          Powered by Model Context Protocol
        </p>
      </footer>
    </main>
  );
}
