import type { Metadata } from 'next';
import { IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Brae CFD — interFoam Dam Break Solver',
  description:
    'Interactive 2D Volume-of-Fluid (VoF) multiphase CFD simulation of the Kleefsman et al. (2005) Dam Break over an Obstacle benchmark with real-time P1 impact pressure telemetry and wave gauges.',
  openGraph: {
    title: 'Brae CFD — interFoam Dam Break Solver',
    description:
      'Interactive 2D Volume-of-Fluid (VoF) multiphase CFD simulation of the Kleefsman et al. (2005) Dam Break over an Obstacle benchmark with real-time P1 impact pressure telemetry and wave gauges.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Brae CFD — interFoam Dam Break Solver',
    description:
      'Interactive 2D Volume-of-Fluid (VoF) multiphase CFD simulation of the Kleefsman et al. (2005) Dam Break over an Obstacle benchmark with real-time P1 impact pressure telemetry and wave gauges.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${jetbrainsMono.variable} dark`}
    >
      <body
        suppressHydrationWarning
        className="bg-[#07090E] text-slate-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200"
      >
        {children}
      </body>
    </html>
  );
}
