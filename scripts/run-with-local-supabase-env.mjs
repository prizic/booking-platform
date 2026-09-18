import { runWithLiveBookingEnvironment } from "./live-booking-e2e.mjs";

const [hostname, command, ...args] = process.argv.slice(2);
if (hostname === undefined || command === undefined) {
  throw new Error(
    "Usage: run-with-local-supabase-env.mjs <hostname> <command> [arguments...]",
  );
}

runWithLiveBookingEnvironment(hostname, command, args);
