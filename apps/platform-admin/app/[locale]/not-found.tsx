import Link from "next/link";
import { authCopy } from "../_lib/auth-copy";

export default function NotFound() {
  return (
    <main className="not-found">
      <h1>
        <span lang="en">{authCopy.notFoundTitle[0]}</span>
        <span aria-hidden="true"> · </span>
        <span lang="ar" dir="rtl">
          {authCopy.notFoundTitle[1]}
        </span>
      </h1>
      <p lang="en">{authCopy.notFoundBody[0]}</p>
      <p lang="ar" dir="rtl">
        {authCopy.notFoundBody[1]}
      </p>
      <p>
        <Link href="/en" lang="en">
          {authCopy.returnHome[0]}
        </Link>
        {" · "}
        <Link href="/ar" lang="ar">
          {authCopy.returnHome[1]}
        </Link>
      </p>
    </main>
  );
}
