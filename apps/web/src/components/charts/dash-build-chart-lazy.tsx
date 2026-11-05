"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const BuildTotalChartLazy = dynamic(
  () => import("./dash-build-chart").then((m) => m.BuildTotalChart),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> },
);

export const MoversChartLazy = dynamic(
  () => import("./dash-movers-chart").then((m) => m.MoversChart),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> },
);
