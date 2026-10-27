"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ZikiMark } from "@/components/icons";
import { dismissAnnouncement, undoAnnouncement, useIssuesStore } from "@/lib/store";

const NAV = [
  { href: "/issues", label: "Issues" },
  { href: "/issues/1432", label: "Live steer" },
  { href: "/proposal", label: "Proposal" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/issues") return pathname === "/issues";
  return pathname === href;
}

/** The resolve toast: what happened, a moment of whimsy, and an Undo. */
function Announcer() {
  const { announcement } = useIssuesStore();
  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(dismissAnnouncement, 6500);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  return (
    <div className="zk-toast-region" role="status" aria-live="polite">
      {announcement ? (
        <div key={announcement.id} className="zk-toast">
          <span className="zk-toast-dot" aria-hidden="true" />
          <span className="zk-toast-text">{announcement.text}</span>
          {announcement.undo ? (
            <button type="button" className="zk-toast-action" onClick={undoAnnouncement}>
              Undo
            </button>
          ) : null}
          <button type="button" className="zk-toast-close" onClick={dismissAnnouncement} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <a href="#main" className="zk-skip">Skip to content</a>
      <header className="zk-header">
        <Link href="/" className="zk-brand">
          <ZikiMark />
          <span>Ziki</span>
          <span className="zk-brand-tag">proposals</span>
        </Link>
        <nav aria-label="Prototype" className="zk-nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main" className="zk-main">
        {children}
      </main>
      <Announcer />
    </>
  );
}
