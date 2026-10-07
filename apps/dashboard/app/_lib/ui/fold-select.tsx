import type { Locale } from "@wlbp/i18n";
import {
  Field,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wlbp/ui-foundation";
import { workspaceMessage } from "../workspace-copy";

/**
 * Which instance of a repeated local time (the hour a clock falls back) the
 * operator means. Radix Select cannot submit "", so "unambiguous" submits
 * "none"; the actions read only "0" and "1", so "none" still means no choice.
 */
export function FoldSelect({
  id,
  locale,
}: {
  readonly id: string;
  readonly locale: Locale;
}) {
  return (
    <Field>
      <Label htmlFor={id}>{workspaceMessage(locale, "foldLabel")}</Label>
      <Select name="fold" defaultValue="none">
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{workspaceMessage(locale, "foldNone")}</SelectItem>
          <SelectItem value="0">{workspaceMessage(locale, "foldFirst")}</SelectItem>
          <SelectItem value="1">{workspaceMessage(locale, "foldSecond")}</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
