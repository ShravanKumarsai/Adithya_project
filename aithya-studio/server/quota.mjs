const reserveSQL =
  "INSERT INTO planning_rate(account_id,day,attempts) VALUES(?,?,1) ON CONFLICT(account_id,day) DO UPDATE SET attempts=planning_rate.attempts+1 WHERE planning_rate.attempts<?";
const refundSQL =
  "UPDATE planning_rate SET attempts=attempts-1 WHERE account_id=? AND day=? AND attempts>0";

export const dailyLimits = {
  plan: 12,
  scanUser: 6,
  scanSite: 80,
  assistUser: 15,
  assistProject: 50,
  assistSite: 120,
};

export function quotaReservations(db, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const reset = new Date(day + "T00:00:00Z");
  reset.setUTCDate(reset.getUTCDate() + 1);
  const keys = [];
  return {
    async reserve(account, limit) {
      const { meta } = await db
        .prepare(reserveSQL)
        .bind(account, day, limit)
        .run();
      if (meta.changes) {
        keys.push(account);
        return true;
      }
      return false;
    },
    exceeded(error, limit) {
      return {
        error,
        code: "daily_quota_exceeded",
        limit,
        used: limit,
        resetsAt: reset.toISOString(),
      };
    },
    commit() {
      keys.length = 0;
    },
    async refund() {
      const results = await Promise.allSettled(
        keys
          .splice(0)
          .map(async (account) =>
            db.prepare(refundSQL).bind(account, day).run(),
          ),
      );
      if (results.some((entry) => entry.status === "rejected"))
        console.warn("studio_quota_refund_failed");
    },
  };
}
