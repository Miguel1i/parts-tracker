"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const ProductHistoryChartLazy = dynamic(
  () => import("./product-history-chart").then((m) => m.ProductHistoryChart),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> },
);

export const ProductOffersChartLazy = dynamic(
  () => import("./product-offers-chart").then((m) => m.ProductOffersChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
