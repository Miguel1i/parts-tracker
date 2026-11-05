"use client";

import { Link2, ListPlus, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { addByUrl, addCatalogProduct, importPcpp, searchCatalog } from "./actions";

/** Same as `slugText` in @parts/core, copied so the client bundle doesn't pull in the HTML parser. */
function slugText(url: string): string {
  let path = url;
  try {
    path = new URL(url, "https://x.invalid").pathname;
  } catch {
    // keep as is
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep as is
  }
  return path
    .replace(/[-_/.+]+/g, " ")
    .replace(/\bhtml?\b/g, " ")
    .trim();
}

type Hit = { id: string; name: string; category: string | null };

function SearchTab({ buildId }: { buildId: string }) {
  const t = useTranslations("Builds.add.search");
  const { pending, run } = useServerAction();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await searchCatalog({ q: term });
        if (mine === seq.current) setHits(res.ok ? res.data : []);
      } catch {
        if (mine === seq.current) setHits([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const shown = q.trim() ? hits : null;
  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-2 size-4" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("label")}
          className="pl-8"
        />
      </div>
      {shown && shown.length === 0 && <p className="text-muted-foreground text-sm">{t("none")}</p>}
      {shown && shown.length > 0 && (
        <ul className="divide-y rounded-[4px] border">
          {shown.map((h) => (
            <li key={h.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 break-words">{h.name}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                aria-label={t("addNamed", { name: h.name })}
                onClick={() =>
                  run(() => addCatalogProduct({ buildId, productId: h.id }), {
                    success: t("added"),
                  })
                }
              >
                <Plus className="size-4" />
                {t("add")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UrlTab({ buildId }: { buildId: string }) {
  const t = useTranslations("Builds.add.url");
  const { pending, run } = useServerAction();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [gtin, setGtin] = useState("");

  function onUrl(value: string) {
    setUrl(value);
    if (!nameTouched) setName(slugText(value));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(() => addByUrl({ buildId, url, name, gtin: gtin.trim() || undefined }), {
      onSuccess: (data) => {
        toast.success(data.created ? t("created") : t("existing"));
        setUrl("");
        setName("");
        setNameTouched(false);
        setGtin("");
      },
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="add-url">{t("url")}</Label>
        <Input
          id="add-url"
          type="url"
          required
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://www.pcdiga.com/…"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="add-name">{t("name")}</Label>
        <Input
          id="add-name"
          required
          minLength={2}
          maxLength={200}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
        />
        <p className="text-muted-foreground text-xs">{t("nameHint")}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="add-gtin">{t("gtin")}</Label>
        <Input
          id="add-gtin"
          inputMode="numeric"
          value={gtin}
          onChange={(e) => setGtin(e.target.value)}
          placeholder="0123456789012"
        />
      </div>
      <Button
        type="submit"
        disabled={pending || !url.trim() || name.trim().length < 2}
        className="w-fit"
      >
        <Link2 className="size-4" />
        {t("submit")}
      </Button>
    </form>
  );
}

function ImportTab({ buildId }: { buildId: string }) {
  const t = useTranslations("Builds.add.import");
  const { pending, run } = useServerAction();
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(() => importPcpp({ buildId, text, replace }), {
      onSuccess: (data) => {
        toast.success(t("done", { added: data.added, matched: data.matched }));
        setText("");
      },
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="import-text">{t("label")}</Label>
        <Textarea
          id="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={50000}
          className="font-mono text-xs"
          placeholder={t("placeholder")}
        />
        <p className="text-muted-foreground text-xs">{t("hint")}</p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="import-replace"
          checked={replace}
          onCheckedChange={(v) => setReplace(v === true)}
        />
        <Label htmlFor="import-replace" className="font-normal">
          {t("replace")}
        </Label>
      </div>
      <Button type="submit" disabled={pending || !text.trim()} className="w-fit">
        <ListPlus className="size-4" />
        {t("submit")}
      </Button>
    </form>
  );
}

export function AddPanel({ buildId }: { buildId: string }) {
  const t = useTranslations("Builds.add");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="search">
          <TabsList className="h-auto max-w-full flex-wrap">
            <TabsTrigger value="search">{t("search.tab")}</TabsTrigger>
            <TabsTrigger value="url">{t("url.tab")}</TabsTrigger>
            <TabsTrigger value="import">{t("import.tab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="search" className="pt-2">
            <SearchTab buildId={buildId} />
          </TabsContent>
          <TabsContent value="url" className="pt-2">
            <UrlTab buildId={buildId} />
          </TabsContent>
          <TabsContent value="import" className="pt-2">
            <ImportTab buildId={buildId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
