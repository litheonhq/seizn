export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">Welcome to Your Seizn App</h1>
      <p className="text-gray-600 mb-8">
        Your project is set up with Seizn AI Infrastructure.
      </p>

      <div className="bg-gray-100 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Getting Started</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            Add your <code className="bg-gray-200 px-1 rounded">SEIZN_API_KEY</code> to{' '}
            <code className="bg-gray-200 px-1 rounded">.env.local</code>
          </li>
          <li>
            Check out the{' '}
            <a href="https://seizn.com/docs" className="text-blue-600 hover:underline">
              Seizn documentation
            </a>
          </li>
          <li>Start building with RAG-powered AI features</li>
        </ul>
      </div>
    </main>
  );
}
