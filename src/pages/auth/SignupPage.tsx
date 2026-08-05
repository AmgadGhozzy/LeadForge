// ──────────────────────────────────────────────
// Signup Page — New Account Registration
// ──────────────────────────────────────────────

import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Sparkles, Eye, EyeOff, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

export function SignupPage() {
  const { user, loading: authLoading, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { error: signUpError } = await signUp(email, password);
    if (signUpError) {
      setError(signUpError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen dark">
      {/* Left Panel — Branding */}
      <div className="relative hidden w-1/2 overflow-hidden lg:flex lg:flex-col lg:justify-between"
        style={{ background: 'linear-gradient(135deg, hsl(170 60% 15%), hsl(160 84% 12%), hsl(224 71% 4%))' }}
      >
        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-xl font-bold text-white">LeadForge</span>
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl font-bold leading-tight text-white">
              Start finding leads<br />
              <span className="bg-gradient-to-r from-teal-400 to-emerald-300 bg-clip-text text-transparent">
                in minutes
              </span>
            </h1>
            <div className="space-y-4">
              {[
                'Import businesses from Google Places',
                'AI-powered website analysis',
                'Auto-generated sales proposals',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-white/70">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-white/30">© 2026 LeadForge. All rights reserved.</p>
        </div>

        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Right Panel — Form */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-1/2">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">LeadForge</span>
          </div>

          {success ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Check your email</h2>
                <p className="text-muted-foreground">
                  We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
                  Click it to activate your account.
                </p>
              </div>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Back to Sign In
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Create your account</h2>
                <p className="text-muted-foreground">Get started with LeadForge for free</p>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                    className="flex h-11 w-full rounded-lg border border-input bg-card px-4 text-sm
                      placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
                      transition-all duration-200"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      autoComplete="new-password"
                      className="flex h-11 w-full rounded-lg border border-input bg-card px-4 pr-11 text-sm
                        placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
                        transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirm-password" className="text-sm font-medium">
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    autoComplete="new-password"
                    className="flex h-11 w-full rounded-lg border border-input bg-card px-4 text-sm
                      placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
                      transition-all duration-200"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600
                    font-medium text-white shadow-lg shadow-emerald-500/25
                    hover:from-emerald-400 hover:to-teal-500 hover:shadow-emerald-500/35
                    focus:outline-none focus:ring-2 focus:ring-primary/50
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-200"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
