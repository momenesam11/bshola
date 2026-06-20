export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-primary-700 flex-col justify-between p-12 text-white">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-radial-gradient(circle at 15% 20%, transparent 0, transparent 60px, rgba(255,255,255,0.25) 61px)',
          }}
        />
        <div className="relative z-10">
          <img src="/logo.png" alt="بسهولة" className="h-10 w-auto object-contain" />
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight mb-4">{title}</h1>
          <p className="text-lg text-white/80">{subtitle}</p>
        </div>

        <p className="relative z-10 text-sm text-white/50">© {new Date().getFullYear()} بسهولة. كل الحقوق محفوظة.</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <img src="/logo.png" alt="بسهولة" className="h-12 w-auto object-contain mx-auto mb-3" />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
