import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const oldschoolGrotesk = localFont({
  src: [
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalLight.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalRegular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalMedium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalBold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalExtraBold.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-oldschool",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Flooor FUN — Instant NFT Liquidity & Daily Royalties",
  description:
    "Royalties to the community. Light-stake (sign) daily with your VRNoun on Base to earn 4.5% of every sale, or bid & sell instantly with zero listings.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "flooor.fun — Royalties to the community",
    description:
      "Light-stake daily with your VRNoun on Base to earn community sales royalties, or bid & sell instantly.",
    url: "https://flooor.fun",
    siteName: "flooor.fun",
    images: [{ url: "https://flooor.fun/hero.png" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "flooor.fun — Royalties to the community",
    description:
      "Light-stake daily with your VRNoun on Base to earn community sales royalties, or bid & sell instantly.",
    images: ["https://flooor.fun/hero.png"],
  },
  other: {
    "base:app_id": "6938998fe6be54f5ed71d4bf",
    "fc:miniapp": JSON.stringify({
      version: "next",
      imageUrl: "https://flooor.fun/bg.png",
      button: {
        title: "Open App",
        action: {
          type: "launch_frame",
          url: "https://flooor.fun",
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={oldschoolGrotesk.variable}>
      <body className={`${oldschoolGrotesk.className} bg-background antialiased`}>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-5B3B1SJBNH"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-5B3B1SJBNH');
          `}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
