import { createPublicReleaseIdentity } from "@wlbp/config";
import platformContract from "../../../../../platform-contract.json";

export function GET() {
  return Response.json(
    createPublicReleaseIdentity("platform-admin", platformContract, [
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.GITHUB_SHA,
    ]),
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
