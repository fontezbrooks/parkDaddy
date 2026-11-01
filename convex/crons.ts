import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("session sweep", { minutes: 30 }, internal.cronHandlers.sweep);

export default crons;
