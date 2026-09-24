import type { ReactNode } from 'react';

export const metadata = { title: 'Skinstinct content pipeline', robots: { index: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '48px auto', padding: '0 16px', lineHeight: 1.5 }}>{children}</body>
    </html>
  );
}
