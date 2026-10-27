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
  // Like the real (app) layout: the signed-in pages (here, the Issues routes) use Inter.
  const appShell = pathname.startsWith("/issues");
  return (
    <>
      <a href="#main" className="zk-skip">Skip to content</a>
      <header className="zk-header">
        <div className="zk-header-inner">
          <div className="zk-brand-group">
            <Link href="/" className="zk-brand" aria-label="Ziki proposals">
              <ZikiMark />
              <span className="zk-brand-word" aria-hidden="true">ziki</span>
            </Link>
            <span className="zk-brand-rule" aria-hidden="true" />
            <span className="zk-workspace">
              Team Zendor
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </span>
            <span className="zk-brand-tag">proposals</span>
          </div>
          <nav aria-label="Prototype" className="zk-nav">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="zk-account" title="Prototype: signed in as Stephen Okoro">
            <span className="iss-avatar is-solid" aria-hidden="true">SO</span>
            <span className="zk-account-name">Stephen Okoro</span>
          </span>
        </div>
      </header>
      <main id="main" className="zk-main" data-app-shell={appShell ? "" : undefined}>
        {children}
      </main>
      <Announcer />
    </>
  );
}
