import Link from "next/link";
import { getAdminMessage } from "../_lib/copy";

export default function NotFound() {
  return (
    <main className="not-found" dir="auto">
      <p>
        <span lang="en">{getAdminMessage("en", "notFoundCode")}</span>
        <span aria-hidden="true"> · </span>
        <span lang="ar">{getAdminMessage("ar", "notFoundCode")}</span>
      </p>
      <h1>
        <span lang="en">{getAdminMessage("en", "notFoundTitle")}</span>
        <span aria-hidden="true"> · </span>
        <span lang="ar">{getAdminMessage("ar", "notFoundTitle")}</span>
      </h1>
      <div>
        <Link href="/en" lang="en">
          {getAdminMessage("en", "returnHome")}
        </Link>
        <Link href="/ar" lang="ar">
          {getAdminMessage("ar", "returnHome")}
        </Link>
      </div>
    </main>
  );
}
