import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "renewal safety net",
  { minutes: 30 },
  internal.cronHandlers.safetyNetScan
);

export default crons;
