"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Slot } from "radix-ui";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
  type ControllerProps,
  type DefaultValues,
  type FieldPath,
  type FieldValues,
  type Path,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import type { z } from "zod";

import type { ActionResult } from "../forms/action-result.js";
import { formErrorMessage, type FormLocale } from "../forms/messages.js";
import { cn } from "../lib/cn.js";
import { Label } from "./form-controls.js";

/**
 * React Hook Form + Zod, shadcn-style. One schema validates in the browser
 * (here) and again inside the server action (parseActionInput).
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  options: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, "resolver"> & {
    defaultValues?: DefaultValues<z.input<S>>;
  } = {},
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  return useForm<z.input<S>, unknown, z.output<S>>({
    mode: "onTouched",
    ...options,
    // The resolver's generics are the schema's own; the cast only bridges RHF's variance.
    resolver: zodResolver(schema as never) as never,
  });
}

/** Pushes a failed server ActionResult's field errors into the form. */
export function applyActionErrors<T extends FieldValues>(
  form: UseFormReturn<T, unknown, unknown>,
  result: ActionResult<unknown>,
): void {
  if (result.ok) return;
  for (const [path, codes] of Object.entries(result.fieldErrors ?? {})) {
    if (path === "_form") continue;
    form.setError(path as Path<T>, { type: "server", message: codes[0] ?? "invalid" });
  }
}

const FormLocaleContext = createContext<{
  locale: FormLocale;
  messages?: Readonly<Record<string, string>>;
}>({ locale: "en" });

/** Form root: provides RHF context plus the locale used to render error codes. */
export function Form<T extends FieldValues>({
  form,
  locale,
  messages,
  children,
}: {
  form: UseFormReturn<T, unknown, unknown>;
  locale: FormLocale;
  /** App-specific error-code → message dictionary for this locale. */
  messages?: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  return (
    <FormLocaleContext.Provider value={{ locale, ...(messages ? { messages } : {}) }}>
      <FormProvider {...(form as UseFormReturn<FieldValues>)}>{children}</FormProvider>
    </FormLocaleContext.Provider>
  );
}

type FormFieldContextValue = { name: string };
const FormFieldContext = createContext<FormFieldContextValue | null>(null);
const FormItemContext = createContext<{
  id: string;
  hasDescription: boolean;
  setHasDescription: (value: boolean) => void;
} | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

export function useFormField() {
  const field = useContext(FormFieldContext);
  const item = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const state = useFormState({ name: field?.name ?? "" });
  if (!field || !item)
    throw new Error("useFormField must be used inside <FormField><FormItem>");
  const fieldState = getFieldState(field.name, state);
  return {
    id: item.id,
    name: field.name,
    controlId: `${item.id}-control`,
    descriptionId: `${item.id}-description`,
    messageId: `${item.id}-message`,
    hasDescription: item.hasDescription,
    setHasDescription: item.setHasDescription,
    ...fieldState,
  };
}

export function FormItem({ className, ...props }: ComponentProps<"div">) {
  const id = useId();
  const [hasDescription, setHasDescription] = useState(false);
  return (
    <FormItemContext.Provider value={{ id, hasDescription, setHasDescription }}>
      <div
        data-slot="form-item"
        className={cn("grid min-w-0 gap-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

export function FormLabel({
  className,
  required,
  children,
  ...props
}: ComponentProps<typeof Label> & { required?: boolean }) {
  const { controlId, error } = useFormField();
  return (
    <Label
      data-error={error ? "true" : undefined}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={controlId}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      ) : null}
    </Label>
  );
}

/** Wires id, aria-invalid and aria-describedby onto the single child control. */
export function FormControl(props: ComponentProps<typeof Slot.Root>) {
  const { controlId, descriptionId, messageId, error, hasDescription } = useFormField();
  // Only reference elements that exist: the description when rendered, the message when invalid.
  const describedBy =
    [hasDescription ? descriptionId : null, error ? messageId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <Slot.Root
      id={controlId}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: ComponentProps<"p">) {
  const { descriptionId, setHasDescription } = useFormField();
  useEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);
  return (
    <p
      id={descriptionId}
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Renders the field's error code in the form's language (role=alert via the live form summary). */
export function FormMessage({ className, children, ...props }: ComponentProps<"p">) {
  const { messageId, error } = useFormField();
  const { locale, messages } = useContext(FormLocaleContext);
  const body = error
    ? formErrorMessage(String(error.message ?? ""), locale, messages)
    : children;
  if (!body) return null;
  return (
    <p
      id={messageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
}

/** Form-level server error (not tied to a field), rendered in the form's language. */
export function FormRootError({
  code,
  className,
}: {
  code: string | undefined;
  className?: string;
}) {
  const { locale, messages } = useContext(FormLocaleContext);
  const message = formErrorMessage(code, locale, messages);
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm text-foreground",
        className,
      )}
    >
      {message}
    </p>
  );
}
