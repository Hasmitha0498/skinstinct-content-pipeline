import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The webhook reads data/voice-skill.txt at runtime as a fallback when the Supabase copy is
  // unreachable. Vercel only ships files it can trace, so include it explicitly.
  outputFileTracingIncludes: {
    '/api/webhook': ['./data/voice-skill.txt'],
    '/api/status': ['./data/voice-skill.txt'],
  },
  poweredByHeader: false,
};

export default nextConfig;
