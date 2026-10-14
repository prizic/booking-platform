"use client";
import type { PublicCatalogItemV1 } from "@wlbp/api-contracts";
import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Button,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toolbar,
  useZodForm,
} from "@wlbp/ui-foundation";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { journeyMessage } from "../../_lib/journey-copy";
import { ServiceList } from "../../_lib/ui/service-list";

const filterSchema = z.object({
  search: z.string().max(160, { error: "too_long" }),
  location: z.string(),
});
export function ServiceDiscovery({
  items,
  locale,
}: {
  readonly items: readonly PublicCatalogItemV1[];
  readonly locale: Locale;
}) {
  const message = (key: Parameters<typeof journeyMessage>[1]) =>
    journeyMessage(locale, key);
  const form = useZodForm(filterSchema, {
    defaultValues: { search: "", location: "all" },
  });
  const { search = "", location = "all" } = useWatch({ control: form.control });
  const query = search.trim().toLocaleLowerCase(locale);
  const locations = [
    ...new Map(items.map((item) => [item.locationId, item.locationName])).entries(),
  ];
  const filtered = items.filter(
    (item) =>
      (location === "all" || item.locationId === location) &&
      `${item.serviceName} ${item.serviceDescription}`
        .toLocaleLowerCase(locale)
        .includes(query),
  );
  return (
    <div className="grid gap-6">
      <Form form={form} locale={locale}>
        <form
          aria-label={message("filters")}
          noValidate
          onSubmit={form.handleSubmit(() => {})}
        >
          <Toolbar>
            <FormField
              control={form.control}
              name="search"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{message("search")}</FormLabel>
                  <FormControl>
                    <Input {...field} type="search" maxLength={160} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {locations.length > 1 ? (
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{message("location")}</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      dir={locale === "ar" ? "rtl" : "ltr"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">{message("allLocations")}</SelectItem>
                        {locations.map(([id, name]) => (
                          <SelectItem key={id} value={id}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => form.reset()}
              disabled={!query && location === "all"}
            >
              {message("clear")}
            </Button>
          </Toolbar>
        </form>
      </Form>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {message("results")}: {formatNumber(filtered.length, locale)}
      </p>
      {filtered.length ? (
        <ServiceList items={filtered} locale={locale} headingLevel={2} />
      ) : (
        <EmptyState
          title={message("noMatchTitle")}
          description={message("noMatchBody")}
          action={
            <Button variant="outline" onClick={() => form.reset()}>
              {message("clear")}
            </Button>
          }
        />
      )}
    </div>
  );
}
