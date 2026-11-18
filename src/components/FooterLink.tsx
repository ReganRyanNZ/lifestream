"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Footer link: "about" everywhere except on the about page itself, where
 *  it becomes a link back home instead. */
export function FooterLink() {
  const pathname = usePathname();
  const onAbout = pathname === "/about";
  return (
    <Link href={onAbout ? "/" : "/about"} className="hover:underline">
      {onAbout ? "home" : "about"}
    </Link>
  );
}
