import type { LinkRenderer } from "@wlbp/ui-foundation";
import Link from "next/link";

/** Next's optional event props require omission rather than explicit undefined. */
export const renderOperatorLink: LinkRenderer = ({
  onClick,
  onMouseEnter,
  onTouchStart,
  ...props
}) => (
  <Link
    {...props}
    {...(onClick !== undefined ? { onClick } : {})}
    {...(onMouseEnter !== undefined ? { onMouseEnter } : {})}
    {...(onTouchStart !== undefined ? { onTouchStart } : {})}
  />
);
