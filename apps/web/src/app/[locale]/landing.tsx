import { ArrowRight } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/*
 * Signed-out home. Everything on the receipt is made-up sample data, labelled as such; the
 * shop names are invented so nobody mistakes them for real quotes.
 */
const SAMPLE = [
  { shop: "Byte Depot", price: 489.9, stock: true },
  { shop: "Loja Norte", price: 467.5, stock: true },
  { shop: "Chip & Co.", price: 455.0, stock: false },
  { shop: "Volt Store", price: 479.99, stock: true },
];
const LOW_30 = 462.9;

const signalCta =
  "bg-primary text-primary-foreground border-transparent hover:bg-primary/90 hover:text-primary-foreground";

/** Full-width rule with a mono label sitting on it: "— 02 How it works". */
function RuleLabel({ num, children, id }: { num: string; children: string; id?: string }) {
  return (
    <div className="relative mb-8 flex items-center">
      <span aria-hidden className="bg-foreground absolute inset-x-0 top-1/2 h-px" />
      <h2
        id={id}
        className="bg-background text-foreground relative pr-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em]"
      >
        <span className="text-primary">— {num}</span> {children}
      </h2>
    </div>
  );
}

async function Receipt() {
  const t = await getTranslations("Landing.receipt");
  const format = await getFormatter();
  const inStock = SAMPLE.filter((s) => s.stock);
  const best = inStock.reduce((a, b) => (b.price < a.price ? b : a));
  const worst = inStock.reduce((a, b) => (b.price > a.price ? b : a));

  return (
    <figure className="w-full max-w-[26rem] justify-self-center lg:justify-self-end">
      <div
        role="group"
        aria-label={t("label")}
        className="bg-card text-card-foreground relative rounded-[6px] border px-5 pb-5 pt-4 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)] motion-reduce:rotate-0 sm:px-6 lg:rotate-[0.6deg]"
      >
        <div className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.08em]">
          <span className="text-muted-foreground">{t("title")}</span>
          <span className="border-border text-muted-foreground rounded-[2px] border px-1.5 py-0.5">
            {t("sample")}
          </span>
        </div>

        <p className="mt-4 text-lg font-bold leading-tight tracking-[-0.01em]">{t("part")}</p>
        <p className="text-muted-foreground mt-1 font-mono text-xs">{t("code")}</p>

        <div aria-hidden className="border-foreground/40 my-4 border-t border-dashed" />

        <table className="w-full font-mono text-[13px] tabular-nums">
          <thead className="sr-only">
            <tr>
              <th scope="col">{t("shop")}</th>
              <th scope="col">{t("price")}</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.map((row) => {
              const cheapest = row === best;
              return (
                <tr
                  key={row.shop}
                  className={cn(
                    cheapest && "bg-primary/10 dark:bg-primary/15",
                    !row.stock && "text-muted-foreground",
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      "py-2 pl-2 pr-3 text-left font-normal",
                      cheapest && "border-primary border-l-[3px] pl-[5px] font-semibold",
                    )}
                  >
                    <span className="block">{row.shop}</span>
                    <span className="text-[11px] uppercase tracking-[0.06em]">
                      {cheapest ? (
                        <span className="bg-primary text-primary-foreground mt-0.5 inline-block rounded-[2px] px-1 font-semibold">
                          {t("cheapest")}
                        </span>
                      ) : row.stock ? (
                        <span className="text-muted-foreground">{t("inStock")}</span>
                      ) : (
                        t("outOfStock")
                      )}
                    </span>
                  </th>
                  <td
                    className={cn(
                      "py-2 pr-2 text-right align-top",
                      cheapest && "text-foreground text-base font-semibold",
                      !row.stock && "line-through",
                    )}
                  >
                    {format.number(row.price, "price")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div aria-hidden className="border-foreground/40 my-4 border-t border-dashed" />

        <dl className="grid gap-1.5 font-mono text-[13px] tabular-nums">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("low30")}</dt>
            <dd>{format.number(LOW_30, "price")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("spread")}</dt>
            <dd>{format.number(worst.price - best.price, "price")}</dd>
          </div>
        </dl>

        <div aria-hidden className="border-foreground/40 my-4 border-t border-dashed" />

        <p className="text-muted-foreground text-center font-mono text-[11px] uppercase tracking-[0.08em]">
          {t("checked")}
        </p>
      </div>
      <figcaption className="text-muted-foreground mt-3 text-center text-xs lg:text-right">
        {t("caption")}
      </figcaption>
    </figure>
  );
}

export async function Landing() {
  const t = await getTranslations("Landing");
  const steps = (["step1", "step2", "step3"] as const).map((key, i) => ({
    key,
    num: String(i + 1).padStart(2, "0"),
  }));

  return (
    <div className="grid gap-20 md:gap-28">
      {/* Hero: asymmetric, left-aligned statement + the receipt on the right. */}
      <section className="grid items-center gap-12 pt-2 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:pt-8">
        <div className="min-w-0">
          <p className="text-primary mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
            {t("kicker")}
          </p>
          <h1 className="text-[42px] font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-[56px] xl:text-7xl 2xl:text-[84px]">
            <span className="block">{t("headline1")}</span>
            <span className="block">
              {t("headline2")}
              <span
                aria-hidden
                className="bg-primary ml-[0.08em] inline-block size-[0.2em] align-baseline"
              />
            </span>
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-pretty text-base leading-7 sm:text-lg">
            {t("subline")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={{ pathname: "/sign-in", query: { mode: "signup" } }}
              className={cn(buttonVariants({ size: "lg" }), signalCta)}
            >
              {t("create")}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/sign-in" className={buttonVariants({ size: "lg", variant: "outline" })}>
              {t("signIn")}
            </Link>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">{t("note")}</p>
        </div>
        <Receipt />
      </section>

      {/* How it works: three numbered steps on a ruled grid. */}
      <section aria-labelledby="how-title">
        <RuleLabel num="02" id="how-title">
          {t("how.label")}
        </RuleLabel>
        <p className="mb-10 max-w-2xl text-balance text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
          {t("how.title")}
        </p>
        <ol className="border-foreground grid border-t md:grid-cols-3">
          {steps.map(({ key, num }) => (
            <li
              key={key}
              className="border-border border-b py-6 md:border-b-0 md:border-l md:px-6 md:py-8 md:first:border-l-0 md:first:pl-0"
            >
              <span className="text-primary font-mono text-sm font-semibold tabular-nums">
                {num}
              </span>
              <h3 className="mt-3 text-xl font-bold tracking-[-0.01em]">{t(`how.${key}.title`)}</h3>
              <p className="text-muted-foreground mt-2 text-[15px] leading-6">
                {t(`how.${key}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA band: ink block, paper text. */}
      <section
        aria-labelledby="band-title"
        className="bg-foreground text-background grid gap-6 rounded-[6px] px-6 py-10 sm:px-10 md:grid-cols-[1fr_auto] md:items-center md:py-12"
      >
        <div>
          <h2
            id="band-title"
            className="text-balance text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl"
          >
            {t("band.title")}
          </h2>
          <p className="text-background/75 mt-2 text-base">{t("band.body")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={{ pathname: "/sign-in", query: { mode: "signup" } }}
            className={cn(buttonVariants({ size: "lg" }), signalCta)}
          >
            {t("create")}
          </Link>
          <Link
            href="/sign-in"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "border-background/40 text-background hover:bg-background/10 hover:text-background bg-transparent",
            )}
          >
            {t("signIn")}
          </Link>
        </div>
      </section>
    </div>
  );
}
