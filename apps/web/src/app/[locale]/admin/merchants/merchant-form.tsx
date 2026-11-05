"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { useAdminAction } from "@/components/admin/use-admin-action";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { mergeAdapterConfig } from "@/lib/admin/adapter-schema";
import { createMerchant, deleteMerchant, updateMerchant } from "./actions";
import { merchantValuesSchema, type MerchantFormValues } from "./schema";

type Errors = Partial<Record<string, string>>;

function TextField({
  label,
  hint,
  error,
  value,
  onChange,
  className,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const id = useId();
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-muted-foreground text-xs">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function SwitchField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

export function MerchantForm({
  merchantId,
  merchantName,
  initial,
}: {
  merchantId?: string;
  merchantName?: string;
  initial: MerchantFormValues;
}) {
  const t = useTranslations("Admin.merchants");
  const tc = useTranslations("Admin.common");
  const router = useRouter();
  const { pending, run } = useAdminAction();
  const [v, setV] = useState<MerchantFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof MerchantFormValues>(key: K, value: MerchantFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const setSel = (key: keyof MerchantFormValues["adapter"]["selectors"], value: string) =>
    setV((p) => ({
      ...p,
      adapter: { ...p.adapter, selectors: { ...p.adapter.selectors, [key]: value } },
    }));
  const setSeller = (key: keyof MerchantFormValues["adapter"]["sellerRule"], value: string) =>
    setV((p) => ({
      ...p,
      adapter: { ...p.adapter, sellerRule: { ...p.adapter.sellerRule, [key]: value } },
    }));
  const setAdapter = (key: "apiEndpoint" | "throttleMs" | "maxConcurrency", value: string) =>
    setV((p) => ({ ...p, adapter: { ...p.adapter, [key]: value } }));

  const e = (key: string) => (errors[key] ? t(`form.errors.${errors[key]}` as never) : undefined);

  function validate(): boolean {
    const found: Errors = {};
    const parsed = merchantValuesSchema.safeParse(v);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !found[key]) found[key] = key;
      }
    }
    const merged = mergeAdapterConfig(v.adapter, v.overrides);
    if (!merged.ok) {
      const m = /^(throttleMs|maxConcurrency)/.exec(merged.error);
      if (m) found[m[1]!] = m[1]!;
      else if (merged.error.startsWith("Other overrides")) found.overrides = "overrides";
      else found.adapter = "adapter";
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (merchantId) {
      run(() => updateMerchant({ id: merchantId, values: v }), { success: t("toasts.saved") });
    } else {
      run(() => createMerchant(v), {
        success: t("toasts.created"),
        onSuccess: (data) => router.push(`/admin/merchants/${data.id}`),
      });
    }
  }

  const f = (k: string) => t(`form.fields.${k}` as never);

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <Section title={t("form.sections.general")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={f("name")}
            value={v.name}
            onChange={(x) => set("name", x)}
            error={e("name")}
            required
          />
          <TextField
            label={f("slug")}
            hint={f("slugHint")}
            value={v.slug}
            onChange={(x) => set("slug", x)}
            error={e("slug")}
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label={f("country")}
            hint={f("countryHint")}
            value={v.country}
            onChange={(x) => set("country", x)}
            error={e("country")}
            maxLength={2}
          />
          <TextField
            label={f("currency")}
            hint={f("currencyHint")}
            value={v.currency}
            onChange={(x) => set("currency", x.toUpperCase())}
            error={e("currency")}
            maxLength={3}
            required
          />
          <div className="grid gap-1.5">
            <ColorField
              label={f("color")}
              hint={f("colorHint")}
              value={v.color}
              onChange={(x) => set("color", x)}
              error={e("color")}
            />
          </div>
        </div>
        <NotesField label={f("notes")} value={v.notes} onChange={(x) => set("notes", x)} />
      </Section>

      <Section title={t("form.sections.shop")}>
        <TextField
          label={f("baseUrl")}
          value={v.baseUrl}
          onChange={(x) => set("baseUrl", x)}
          error={e("baseUrl")}
          type="url"
          inputMode="url"
          required
        />
        <TextField
          label={f("searchTemplate")}
          hint={f("searchTemplateHint")}
          value={v.searchTemplate}
          onChange={(x) => set("searchTemplate", x)}
          error={e("searchTemplate")}
          inputMode="url"
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={f("shipping")}
            value={v.shipping}
            onChange={(x) => set("shipping", x)}
            error={e("shipping")}
            inputMode="decimal"
            required
          />
          <TextField
            label={f("freeShippingOver")}
            hint={f("freeShippingOverHint")}
            value={v.freeShippingOver}
            onChange={(x) => set("freeShippingOver", x)}
            error={e("freeShippingOver")}
            inputMode="decimal"
          />
        </div>
      </Section>

      <Section title={t("form.sections.flags")}>
        <SwitchField
          label={f("enabled")}
          hint={f("enabledHint")}
          checked={v.enabled}
          onChange={(x) => set("enabled", x)}
        />
        <SwitchField
          label={f("visibleToUsers")}
          hint={f("visibleToUsersHint")}
          checked={v.visibleToUsers}
          onChange={(x) => set("visibleToUsers", x)}
        />
        <SwitchField
          label={f("ownOnly")}
          hint={f("ownOnlyHint")}
          checked={v.ownOnly}
          onChange={(x) => set("ownOnly", x)}
        />
        <SwitchField
          label={f("needsBrowser")}
          hint={f("needsBrowserHint")}
          checked={v.needsBrowser}
          onChange={(x) => set("needsBrowser", x)}
        />
      </Section>

      <Section title={t("form.sections.adapter")}>
        {e("adapter") && <p className="text-destructive text-sm">{e("adapter")}</p>}
        <h3 className="text-sm font-medium">{t("form.sections.selectors")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["item", "selItem"],
              ["title", "selTitle"],
              ["price", "selPrice"],
              ["url", "selUrl"],
              ["stock", "selStock"],
              ["image", "selImage"],
            ] as const
          ).map(([key, label]) => (
            <TextField
              key={key}
              label={f(label)}
              value={v.adapter.selectors[key]}
              onChange={(x) => setSel(key, x)}
              spellCheck={false}
              className="font-mono"
            />
          ))}
        </div>
        <TextField
          label={f("apiEndpoint")}
          hint={f("apiEndpointHint")}
          value={v.adapter.apiEndpoint}
          onChange={(x) => setAdapter("apiEndpoint", x)}
          spellCheck={false}
        />
        <h3 className="text-sm font-medium">{t("form.sections.sellerRule")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={f("ownNames")}
            hint={f("ownNamesHint")}
            value={v.adapter.sellerRule.ownNames}
            onChange={(x) => setSeller("ownNames", x)}
          />
          <TextField
            label={f("sellerSelector")}
            value={v.adapter.sellerRule.sellerSelector}
            onChange={(x) => setSeller("sellerSelector", x)}
            spellCheck={false}
          />
          <TextField
            label={f("thirdPartyMarkers")}
            hint={f("thirdPartyMarkersHint")}
            value={v.adapter.sellerRule.thirdPartyMarkers}
            onChange={(x) => setSeller("thirdPartyMarkers", x)}
            spellCheck={false}
          />
          <TextField
            label={f("urlParam")}
            value={v.adapter.sellerRule.urlParam}
            onChange={(x) => setSeller("urlParam", x)}
            spellCheck={false}
          />
          <TextField
            label={f("mustContain")}
            value={v.adapter.sellerRule.mustContain}
            onChange={(x) => setSeller("mustContain", x)}
          />
        </div>
        <h3 className="text-sm font-medium">{t("form.sections.limits")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={f("throttleMs")}
            hint={f("throttleMsHint")}
            value={v.adapter.throttleMs}
            onChange={(x) => setAdapter("throttleMs", x)}
            error={e("throttleMs")}
            inputMode="numeric"
          />
          <TextField
            label={f("maxConcurrency")}
            hint={f("maxConcurrencyHint")}
            value={v.adapter.maxConcurrency}
            onChange={(x) => setAdapter("maxConcurrency", x)}
            error={e("maxConcurrency")}
            inputMode="numeric"
          />
        </div>
        <OverridesField
          label={f("overrides")}
          hint={f("overridesHint")}
          error={e("overrides")}
          value={v.overrides}
          onChange={(x) => set("overrides", x)}
        />
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? tc("saving") : merchantId ? tc("save") : tc("create")}
        </Button>
        {merchantId && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={pending}>
                <Trash2 aria-hidden />
                {t("delete.button")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("delete.title", { name: merchantName ?? v.name })}
                </AlertDialogTitle>
                <AlertDialogDescription>{t("delete.body")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    run(() => deleteMerchant({ id: merchantId }), {
                      success: t("toasts.deleted"),
                      onSuccess: () => router.push("/admin/merchants"),
                    })
                  }
                >
                  {t("delete.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </form>
  );
}

function NotesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} onChange={(ev) => onChange(ev.target.value)} rows={3} />
    </div>
  );
}

function OverridesField({
  label,
  hint,
  error,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        rows={6}
        spellCheck={false}
        className="font-mono text-xs"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-d`}
      />
      <p
        id={`${id}-d`}
        className={error ? "text-destructive text-sm" : "text-muted-foreground text-xs"}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

function ColorField({
  label,
  hint,
  error,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value.trim());
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-2">
      <TextField
        label={label}
        hint={hint}
        value={value}
        onChange={onChange}
        error={error}
        placeholder="#1a73e8"
        spellCheck={false}
      />
      <span
        aria-hidden
        className="bg-muted mt-[1.625rem] size-8 rounded-[6px] border"
        style={valid ? { backgroundColor: value.trim() } : undefined}
      />
    </div>
  );
}
