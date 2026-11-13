import { useEffect, useState } from "react";
import { formatRemaining, type BanInfo } from "./net/playfab";

/** Shown to a banned player: why, and how long is left (counting down live). */
export default function BanScreen({ ban, onBack }: { ban: BanInfo; onBack: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const over = typeof ban.until === "number" && ban.until <= now;
  const remaining =
    ban.until === "never" ? "Never (permanent ban)" : ban.until === "unknown" ? "Unknown" : formatRemaining(ban.until - now);

  return (
    <main className="menu">
      <div className="card ban">
        <h1>You have been banned</h1>
        <p className="ban-line">
          <b>Reason:</b> {ban.reason}
        </p>
        <p className="ban-line">
          <b>Time Till Expire:</b> {remaining}
        </p>
        {over && <p className="ban-line">Your ban has ended. You can log in again.</p>}
        <button type="button" className="play" onClick={onBack}>
          {over ? "Log in again" : "Back to login"}
        </button>
      </div>
    </main>
  );
}
