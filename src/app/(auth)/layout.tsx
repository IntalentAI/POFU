export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 py-12">
      <div className="mb-6 text-center">
        <div className="text-lg font-semibold text-brand-900">intalent <span className="text-brand-600">Joining Assurance</span></div>
        <div className="muted">Every offer deserves a successful Day 1.</div>
      </div>
      <div className="card w-full max-w-sm p-6">{children}</div>
    </div>
  );
}
