import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AppRail } from "@/components/app-rail";
import { ThemeProvider } from "@/components/theme-provider";
import { TopBar } from "@/components/top-bar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { RAIL_SCRIPT } from "@/lib/rail";
import "../globals.css";

// Display/UI face and the mono used for every price, figure and label (see docs/design.md).
const sans = Schibsted_Grotesk({ variable: "--font-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await initLocale();
  if (!locale) notFound();
  const t = await getTranslations("Nav");

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Collapsed rail state from the `rail` cookie, applied before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: RAIL_SCRIPT }} />
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              <a
                href="#main"
                className="bg-foreground text-background sr-only z-50 rounded-[4px] px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
              >
                {t("skipToContent")}
              </a>
              <div className="flex min-h-svh flex-1">
                <AppRail />
                <div className="flex min-w-0 flex-1 flex-col">
                  <TopBar />
                  <main
                    id="main"
                    tabIndex={-1}
                    className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 outline-none sm:px-6 md:py-10 lg:px-10"
                  >
                    {children}
                  </main>
                </div>
              </div>
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
