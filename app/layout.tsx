import type { Metadata, Viewport } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-serif', display: 'swap', weight: ['400', '600'], style: ['normal', 'italic'] });

export const metadata: Metadata = {
  title: 'From Raw Thought to Reviewable Post · Skinstinct content pipeline',
  description:
    'An AI-assisted content pipeline for Meera Pillai, founder of Skinstinct: Telegram notes become reviewable LinkedIn drafts, and Meera stays in control of what gets published.',
  robots: { index: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#faf8f5' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
