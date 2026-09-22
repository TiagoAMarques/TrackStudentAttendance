import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './corrections.css';
import './semester.css';
import './student.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {width:'device-width',initialScale:1,themeColor:'#052048'};

export const metadata: Metadata = {
  title: 'Pulse — Attendance & participation',
  description: 'Simple, private attendance and classroom participation tracking.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Pulse',
  icons: {icon:'/favicon.svg',apple:'/icons/pulse-192.png'},
  appleWebApp: { capable: true, title: 'Pulse', statusBarStyle: 'black-translucent' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
