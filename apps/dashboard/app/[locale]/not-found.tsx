import Link from "next/link";
import { getDashboardMessage } from "../_lib/copy";

export default function NotFound() {
  return (
    <main className="not-found" dir="auto">
      <p>404</p>
      <h1>
        <span lang="en">{getDashboardMessage("en", "notFoundTitle")}</span>
        <span aria-hidden="true"> · </span>
        <span lang="ar">{getDashboardMessage("ar", "notFoundTitle")}</span>
      </h1>
      <div>
        <Link href="/en" lang="en">
          {getDashboardMessage("en", "returnHome")}
        </Link>
        <Link href="/ar" lang="ar">
          {getDashboardMessage("ar", "returnHome")}
        </Link>
      </div>
    </main>
  );
}
