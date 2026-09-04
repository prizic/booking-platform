import Link from "next/link";
import { getClientMessage } from "../_lib/copy";

export default function NotFound() {
  return (
    <main className="not-found" dir="auto">
      <p>404</p>
      <h1>
        <span lang="en">{getClientMessage("en", "notFoundTitle")}</span>
        <span aria-hidden="true"> · </span>
        <span lang="ar">{getClientMessage("ar", "notFoundTitle")}</span>
      </h1>
      <div>
        <Link href="/en" lang="en">
          {getClientMessage("en", "returnHome")}
        </Link>
        <Link href="/ar" lang="ar">
          {getClientMessage("ar", "returnHome")}
        </Link>
      </div>
    </main>
  );
}
