/** A labelled, required native select for forms and dialogs. */
export function SelectField({
  name,
  label,
  options,
  value,
  required = true,
}: {
  name: string;
  label: string;
  options: readonly (readonly [value: string, label: string])[];
  value?: string | undefined;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value} required={required}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
