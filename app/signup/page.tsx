'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Card, CardBody, CardHeader } from '@heroui/react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Shield, Loader2 } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Create user record in database
        const response = await fetch('/api/auth/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: data.user.id,
            email: data.user.email,
            fullName,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create user profile');
        }

        router.push('/dashboard');
        router.refresh();
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };


  return (
    <ErrorBoundary>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary-50/30 to-background dark:from-default-900 dark:via-primary-950/30 dark:to-default-900 p-4">
        <Card className="w-full max-w-md shadow-2xl border border-default-200 dark:border-default-100">
        <CardHeader className="flex flex-col items-center space-y-4 pb-6">
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary-400 rounded-full animate-pulse"></div>
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
              Create Account
            </h1>
            <p className="text-default-500 text-sm">
              Get started with Compliance Copilot
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          {error && (
            <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <Input
              type="text"
              label="Full Name"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              variant="bordered"
              size="lg"
              classNames={{
                input: "text-base",
                label: "text-default-600 dark:text-default-400"
              }}
            />

            <Input
              type="email"
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              variant="bordered"
              size="lg"
              classNames={{
                input: "text-base",
                label: "text-default-600 dark:text-default-400"
              }}
            />

            <Input
              type="password"
              label="Password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              variant="bordered"
              size="lg"
              description="Must be at least 6 characters"
              classNames={{
                input: "text-base",
                label: "text-default-600 dark:text-default-400",
                description: "text-xs"
              }}
            />

            <Button
              type="submit"
              color="primary"
              size="lg"
              className="w-full font-semibold"
              isLoading={loading}
              startContent={!loading && <Shield className="w-4 h-4" />}
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </Button>
          </form>

          <div className="text-center text-sm pt-4 border-t border-default-200 dark:border-default-100">
            <span className="text-default-500">Already have an account? </span>
            <Link href="/login" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
    </ErrorBoundary>
  );
}

